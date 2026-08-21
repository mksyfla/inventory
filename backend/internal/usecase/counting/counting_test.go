package counting

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"testing"
	"time"

	"inventory/internal/domain/document"
	"inventory/internal/domain/stock"
	"inventory/internal/pkg/apperr"
	"inventory/internal/pkg/authz"
	"inventory/internal/pkg/docnum"
	stockuc "inventory/internal/usecase/stock"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─── Mocks ──────────────────────────────────────────────────────────────────

type mockDocs struct {
	docs             map[int64]*document.Document
	lines            map[int64][]*document.CountLine
	byKey            map[string]int64
	nextID           int64
	nextLine         int64
	statuses         []mockStatusUpdate
	managerApprovals []int64
	createdCount     []*document.CountLine
	createdDoc       []*document.Document
	errByKey         error // injected GetByIDempotencyKey failure
}

type mockStatusUpdate struct {
	id         int64
	status     document.Status
	approvedBy *int64
}

func newMockDocs() *mockDocs {
	return &mockDocs{
		docs:   map[int64]*document.Document{},
		lines:  map[int64][]*document.CountLine{},
		byKey:  map[string]int64{},
		nextID: 1,
		nextLine: 1,
	}
}

func (m *mockDocs) seed(doc *document.Document, countLines []*document.CountLine) {
	doc.ID = m.nextID
	m.nextID++
	for _, ln := range countLines {
		ln.DocumentID = doc.ID
		ln.ID = m.nextLine
		m.nextLine++
	}
	m.docs[doc.ID] = doc
	m.lines[doc.ID] = countLines
	if doc.IdempotencyKey != nil {
		m.byKey[*doc.IdempotencyKey] = doc.ID
	}
}

func (m *mockDocs) Create(ctx context.Context, doc *document.Document, lines []*document.DocumentLine) error {
	m.seed(doc, nil)
	m.createdDoc = append(m.createdDoc, doc)
	return nil
}

func (m *mockDocs) GetByID(ctx context.Context, id int64) (*document.Document, []*document.DocumentLine, error) {
	doc, ok := m.docs[id]
	if !ok {
		return nil, nil, pgx.ErrNoRows
	}
	return doc, nil, nil
}

func (m *mockDocs) GetByIDempotencyKey(ctx context.Context, key string) (*document.Document, error) {
	if m.errByKey != nil {
		return nil, m.errByKey
	}
	id, ok := m.byKey[key]
	if !ok {
		return nil, pgx.ErrNoRows
	}
	return m.docs[id], nil
}

func (m *mockDocs) UpdateStatus(ctx context.Context, id int64, status document.Status, approvedBy *int64) error {
	doc := m.docs[id]
	doc.Status = status
	if approvedBy != nil {
		doc.ApprovedBy = approvedBy
	}
	m.statuses = append(m.statuses, mockStatusUpdate{id: id, status: status, approvedBy: approvedBy})
	return nil
}

func (m *mockDocs) TransitionStatus(ctx context.Context, id int64, expected, next document.Status, approvedBy *int64) (bool, error) {
	doc := m.docs[id]
	if doc.Status != expected {
		return false, nil
	}
	doc.Status = next
	if approvedBy != nil {
		doc.ApprovedBy = approvedBy
	}
	m.statuses = append(m.statuses, mockStatusUpdate{id: id, status: next, approvedBy: approvedBy})
	return true, nil
}

func (m *mockDocs) NextSequence(ctx context.Context, docType, period string) (int64, error) {
	return int64(len(m.createdDoc) + 1), nil
}

func (m *mockDocs) CreateCountLines(ctx context.Context, lines []*document.CountLine) error {
	for _, ln := range lines {
		ln.ID = m.nextLine
		m.nextLine++
		m.lines[ln.DocumentID] = append(m.lines[ln.DocumentID], ln)
		m.createdCount = append(m.createdCount, ln)
	}
	return nil
}

func (m *mockDocs) ListCountLines(ctx context.Context, documentID int64) ([]*document.CountLine, error) {
	out := make([]*document.CountLine, 0, len(m.lines[documentID]))
	for _, ln := range m.lines[documentID] {
		cp := *ln
		out = append(out, &cp)
	}
	return out, nil
}

func (m *mockDocs) UpdateCountLineCounted(ctx context.Context, id int64, qtyCounted float64, reasonCode *string, countedBy int64) error {
	for _, ln := range m.lines {
		for _, cl := range ln {
			if cl.ID == id {
				cl.QtyCounted = &qtyCounted
				cl.ReasonCode = reasonCode
				cl.CountedBy = &countedBy
				v := qtyCounted - cl.QtySystem // mirrors the DB GENERATED column
				cl.Variance = &v
				return nil
			}
		}
	}
	return pgx.ErrNoRows
}

func (m *mockDocs) UpdateManagerApproval(ctx context.Context, id, managerID int64) error {
	m.managerApprovals = append(m.managerApprovals, managerID)
	if doc, ok := m.docs[id]; ok {
		doc.ManagerApprovedBy = &managerID
	}
	return nil
}

// ── attachment stubs (lampiran GRN) ───────────────────────────────────────
func (m *mockDocs) ListAttachments(ctx context.Context, documentID int64) ([]*document.Attachment, error) {
	return nil, nil
}

func (m *mockDocs) CreateAttachment(ctx context.Context, a *document.Attachment) error {
	return nil
}

func (m *mockDocs) GetAttachmentByID(ctx context.Context, id int64) (*document.Attachment, error) {
	return nil, nil
}

func (m *mockDocs) DeleteAttachment(ctx context.Context, id int64) error {
	return nil
}

// mockWh serves WarehouseLookup.
type mockWh struct{ warehouses map[int64]*WarehouseInfo }

func (m *mockWh) GetWarehouseByID(ctx context.Context, id int64) (*WarehouseInfo, error) {
	w, ok := m.warehouses[id]
	if !ok {
		return nil, pgx.ErrNoRows
	}
	return w, nil
}

// mockItems serves ItemLookup.
type mockItems struct{ items map[int64]*ItemInfo }

func (m *mockItems) GetItemByID(ctx context.Context, id int64) (*ItemInfo, error) {
	it, ok := m.items[id]
	if !ok {
		return nil, pgx.ErrNoRows
	}
	return it, nil
}

// mockBalances serves CountBalanceLookup.
type mockBalances struct {
	snapshots []*BalanceSnapshot
}

func (m *mockBalances) ListSnapshotBalances(ctx context.Context, warehouseID int64, zone string, itemID int64) ([]*BalanceSnapshot, error) {
	return m.snapshots, nil
}

// mockValues serves ValueLookup.
type mockValues struct{ costs map[int64]float64 }

func (m *mockValues) LastUnitCost(ctx context.Context, itemID int64) (float64, error) {
	c, ok := m.costs[itemID]
	if !ok {
		return 0, pgx.ErrNoRows
	}
	return c, nil
}

// mockStockRepo mirrors the stock tables for the posting engine.
type mockStockRepo struct {
	stock.StockRepository
	balances  map[string]*stock.StockBalance
	byID      map[int64]*stock.StockBalance
	movements []*stock.StockMovement
	nextID    int64
}

func newMockStockRepo() *mockStockRepo {
	return &mockStockRepo{
		balances: map[string]*stock.StockBalance{},
		byID:     map[int64]*stock.StockBalance{},
		nextID:   1,
	}
}

func stockKey(itemID, locationID int64, batchID *int64, status stock.StockStatus) string {
	b := int64(0)
	if batchID != nil {
		b = *batchID
	}
	return fmt.Sprintf("%d-%d-%d-%s", itemID, locationID, b, status)
}

func (m *mockStockRepo) addBalance(b *stock.StockBalance) {
	if b.ID == 0 {
		b.ID = m.nextID
		m.nextID++
	}
	m.balances[stockKey(b.ItemID, b.LocationID, b.BatchID, b.Status)] = b
	m.byID[b.ID] = b
}

func (m *mockStockRepo) GetBalancesForUpdate(ctx context.Context, keys []stock.BalanceKey) ([]*stock.StockBalance, error) {
	out := make([]*stock.StockBalance, 0, len(keys))
	for _, k := range keys {
		if b, ok := m.balances[stockKey(k.ItemID, k.LocationID, k.BatchID, k.Status)]; ok {
			out = append(out, b)
		}
	}
	return out, nil
}

func (m *mockStockRepo) UpsertBalance(ctx context.Context, b *stock.StockBalance) error {
	if b.ID == 0 {
		b.ID = m.nextID
		m.nextID++
	}
	m.balances[stockKey(b.ItemID, b.LocationID, b.BatchID, b.Status)] = b
	m.byID[b.ID] = b
	return nil
}

func (m *mockStockRepo) InsertMovement(ctx context.Context, mv *stock.StockMovement) error {
	m.movements = append(m.movements, mv)
	return nil
}

func (m *mockStockRepo) GetMovements(ctx context.Context, filter stock.MovementFilter) ([]*stock.StockMovement, error) {
	return m.movements, nil
}

func (m *mockStockRepo) UpdateBalanceReserved(ctx context.Context, id int64, delta float64) error {
	return nil
}

type inlineTx struct{}

func (inlineTx) RunInTx(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}

// snapTx rolls back the mock side-effects on error (all-or-nothing, FSD 4.1).
type snapTx struct {
	docs  *mockDocs
	stock *mockStockRepo
}

func (t snapTx) RunInTx(ctx context.Context, fn func(ctx context.Context) error) error {
	docsStatuses := len(t.docs.statuses)
	docsManager := len(t.docs.managerApprovals)
	stockMoves := len(t.stock.movements)
	savedBalances := make(map[string]*stock.StockBalance, len(t.stock.balances))
	for k, v := range t.stock.balances {
		cp := *v
		savedBalances[k] = &cp
	}
	savedByID := make(map[int64]*stock.StockBalance, len(t.stock.byID))
	for k, v := range t.stock.byID {
		cp := *v
		savedByID[k] = &cp
	}
	savedDocs := make(map[int64]*document.Document, len(t.docs.docs))
	for k, v := range t.docs.docs {
		cp := *v
		savedDocs[k] = &cp
	}

	err := fn(ctx)
	if err != nil {
		t.docs.statuses = t.docs.statuses[:docsStatuses]
		t.docs.managerApprovals = t.docs.managerApprovals[:docsManager]
		t.stock.movements = t.stock.movements[:stockMoves]
		t.stock.balances = savedBalances
		t.stock.byID = savedByID
		t.docs.docs = savedDocs
	}
	return err
}

// ─── Harness ────────────────────────────────────────────────────────────────

var testNow = time.Date(2026, time.August, 14, 10, 0, 0, 0, time.UTC)

type harness struct {
	uc       *CountingUsecase
	docs     *mockDocs
	wh       *mockWh
	items    *mockItems
	balances *mockBalances
	values   *mockValues
	stock    *mockStockRepo
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	h := &harness{
		docs:     newMockDocs(),
		wh:       &mockWh{warehouses: map[int64]*WarehouseInfo{}},
		items:    &mockItems{items: map[int64]*ItemInfo{}},
		balances: &mockBalances{},
		values:   &mockValues{costs: map[int64]float64{}},
		stock:    newMockStockRepo(),
	}
	tx := snapTx{docs: h.docs, stock: h.stock}
	posting := stockuc.NewPostingUsecase(h.stock, inlineTx{})
	h.uc = NewCountingUsecase(h.docs, h.wh, h.items, h.balances, h.values, posting, tx,
		docnum.NewGenerator(&mockSeq{}),
		WithClock(func() time.Time { return testNow }),
		WithValueThreshold(1_000_000),
	)
	return h
}

type mockSeq struct{ n int64 }

func (m *mockSeq) NextSequence(ctx context.Context, docType, period string) (int64, error) {
	m.n++
	return m.n, nil
}

func (h *harness) stdMaster() {
	h.wh.warehouses[10] = &WarehouseInfo{ID: 10, Code: "WH01", IsActive: true}
	h.items.items[1] = &ItemInfo{ID: 1, SKU: "SKU-001", BaseUom: "PCS", IsActive: true}
	h.items.items[2] = &ItemInfo{ID: 2, SKU: "SKU-002", BaseUom: "PCS", IsActive: true}
}

func isAppErr(t *testing.T, err error, code string) {
	t.Helper()
	require.Error(t, err, "expected error %s", code)
	var ae *apperr.AppError
	require.True(t, errors.As(err, &ae), "expected AppError, got %T: %v", err, err)
	assert.Equal(t, code, ae.Code)
}

// seedCount creates a CNT doc with the given snapshot lines (qty_system).
func (h *harness) seedCount(status document.Status, createdBy int64, systems map[int64]float64) (*document.Document, []*document.CountLine) {
	doc := &document.Document{
		DocNo:       "CNT/WH01/2608/00001",
		DocType:     document.DocTypeCount,
		DocDate:     testNow,
		Status:      status,
		WarehouseID: 10,
		CreatedBy:   createdBy,
	}
	// Iterate sorted keys: Go map iteration order is randomized, and line IDs
	// are assigned by slice position, which would make tests flaky.
	keys := make([]int, 0, len(systems))
	for k := range systems {
		keys = append(keys, int(k))
	}
	sort.Ints(keys)
	var lines []*document.CountLine
	for _, k := range keys {
		itemID, qty := int64(k), systems[int64(k)]
		lines = append(lines, &document.CountLine{
			ItemID:     itemID,
			LocationID: itemID + 100,
			QtySystem:  qty,
		})
	}
	h.docs.seed(doc, lines)
	return doc, lines
}

// ─── CreateCount ─────────────────────────────────────────────────────────────

func TestCreateCount_Snapshot(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	h.balances.snapshots = []*BalanceSnapshot{
		{ItemID: 1, LocationID: 101, QtyOnhand: 50},
		{ItemID: 2, LocationID: 102, QtyOnhand: 30},
	}

	doc, lines, err := h.uc.CreateCount(whCtx(10), CreateCountInput{
		WarehouseID: 10,
		CreatedBy:   5,
		Notes:       "opname zona A",
	})
	require.NoError(t, err)
	require.NotNil(t, doc)
	assert.Equal(t, document.DocTypeCount, doc.DocType)
	assert.Equal(t, document.StatusDraft, doc.Status)
	assert.Equal(t, "CNT/WH01/2608/00001", doc.DocNo)
	require.Len(t, lines, 2)
	// Blind count: qty_system captured instantly at session open
	assert.Equal(t, 50.0, lines[0].QtySystem)
	assert.Equal(t, 30.0, lines[1].QtySystem)
	assert.Nil(t, lines[0].QtyCounted, "nothing counted yet")
}

func TestCreateCount_ItemScope(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	h.balances.snapshots = []*BalanceSnapshot{
		{ItemID: 1, LocationID: 101, QtyOnhand: 50},
		{ItemID: 2, LocationID: 102, QtyOnhand: 30},
	}
	_, lines, err := h.uc.CreateCount(whCtx(10), CreateCountInput{
		WarehouseID: 10,
		CreatedBy:   5,
		ItemIDs:     []int64{2},
	})
	require.NoError(t, err)
	require.Len(t, lines, 1)
	assert.Equal(t, int64(2), lines[0].ItemID)
}

func TestCreateCount_ValidationAndIdempotency(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	ctx := whCtx(10)

	t.Run("inactive warehouse", func(t *testing.T) {
		h.wh.warehouses[99] = &WarehouseInfo{ID: 99, Code: "WHX", IsActive: false}
		_, _, err := h.uc.CreateCount(ctx, CreateCountInput{WarehouseID: 99, CreatedBy: 5})
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("idempotent replay", func(t *testing.T) {
		h.balances.snapshots = []*BalanceSnapshot{{ItemID: 1, LocationID: 101, QtyOnhand: 50}}
		in := CreateCountInput{WarehouseID: 10, CreatedBy: 5, IdempotencyKey: "7c9e6679-7425-40de-944b-e07fc1f90ae7"}
		first, _, err := h.uc.CreateCount(ctx, in)
		require.NoError(t, err)
		replay, _, err := h.uc.CreateCount(ctx, in)
		require.NoError(t, err)
		assert.Equal(t, first.ID, replay.ID)
		assert.Len(t, h.docs.createdDoc, 1, "no second document must be created")
	})
}

// ─── InputCountLines ─────────────────────────────────────────────────────────

func TestInputCountLines_ComputesVariance(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	h.seedCount(document.StatusDraft, 5, map[int64]float64{1: 100, 2: 50})

	lines, err := h.uc.InputCountLines(whCtx(10), 1, InputCountInput{
		UserID: 7,
		Lines: []InputCountLineInput{
			{CountLineID: 1, QtyCounted: 95, ReasonCode: "hilang"},
			{CountLineID: 2, QtyCounted: 55},
		},
	})
	require.NoError(t, err)
	require.Len(t, lines, 2)
	for _, ln := range lines {
		require.NotNil(t, ln.QtyCounted)
		require.NotNil(t, ln.Variance)
	}
	assert.Equal(t, -5.0, *lines[0].Variance)
	assert.Equal(t, 5.0, *lines[1].Variance)
	assert.Equal(t, "hilang", *lines[0].ReasonCode)
	require.NotNil(t, lines[0].CountedBy)
	assert.Equal(t, int64(7), *lines[0].CountedBy)
}

func TestInputCountLines_Validation(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	ctx := whCtx(10)

	t.Run("unknown count line", func(t *testing.T) {
		h.seedCount(document.StatusDraft, 5, map[int64]float64{1: 100})
		_, err := h.uc.InputCountLines(ctx, 1, InputCountInput{
			UserID: 7,
			Lines:  []InputCountLineInput{{CountLineID: 999, QtyCounted: 10}},
		})
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("negative counted qty", func(t *testing.T) {
		h.seedCount(document.StatusDraft, 5, map[int64]float64{1: 100})
		_, err := h.uc.InputCountLines(ctx, 2, InputCountInput{
			UserID: 7,
			Lines:  []InputCountLineInput{{CountLineID: 2, QtyCounted: -1}},
		})
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("session already closed", func(t *testing.T) {
		h.seedCount(document.StatusCompleted, 5, map[int64]float64{1: 100})
		_, err := h.uc.InputCountLines(ctx, 3, InputCountInput{
			UserID: 7,
			Lines:  []InputCountLineInput{{CountLineID: 3, QtyCounted: 10}},
		})
		isAppErr(t, err, "ERR_INVALID_STATE")
	})
	t.Run("wrong doc type", func(t *testing.T) {
		doc := &document.Document{DocType: document.DocTypeAdjust, Status: document.StatusDraft, WarehouseID: 10, CreatedBy: 5}
		h.docs.seed(doc, nil)
		_, err := h.uc.InputCountLines(ctx, doc.ID, InputCountInput{UserID: 7, Lines: []InputCountLineInput{{CountLineID: 1, QtyCounted: 1}}})
		isAppErr(t, err, "ERR_NOT_FOUND")
	})
}

// ─── PostCount ───────────────────────────────────────────────────────────────

func TestPostCount_LowValue(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	h.seedCount(document.StatusDraft, 5, map[int64]float64{1: 100})
	h.stock.addBalance(&stock.StockBalance{ItemID: 1, LocationID: 101, Status: stock.StatusAvailable, QtyOnhand: 100})
	h.values.costs[1] = 1000 // |−5| × 1000 = 5.000 ≤ threshold 1.000.000
	h.docs.lines[1][0].QtyCounted = f64Ptr(95)
	h.docs.lines[1][0].Variance = f64Ptr(-5)

	result, err := h.uc.PostCount(whCtx(10), 1, PostCountInput{ApproverID: 9})
	require.NoError(t, err)
	assert.Equal(t, document.StatusCompleted, result.Status)
	assert.False(t, result.NeedsManagerApproval)
	assert.Equal(t, 5.0, result.TotalVariance)
	assert.Equal(t, 5000.0, result.TotalVarianceValue)
	assert.Equal(t, 1, result.PostedAdjustmentLines)
	assert.Len(t, h.docs.managerApprovals, 0, "no manager approval needed for low value")

	// ledger: one adjustment movement with the variance
	require.Len(t, h.stock.movements, 1)
	mv := h.stock.movements[0]
	assert.Equal(t, stock.TypeAdjustment, mv.MovementType)
	assert.Equal(t, -5.0, mv.Qty)
	assert.Equal(t, "CNT/WH01/2608/00001", mv.DocNo)

	// approved_by recorded (maker 5, approver 9)
	doc, _, _ := h.docs.GetByID(whCtx(10), 1)
	assert.Equal(t, document.StatusCompleted, doc.Status)
	require.NotNil(t, doc.ApprovedBy)
	assert.Equal(t, int64(9), *doc.ApprovedBy)
}

func TestPostCount_HighValueNeedsManager(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	ctx := whCtx(10)

	setup := func() int64 {
		h.seedCount(document.StatusDraft, 5, map[int64]float64{1: 100})
		id := h.docs.nextID - 1
		h.stock.addBalance(&stock.StockBalance{ItemID: 1, LocationID: 101, Status: stock.StatusAvailable, QtyOnhand: 100})
		h.docs.lines[id][0].QtyCounted = f64Ptr(95)
		h.docs.lines[id][0].Variance = f64Ptr(-5)
		return id
	}

	t.Run("missing manager approval rejected", func(t *testing.T) {
		id := setup()
		h.values.costs[1] = 1_000_000 // |−5| × 1jt = 5jt > threshold
		_, err := h.uc.PostCount(ctx, id, PostCountInput{ApproverID: 9})
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("manager same as maker rejected", func(t *testing.T) {
		id := setup()
		manager := int64(5)
		_, err := h.uc.PostCount(ctx, id, PostCountInput{ApproverID: 9, ManagerApproverID: &manager})
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("manager same as approver rejected (tiered)", func(t *testing.T) {
		id := setup()
		manager := int64(9)
		_, err := h.uc.PostCount(ctx, id, PostCountInput{ApproverID: 9, ManagerApproverID: &manager})
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("valid tiered approval posts", func(t *testing.T) {
		id := setup()
		manager := int64(11)
		result, err := h.uc.PostCount(ctx, id, PostCountInput{ApproverID: 9, ManagerApproverID: &manager})
		require.NoError(t, err)
		assert.True(t, result.NeedsManagerApproval)
		assert.Equal(t, 1, result.PostedAdjustmentLines)
		assert.Equal(t, []int64{11}, h.docs.managerApprovals)
	})
}

func TestPostCount_Validation(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	ctx := whCtx(10)

	t.Run("incomplete count rejected", func(t *testing.T) {
		h.seedCount(document.StatusDraft, 5, map[int64]float64{1: 100})
		_, err := h.uc.PostCount(ctx, 1, PostCountInput{ApproverID: 9})
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("self approval rejected (BR-05)", func(t *testing.T) {
		h.seedCount(document.StatusDraft, 5, map[int64]float64{1: 100})
		ln := h.docs.lines[2][0]
		ln.QtyCounted = f64Ptr(100)
		ln.Variance = f64Ptr(0)
		_, err := h.uc.PostCount(ctx, 2, PostCountInput{ApproverID: 5})
		isAppErr(t, err, "ERR_SELF_APPROVAL")
	})
	t.Run("closed session rejected", func(t *testing.T) {
		h.seedCount(document.StatusCompleted, 5, map[int64]float64{1: 100})
		_, err := h.uc.PostCount(ctx, 3, PostCountInput{ApproverID: 9})
		isAppErr(t, err, "ERR_INVALID_STATE")
	})
}

func TestPostCount_ShortageRollback(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	h.seedCount(document.StatusDraft, 5, map[int64]float64{1: 100})
	// counted 50 less than system, but the balance only has 30 → posting fails
	h.docs.lines[1][0].QtyCounted = f64Ptr(50)
	h.docs.lines[1][0].Variance = f64Ptr(-50)
	h.stock.addBalance(&stock.StockBalance{ItemID: 1, LocationID: 101, Status: stock.StatusAvailable, QtyOnhand: 30})

	_, err := h.uc.PostCount(whCtx(10), 1, PostCountInput{ApproverID: 9})
	isAppErr(t, err, "ERR_STOCK_INSUFFICIENT")

	// rollback: status unchanged, no movements
	assert.Len(t, h.stock.movements, 0)
	doc, _, _ := h.docs.GetByID(whCtx(10), 1)
	assert.Equal(t, document.StatusDraft, doc.Status)
}

func f64Ptr(v float64) *float64 { return &v }

// ─── CreateAdjustment ────────────────────────────────────────────────────────

func TestCreateAdjustment_Success(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	h.stock.addBalance(&stock.StockBalance{ItemID: 1, LocationID: 101, Status: stock.StatusDamaged, QtyOnhand: 50})
	h.stock.addBalance(&stock.StockBalance{ItemID: 2, LocationID: 102, Status: stock.StatusAvailable, QtyOnhand: 20})

	doc, err := h.uc.CreateAdjustment(whCtx(10), CreateAdjustmentInput{
		WarehouseID: 10,
		ReasonCode:  "RUSAK",
		Notes:       "Barang rusak ditemukan di rak A-1 saat inspeksi harian",
		CreatedBy:   5,
		Lines: []AdjustmentLineInput{
			{ItemID: 1, LocationID: 101, Qty: -10, Status: "damaged"},
			{ItemID: 2, LocationID: 102, Qty: 5},
		},
	})
	require.NoError(t, err)
	require.NotNil(t, doc)
	assert.Equal(t, document.DocTypeAdjust, doc.DocType)
	assert.Equal(t, document.StatusCompleted, doc.Status)
	require.NotNil(t, doc.ReasonCode)
	assert.Equal(t, "RUSAK", *doc.ReasonCode)
	require.NotNil(t, doc.Notes)
	assert.Contains(t, *doc.Notes, "inspeksi")

	require.Len(t, h.stock.movements, 2)
	assert.Equal(t, stock.TypeAdjustment, h.stock.movements[0].MovementType)
	assert.Equal(t, -10.0, h.stock.movements[0].Qty)
	assert.Equal(t, stock.StatusDamaged, h.stock.movements[0].Status)
	assert.Equal(t, stock.StatusAvailable, h.stock.movements[1].Status)
	assert.Equal(t, 5.0, h.stock.movements[1].Qty)
}

func TestPostCount_WrongDocType(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	do := &document.Document{DocType: document.DocTypeAdjust, Status: document.StatusDraft, WarehouseID: 10, CreatedBy: 5}
	h.docs.seed(do, nil)

	_, err := h.uc.PostCount(whCtx(10), do.ID, PostCountInput{ApproverID: 9})
	isAppErr(t, err, "ERR_NOT_FOUND")
}

func TestPostCount_UnneededManagerApprovalAccepted(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	h.seedCount(document.StatusDraft, 5, map[int64]float64{1: 100})
	h.stock.addBalance(&stock.StockBalance{ItemID: 1, LocationID: 101, Status: stock.StatusAvailable, QtyOnhand: 100})
	h.values.costs[1] = 1000 // variance value 5.000 ≤ threshold → manager tidak wajib
	h.docs.lines[1][0].QtyCounted = f64Ptr(95)
	h.docs.lines[1][0].Variance = f64Ptr(-5)
	manager := int64(11)

	// Manager ikut diisi meski tidak wajib → tetap divalidasi (harus beda dari
	// maker dan approver) dan sesi tetap diposting.
	result, err := h.uc.PostCount(whCtx(10), 1, PostCountInput{ApproverID: 9, ManagerApproverID: &manager})
	require.NoError(t, err)
	assert.False(t, result.NeedsManagerApproval)
	assert.Equal(t, document.StatusCompleted, result.Status)
	require.Len(t, h.docs.managerApprovals, 0, "manager approval not recorded when below threshold")
}

func TestPostCount_ZeroVariancePostsNothing(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	h.seedCount(document.StatusDraft, 5, map[int64]float64{1: 100})
	h.docs.lines[1][0].QtyCounted = f64Ptr(100)
	h.docs.lines[1][0].Variance = f64Ptr(0)

	result, err := h.uc.PostCount(whCtx(10), 1, PostCountInput{ApproverID: 9})
	require.NoError(t, err)
	assert.Equal(t, document.StatusCompleted, result.Status)
	assert.Equal(t, 0, result.PostedAdjustmentLines)
	assert.Len(t, h.stock.movements, 0, "zero variance → no ledger rows")
}

func TestCreateAdjustment_ExtraValidation(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	ctx := whCtx(10)
	base := CreateAdjustmentInput{
		WarehouseID: 10,
		ReasonCode:  "RUSAK",
		Notes:       "penjelasan tertulis",
		CreatedBy:   5,
		Lines:       []AdjustmentLineInput{{ItemID: 1, LocationID: 101, Qty: -5}},
	}

	t.Run("reason code too long", func(t *testing.T) {
		in := base
		in.ReasonCode = "KODE-REASON-SANGAT-PANJANG-MELEBIHI-BATAS-30-KARAKTER"
		_, err := h.uc.CreateAdjustment(ctx, in)
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("inactive warehouse", func(t *testing.T) {
		h.wh.warehouses[10].IsActive = false
		_, err := h.uc.CreateAdjustment(ctx, base)
		isAppErr(t, err, "ERR_VALIDATION")
		h.wh.warehouses[10].IsActive = true
	})
	t.Run("location id required", func(t *testing.T) {
		in := base
		in.Lines = []AdjustmentLineInput{{ItemID: 1, LocationID: 0, Qty: -5}}
		_, err := h.uc.CreateAdjustment(ctx, in)
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("idempotency lookup failure", func(t *testing.T) {
		h.docs.errByKey = errors.New("lookup boom")
		in := base
		in.IdempotencyKey = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
		_, err := h.uc.CreateAdjustment(ctx, in)
		require.ErrorContains(t, err, "lookup boom")
		h.docs.errByKey = nil
	})
}

func TestCreateAdjustment_Validation(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	h.stock.addBalance(&stock.StockBalance{ItemID: 1, LocationID: 101, Status: stock.StatusAvailable, QtyOnhand: 50})
	ctx := whCtx(10)
	base := CreateAdjustmentInput{
		WarehouseID: 10,
		ReasonCode:  "RUSAK",
		Notes:       "penjelasan tertulis",
		CreatedBy:   5,
		Lines:       []AdjustmentLineInput{{ItemID: 1, LocationID: 101, Qty: -5}},
	}

	t.Run("reason code required", func(t *testing.T) {
		in := base
		in.ReasonCode = ""
		_, err := h.uc.CreateAdjustment(ctx, in)
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("notes required", func(t *testing.T) {
		in := base
		in.Notes = ""
		_, err := h.uc.CreateAdjustment(ctx, in)
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("zero qty rejected", func(t *testing.T) {
		in := base
		in.Lines = []AdjustmentLineInput{{ItemID: 1, LocationID: 101, Qty: 0}}
		_, err := h.uc.CreateAdjustment(ctx, in)
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("invalid status rejected", func(t *testing.T) {
		in := base
		in.Lines = []AdjustmentLineInput{{ItemID: 1, LocationID: 101, Qty: -5, Status: "staging"}}
		_, err := h.uc.CreateAdjustment(ctx, in)
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("unknown item rejected", func(t *testing.T) {
		in := base
		in.Lines = []AdjustmentLineInput{{ItemID: 999, LocationID: 101, Qty: -5}}
		_, err := h.uc.CreateAdjustment(ctx, in)
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("idempotent replay", func(t *testing.T) {
		in := base
		in.IdempotencyKey = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
		first, err := h.uc.CreateAdjustment(ctx, in)
		require.NoError(t, err)
		replay, err := h.uc.CreateAdjustment(ctx, in)
		require.NoError(t, err)
		assert.Equal(t, first.ID, replay.ID)
		assert.Len(t, h.docs.createdDoc, 1, "no second document must be created")
	})
}

// whCtx attaches a warehouse scope to a bare context so transition methods
// pass the C-02 cross-warehouse guard (authz.AssertDocInWarehouse). Every count
// session / adjustment seeded by these tests lives in warehouse 10.
func whCtx(whID int64) context.Context {
	return authz.WithWarehouseID(context.Background(), whID)
}
