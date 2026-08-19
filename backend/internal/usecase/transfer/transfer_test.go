package transfer

import (
	"context"
	"errors"
	"fmt"
	"net/netip"
	"testing"
	"time"

	"inventory/internal/domain/document"
	"inventory/internal/domain/stock"
	"inventory/internal/pkg/apperr"
	"inventory/internal/pkg/docnum"
	stockuc "inventory/internal/usecase/stock"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─── Mocks ──────────────────────────────────────────────────────────────────

var IP = netip.MustParseAddr("127.0.0.1")

type mockDocs struct {
	docs       map[int64]*document.Document
	lines      map[int64][]*document.DocumentLine
	byKey      map[string]int64
	receipts   map[int64][]*document.TransferReceipt
	nextID     int64
	nextLine   int64
	nextRec    int64
	statuses   []mockStatusUpdate
	createdRec []*document.TransferReceipt
	createdDoc []*document.Document
}

type mockStatusUpdate struct {
	id         int64
	status     document.Status
	approvedBy *int64
}

func newMockDocs() *mockDocs {
	return &mockDocs{
		docs:     map[int64]*document.Document{},
		lines:    map[int64][]*document.DocumentLine{},
		byKey:    map[string]int64{},
		receipts: map[int64][]*document.TransferReceipt{},
		nextID:   1,
		nextLine: 1,
		nextRec:  1,
	}
}

func (m *mockDocs) seed(doc *document.Document, lines []*document.DocumentLine) {
	doc.ID = m.nextID
	m.nextID++
	for _, ln := range lines {
		ln.DocumentID = doc.ID
		ln.ID = m.nextLine
		m.nextLine++
	}
	m.docs[doc.ID] = doc
	m.lines[doc.ID] = lines
	if doc.IdempotencyKey != nil {
		m.byKey[*doc.IdempotencyKey] = doc.ID
	}
}

func (m *mockDocs) Create(ctx context.Context, doc *document.Document, lines []*document.DocumentLine) error {
	m.seed(doc, lines)
	m.createdDoc = append(m.createdDoc, doc)
	return nil
}

func (m *mockDocs) GetByID(ctx context.Context, id int64) (*document.Document, []*document.DocumentLine, error) {
	doc, ok := m.docs[id]
	if !ok {
		return nil, nil, pgx.ErrNoRows
	}
	return doc, m.lines[id], nil
}

func (m *mockDocs) GetByIDempotencyKey(ctx context.Context, key string) (*document.Document, error) {
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

func (m *mockDocs) NextSequence(ctx context.Context, docType, period string) (int64, error) {
	return int64(len(m.createdDoc) + 1), nil
}

func (m *mockDocs) CreateTransferReceipt(ctx context.Context, rec *document.TransferReceipt) error {
	rec.ID = m.nextRec
	m.nextRec++
	rec.Variance = rec.QtyReceived - rec.QtySent
	m.receipts[rec.DocumentID] = append(m.receipts[rec.DocumentID], rec)
	m.createdRec = append(m.createdRec, rec)
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

// mockItems serves ItemLookup.
type mockItems struct {
	items map[int64]*ItemInfo
	uoms  map[int64]map[string]float64
}

func (m *mockItems) GetItemByID(ctx context.Context, id int64) (*ItemInfo, error) {
	it, ok := m.items[id]
	if !ok {
		return nil, pgx.ErrNoRows
	}
	return it, nil
}

func (m *mockItems) UomConvFactor(ctx context.Context, itemID int64, uom string) (float64, error) {
	if f, ok := m.uoms[itemID][uom]; ok {
		return f, nil
	}
	return 0, pgx.ErrNoRows
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

// mockLocs serves LocationLookup.
type mockLocs struct {
	byID    map[int64]*LocationInfo
	transit map[int64]*LocationInfo
}

func (m *mockLocs) GetLocationByID(ctx context.Context, id int64) (*LocationInfo, error) {
	l, ok := m.byID[id]
	if !ok {
		return nil, pgx.ErrNoRows
	}
	return l, nil
}

func (m *mockLocs) GetTransitLocation(ctx context.Context, warehouseID int64) (*LocationInfo, error) {
	l, ok := m.transit[warehouseID]
	if !ok {
		return nil, pgx.ErrNoRows
	}
	return l, nil
}

// mockCands serves CandidateLookup; the reserve is recorded per candidate.
type mockCands struct {
	byItem map[int64][]*Candidate
}

func (m *mockCands) LockCandidates(ctx context.Context, itemID, warehouseID int64) ([]*Candidate, error) {
	return m.byItem[itemID], nil
}

// mockAudit serves AuditLogWriter.
type mockAudit struct {
	logs []mockAuditLog
}

type mockAuditLog struct {
	userID   int64
	action   string
	entity   string
	entityID int64
	payload  []byte
}

func (m *mockAudit) InsertAuditLog(ctx context.Context, userID int64, action, entity string, entityID int64, newValue []byte, ipAddr *netip.Addr) error {
	m.logs = append(m.logs, mockAuditLog{userID: userID, action: action, entity: entity, entityID: entityID, payload: newValue})
	return nil
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
	docsRec := len(t.docs.createdRec)
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

	err := fn(ctx)
	if err != nil {
		t.docs.statuses = t.docs.statuses[:docsStatuses]
		t.docs.createdRec = t.docs.createdRec[:docsRec]
		t.stock.movements = t.stock.movements[:stockMoves]
		t.stock.balances = savedBalances
		t.stock.byID = savedByID
	}
	return err
}

// ─── Harness ────────────────────────────────────────────────────────────────

var testNow = time.Date(2026, time.August, 14, 10, 0, 0, 0, time.UTC)

type harness struct {
	uc    *TransferUsecase
	docs  *mockDocs
	items *mockItems
	wh    *mockWh
	locs  *mockLocs
	cands *mockCands
	audit *mockAudit
	stock *mockStockRepo
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	h := &harness{
		docs:  newMockDocs(),
		items: &mockItems{items: map[int64]*ItemInfo{}, uoms: map[int64]map[string]float64{}},
		wh:    &mockWh{warehouses: map[int64]*WarehouseInfo{}},
		locs:  &mockLocs{byID: map[int64]*LocationInfo{}, transit: map[int64]*LocationInfo{}},
		cands: &mockCands{byItem: map[int64][]*Candidate{}},
		audit: &mockAudit{},
		stock: newMockStockRepo(),
	}
	tx := snapTx{docs: h.docs, stock: h.stock}
	posting := stockuc.NewPostingUsecase(h.stock, inlineTx{})
	h.uc = NewTransferUsecase(h.docs, h.items, h.wh, h.locs, h.cands, posting, tx,
		docnum.NewGenerator(&mockSeq{}), h.audit,
		WithClock(func() time.Time { return testNow }))
	return h
}

type mockSeq struct{ n int64 }

func (m *mockSeq) NextSequence(ctx context.Context, docType, period string) (int64, error) {
	m.n++
	return m.n, nil
}

func (h *harness) stdMaster() {
	h.items.items[1] = &ItemInfo{ID: 1, SKU: "SKU-001", BaseUom: "PCS", IsActive: true}
	h.items.items[2] = &ItemInfo{ID: 2, SKU: "SKU-002", BaseUom: "PCS", IsBatch: true, IsActive: true}
	h.items.uoms[1] = map[string]float64{"PCS": 1, "BOX": 24}
	h.items.uoms[2] = map[string]float64{"PCS": 1}
	h.wh.warehouses[10] = &WarehouseInfo{ID: 10, Code: "WH01", IsActive: true}
	h.wh.warehouses[20] = &WarehouseInfo{ID: 20, Code: "WH02", IsActive: true}
	h.wh.warehouses[30] = &WarehouseInfo{ID: 30, Code: "WH99", IsActive: false}
	h.locs.transit[20] = &LocationInfo{ID: 900, WarehouseID: 20, Code: "TRS-01", LocType: "transit", IsActive: true}
	h.locs.byID[901] = &LocationInfo{ID: 901, WarehouseID: 20, Code: "PK-20-01", LocType: "pick", IsActive: true}
	h.locs.byID[902] = &LocationInfo{ID: 902, WarehouseID: 10, Code: "PK-10-01", LocType: "pick", IsActive: true}
}

// seedTransfer creates a TRF doc in the given state.
func (h *harness) seedTransfer(status document.Status, createdBy int64, dest *int64) (*document.Document, []*document.DocumentLine) {
	doc := &document.Document{
		DocNo:           "TRF/WH01/2608/00001",
		DocType:         document.DocTypeTransfer,
		DocDate:         testNow,
		Status:          status,
		WarehouseID:     10,
		DestWarehouseID: dest,
		CreatedBy:       createdBy,
	}
	lines := []*document.DocumentLine{
		{LineNo: 1, ItemID: 1, Uom: "PCS", ConvFactor: 1, QtyRequest: 100, Status: "available"},
	}
	h.docs.seed(doc, lines)
	return doc, lines
}

func isAppErr(t *testing.T, err error, code string) {
	t.Helper()
	require.Error(t, err, "expected error %s", code)
	var ae *apperr.AppError
	require.True(t, errors.As(err, &ae), "expected AppError, got %T: %v", err, err)
	assert.Equal(t, code, ae.Code)
}

// ─── CreateTransfer ──────────────────────────────────────────────────────────

func TestCreateTransfer_Success(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()

	dest := int64(20)
	doc, lines, err := h.uc.CreateTransfer(context.Background(), CreateTransferInput{
		WarehouseID:     10,
		DestWarehouseID: dest,
		CreatedBy:       5,
		Notes:           "pindah stok",
		Lines:           []CreateLineInput{{ItemID: 1, Qty: 10, Uom: "BOX"}}, // 10 BOX = 240 PCS
	})
	require.NoError(t, err)
	require.NotNil(t, doc)
	assert.Equal(t, document.DocTypeTransfer, doc.DocType)
	assert.Equal(t, document.StatusDraft, doc.Status)
	assert.Equal(t, "TRF/WH01/2608/00001", doc.DocNo)
	require.NotNil(t, doc.DestWarehouseID)
	assert.Equal(t, int64(20), *doc.DestWarehouseID)
	require.Len(t, lines, 1)
	assert.Equal(t, 10.0, lines[0].QtyRequest)
	assert.Equal(t, 24.0, lines[0].ConvFactor)
}

func TestCreateTransfer_Validation(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	ctx := context.Background()

	t.Run("empty lines", func(t *testing.T) {
		_, _, err := h.uc.CreateTransfer(ctx, CreateTransferInput{
			WarehouseID: 10, DestWarehouseID: 20, CreatedBy: 5,
		})
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("missing dest", func(t *testing.T) {
		_, _, err := h.uc.CreateTransfer(ctx, CreateTransferInput{
			WarehouseID: 10, CreatedBy: 5,
			Lines: []CreateLineInput{{ItemID: 1, Qty: 5}},
		})
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("same source and dest", func(t *testing.T) {
		_, _, err := h.uc.CreateTransfer(ctx, CreateTransferInput{
			WarehouseID: 10, DestWarehouseID: 10, CreatedBy: 5,
			Lines: []CreateLineInput{{ItemID: 1, Qty: 5}},
		})
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("unknown dest warehouse", func(t *testing.T) {
		_, _, err := h.uc.CreateTransfer(ctx, CreateTransferInput{
			WarehouseID: 10, DestWarehouseID: 999, CreatedBy: 5,
			Lines: []CreateLineInput{{ItemID: 1, Qty: 5}},
		})
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("inactive source warehouse", func(t *testing.T) {
		_, _, err := h.uc.CreateTransfer(ctx, CreateTransferInput{
			WarehouseID: 30, DestWarehouseID: 20, CreatedBy: 5,
			Lines: []CreateLineInput{{ItemID: 1, Qty: 5}},
		})
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("unknown item", func(t *testing.T) {
		_, _, err := h.uc.CreateTransfer(ctx, CreateTransferInput{
			WarehouseID: 10, DestWarehouseID: 20, CreatedBy: 5,
			Lines: []CreateLineInput{{ItemID: 999, Qty: 5}},
		})
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("zero qty", func(t *testing.T) {
		_, _, err := h.uc.CreateTransfer(ctx, CreateTransferInput{
			WarehouseID: 10, DestWarehouseID: 20, CreatedBy: 5,
			Lines: []CreateLineInput{{ItemID: 1, Qty: 0}},
		})
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("unknown uom", func(t *testing.T) {
		_, _, err := h.uc.CreateTransfer(ctx, CreateTransferInput{
			WarehouseID: 10, DestWarehouseID: 20, CreatedBy: 5,
			Lines: []CreateLineInput{{ItemID: 1, Qty: 5, Uom: "PALET"}},
		})
		isAppErr(t, err, "ERR_VALIDATION")
	})
}

func TestCreateTransfer_Idempotent(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	ctx := context.Background()

	in := CreateTransferInput{
		WarehouseID:     10,
		DestWarehouseID: 20,
		CreatedBy:       5,
		IdempotencyKey:  "3f2b7c9e-1111-4222-8333-444455556666",
		Lines:           []CreateLineInput{{ItemID: 1, Qty: 5}},
	}
	first, _, err := h.uc.CreateTransfer(ctx, in)
	require.NoError(t, err)

	replay, _, err := h.uc.CreateTransfer(ctx, in)
	require.NoError(t, err)
	assert.Equal(t, first.ID, replay.ID)
	assert.Len(t, h.docs.createdDoc, 1, "no second document must be created")
}

// ─── Submit / Approve ────────────────────────────────────────────────────────

func TestSubmitTransfer(t *testing.T) {
	h := newHarness(t)
	dest := int64(20)
	h.seedTransfer(document.StatusDraft, 5, &dest)
	ctx := context.Background()

	require.NoError(t, h.uc.SubmitTransfer(ctx, 1))
	doc, _, _ := h.docs.GetByID(ctx, 1)
	assert.Equal(t, document.StatusSubmitted, doc.Status)

	// wrong doc type
	other := &document.Document{DocType: document.DocTypeDO, Status: document.StatusDraft, CreatedBy: 5}
	h.docs.seed(other, nil)
	isAppErr(t, h.uc.SubmitTransfer(ctx, other.ID), "ERR_NOT_FOUND")

	// invalid transition (draft → submitted again is fine; completed is not reachable)
	done := &document.Document{DocType: document.DocTypeTransfer, Status: document.StatusCompleted, CreatedBy: 5}
	h.docs.seed(done, nil)
	isAppErr(t, h.uc.SubmitTransfer(ctx, done.ID), "ERR_INVALID_STATE")
}

func TestApproveTransfer_MakerChecker(t *testing.T) {
	h := newHarness(t)
	dest := int64(20)
	h.seedTransfer(document.StatusSubmitted, 5, &dest)
	ctx := context.Background()

	// self-approval rejected (BR-05)
	isAppErr(t, h.uc.ApproveTransfer(ctx, 1, 5), "ERR_SELF_APPROVAL")

	// valid approval
	require.NoError(t, h.uc.ApproveTransfer(ctx, 1, 9))
	doc, _, _ := h.docs.GetByID(ctx, 1)
	assert.Equal(t, document.StatusApproved, doc.Status)
	require.NotNil(t, doc.ApprovedBy)
	assert.Equal(t, int64(9), *doc.ApprovedBy)
}

// ─── SendTransfer ────────────────────────────────────────────────────────────

func TestSendTransfer_Success(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	dest := int64(20)
	h.seedTransfer(document.StatusApproved, 5, &dest)
	h.stock.addBalance(&stock.StockBalance{ItemID: 1, LocationID: 100, Status: stock.StatusAvailable, QtyOnhand: 250})
	h.cands.byItem[1] = []*Candidate{
		{BalanceID: 1, ItemID: 1, LocationID: 100, QtyFree: 250},
	}

	status, err := h.uc.SendTransfer(context.Background(), 1, 7)
	require.NoError(t, err)
	assert.Equal(t, document.StatusInProgress, status)

	// Ledger: transfer_out −100 @ source, transfer_in +100 @ dest transit (in_transit)
	require.Len(t, h.stock.movements, 2)
	out := h.stock.movements[0]
	assert.Equal(t, stock.TypeTransferOut, out.MovementType)
	assert.Equal(t, -100.0, out.Qty)
	assert.Equal(t, stock.StatusAvailable, out.Status)
	assert.Equal(t, int64(100), out.LocationID)
	assert.Equal(t, "TRF/WH01/2608/00001", out.DocNo)

	in := h.stock.movements[1]
	assert.Equal(t, stock.TypeTransferIn, in.MovementType)
	assert.Equal(t, 100.0, in.Qty)
	assert.Equal(t, stock.StatusInTransit, in.Status)
	assert.Equal(t, int64(900), in.LocationID) // transit location of WH02

	// Balances updated
	src := h.stock.balances[stockKey(1, 100, nil, stock.StatusAvailable)]
	require.NotNil(t, src)
	assert.Equal(t, 150.0, src.QtyOnhand)
	trs := h.stock.balances[stockKey(1, 900, nil, stock.StatusInTransit)]
	require.NotNil(t, trs)
	assert.Equal(t, 100.0, trs.QtyOnhand)

	doc, _, _ := h.docs.GetByID(context.Background(), 1)
	assert.Equal(t, document.StatusInProgress, doc.Status)
}

func TestSendTransfer_InsufficientStock(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	dest := int64(20)
	h.seedTransfer(document.StatusApproved, 5, &dest)
	h.stock.addBalance(&stock.StockBalance{ItemID: 1, LocationID: 100, Status: stock.StatusAvailable, QtyOnhand: 40})
	h.cands.byItem[1] = []*Candidate{
		{BalanceID: 1, ItemID: 1, LocationID: 100, QtyFree: 40},
	}

	_, err := h.uc.SendTransfer(context.Background(), 1, 7)
	isAppErr(t, err, "ERR_STOCK_INSUFFICIENT")

	// all-or-nothing: no movements, no status change
	assert.Len(t, h.stock.movements, 0)
	doc, _, _ := h.docs.GetByID(context.Background(), 1)
	assert.Equal(t, document.StatusApproved, doc.Status)
}

func TestSendTransfer_StateAndConfig(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	ctx := context.Background()

	t.Run("draft cannot be sent", func(t *testing.T) {
		dest := int64(20)
		h.seedTransfer(document.StatusDraft, 5, &dest)
		_, err := h.uc.SendTransfer(ctx, 1, 7)
		isAppErr(t, err, "ERR_INVALID_STATE")
	})
	t.Run("no transit location configured", func(t *testing.T) {
		dest := int64(10) // warehouse 10 has no transit loc in stdMaster... need distinct doc
		doc := &document.Document{
			DocType: document.DocTypeTransfer, Status: document.StatusApproved,
			WarehouseID: 10, DestWarehouseID: &dest, CreatedBy: 5,
		}
		h.docs.seed(doc, []*document.DocumentLine{{ItemID: 1, Uom: "PCS", ConvFactor: 1, QtyRequest: 5}})
		// source has stock so we reach the transit lookup
		h.stock.addBalance(&stock.StockBalance{ItemID: 1, LocationID: 100, Status: stock.StatusAvailable, QtyOnhand: 50})
		h.cands.byItem[1] = []*Candidate{{BalanceID: 1, ItemID: 1, LocationID: 100, QtyFree: 50}}
		_, err := h.uc.SendTransfer(ctx, doc.ID, 7)
		isAppErr(t, err, "ERR_VALIDATION")
	})
}

func TestSendTransfer_BatchPreserved(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	batch := int64(500)
	dest := int64(20)
	// transfer line of batch item 2 (IsBatch)
	doc := &document.Document{
		DocNo: "TRF/WH01/2608/00001", DocType: document.DocTypeTransfer, DocDate: testNow,
		Status: document.StatusApproved, WarehouseID: 10, DestWarehouseID: &dest, CreatedBy: 5,
	}
	h.docs.seed(doc, []*document.DocumentLine{{ItemID: 2, Uom: "PCS", ConvFactor: 1, QtyRequest: 30}})
	h.stock.addBalance(&stock.StockBalance{ItemID: 2, LocationID: 100, BatchID: &batch, Status: stock.StatusAvailable, QtyOnhand: 100})
	h.cands.byItem[2] = []*Candidate{
		{BalanceID: 1, ItemID: 2, LocationID: 100, BatchID: &batch, QtyFree: 100},
	}

	status, err := h.uc.SendTransfer(context.Background(), doc.ID, 7)
	require.NoError(t, err)
	assert.Equal(t, document.StatusInProgress, status)

	// 2 movements: transfer_out @ source + transfer_in @ transit — both carry batch 500
	require.Len(t, h.stock.movements, 2)
	require.NotNil(t, h.stock.movements[0].BatchID)
	assert.Equal(t, int64(500), *h.stock.movements[0].BatchID)
	assert.Equal(t, stock.TypeTransferOut, h.stock.movements[0].MovementType)
	require.NotNil(t, h.stock.movements[1].BatchID)
	assert.Equal(t, int64(500), *h.stock.movements[1].BatchID)
	assert.Equal(t, stock.TypeTransferIn, h.stock.movements[1].MovementType)
	assert.Equal(t, 30.0, h.stock.movements[1].Qty)

	// in_transit balance keyed by batch
	trs := h.stock.balances[stockKey(2, 900, &batch, stock.StatusInTransit)]
	require.NotNil(t, trs)
	assert.Equal(t, 30.0, trs.QtyOnhand)
}

func TestReceiveTransfer_BatchManaged(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	batch := int64(500)
	dest := int64(20)
	doc := &document.Document{
		DocNo: "TRF/WH01/2608/00001", DocType: document.DocTypeTransfer, DocDate: testNow,
		Status: document.StatusInProgress, WarehouseID: 10, DestWarehouseID: &dest, CreatedBy: 5,
	}
	lines := []*document.DocumentLine{{ItemID: 2, Uom: "PCS", ConvFactor: 1, QtyRequest: 30}}
	h.docs.seed(doc, lines)
	h.stock.addBalance(&stock.StockBalance{ItemID: 2, LocationID: 900, BatchID: &batch, Status: stock.StatusInTransit, QtyOnhand: 30})

	result, err := h.uc.ReceiveTransfer(context.Background(), doc.ID, ReceiveInput{
		UserID: 7,
		Lines: []ReceiveLineInput{
			{LineID: lines[0].ID, QtyReceived: 30, LocationID: 901, BatchID: &batch},
		},
	}, &IP)
	require.NoError(t, err)
	assert.Equal(t, document.StatusCompleted, result.Status)
	assert.False(t, result.HasDiscrepancy)

	// in_transit (batch 500) → 0; bin (batch 500, available) → 30
	trs := h.stock.balances[stockKey(2, 900, &batch, stock.StatusInTransit)]
	require.NotNil(t, trs)
	assert.Equal(t, 0.0, trs.QtyOnhand)
	bin := h.stock.balances[stockKey(2, 901, &batch, stock.StatusAvailable)]
	require.NotNil(t, bin)
	assert.Equal(t, 30.0, bin.QtyOnhand)
}

// ─── ReceiveTransfer ─────────────────────────────────────────────────────────

func TestReceiveTransfer_Success(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	dest := int64(20)
	h.seedTransfer(document.StatusInProgress, 5, &dest)
	// in_transit balance at WH02 transit loc (900)
	h.stock.addBalance(&stock.StockBalance{ItemID: 1, LocationID: 900, Status: stock.StatusInTransit, QtyOnhand: 100})

	result, err := h.uc.ReceiveTransfer(context.Background(), 1, ReceiveInput{
		UserID: 7,
		Lines: []ReceiveLineInput{
			{LineID: 1, QtyReceived: 100, LocationID: 901}, // bin PK-20-01 di WH02
		},
	}, &IP)
	require.NoError(t, err)
	assert.Equal(t, document.StatusCompleted, result.Status)
	assert.False(t, result.HasDiscrepancy)
	require.Len(t, result.Receipts, 1)
	assert.Equal(t, 0.0, result.Receipts[0].Variance)
	assert.Len(t, h.audit.logs, 0, "no discrepancy → no audit log")

	// Ledger: transfer_out −100 @ transit (in_transit), transfer_in +100 @ bin (available)
	require.Len(t, h.stock.movements, 2)
	assert.Equal(t, stock.TypeTransferOut, h.stock.movements[0].MovementType)
	assert.Equal(t, -100.0, h.stock.movements[0].Qty)
	assert.Equal(t, stock.StatusInTransit, h.stock.movements[0].Status)
	assert.Equal(t, stock.TypeTransferIn, h.stock.movements[1].MovementType)
	assert.Equal(t, 100.0, h.stock.movements[1].Qty)
	assert.Equal(t, stock.StatusAvailable, h.stock.movements[1].Status)

	// Balances
	trs := h.stock.balances[stockKey(1, 900, nil, stock.StatusInTransit)]
	require.NotNil(t, trs)
	assert.Equal(t, 0.0, trs.QtyOnhand)
	bin := h.stock.balances[stockKey(1, 901, nil, stock.StatusAvailable)]
	require.NotNil(t, bin)
	assert.Equal(t, 100.0, bin.QtyOnhand)

	doc, _, _ := h.docs.GetByID(context.Background(), 1)
	assert.Equal(t, document.StatusCompleted, doc.Status)
}

func TestReceiveTransfer_ShortageDiscrepancy(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	dest := int64(20)
	h.seedTransfer(document.StatusInProgress, 5, &dest)
	h.stock.addBalance(&stock.StockBalance{ItemID: 1, LocationID: 900, Status: stock.StatusInTransit, QtyOnhand: 100})

	result, err := h.uc.ReceiveTransfer(context.Background(), 1, ReceiveInput{
		UserID: 7,
		Lines: []ReceiveLineInput{
			{LineID: 1, QtyReceived: 80, LocationID: 901, Notes: "kurang 20 pcs"},
		},
	}, &IP)
	require.NoError(t, err)
	assert.True(t, result.HasDiscrepancy)
	require.Len(t, result.Receipts, 1)
	assert.Equal(t, -20.0, result.Receipts[0].Variance)

	// durable discrepancy log written (pemicu notifikasi darurat)
	require.Len(t, h.audit.logs, 1)
	assert.Equal(t, "transfer.receive_discrepancy", h.audit.logs[0].action)
	assert.Equal(t, int64(1), h.audit.logs[0].entityID)
	assert.Contains(t, string(h.audit.logs[0].payload), `"variance":-20`)

	// only the received qty moves: transit keeps the 20 pcs shortfall
	trs := h.stock.balances[stockKey(1, 900, nil, stock.StatusInTransit)]
	require.NotNil(t, trs)
	assert.Equal(t, 20.0, trs.QtyOnhand)
	bin := h.stock.balances[stockKey(1, 901, nil, stock.StatusAvailable)]
	require.NotNil(t, bin)
	assert.Equal(t, 80.0, bin.QtyOnhand)
}

func TestReceiveTransfer_Validation(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	ctx := context.Background()
	dest := int64(20)

	t.Run("wrong status", func(t *testing.T) {
		h.seedTransfer(document.StatusApproved, 5, &dest)
		_, err := h.uc.ReceiveTransfer(ctx, 1, ReceiveInput{UserID: 7, Lines: []ReceiveLineInput{{LineID: 1, QtyReceived: 10, LocationID: 901}}}, &IP)
		isAppErr(t, err, "ERR_INVALID_STATE")
	})
	t.Run("receiving more than sent", func(t *testing.T) {
		h.seedTransfer(document.StatusInProgress, 5, &dest)
		_, err := h.uc.ReceiveTransfer(ctx, 2, ReceiveInput{UserID: 7, Lines: []ReceiveLineInput{{LineID: 3, QtyReceived: 500, LocationID: 901}}}, &IP)
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("line not in document", func(t *testing.T) {
		h.seedTransfer(document.StatusInProgress, 5, &dest)
		_, err := h.uc.ReceiveTransfer(ctx, 3, ReceiveInput{UserID: 7, Lines: []ReceiveLineInput{{LineID: 999, QtyReceived: 10, LocationID: 901}}}, &IP)
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("location outside destination warehouse", func(t *testing.T) {
		h.seedTransfer(document.StatusInProgress, 5, &dest)
		_, err := h.uc.ReceiveTransfer(ctx, 4, ReceiveInput{UserID: 7, Lines: []ReceiveLineInput{{LineID: 5, QtyReceived: 10, LocationID: 902}}}, &IP) // PK-10-01 di WH01
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("duplicate line", func(t *testing.T) {
		h.seedTransfer(document.StatusInProgress, 5, &dest)
		_, err := h.uc.ReceiveTransfer(ctx, 5, ReceiveInput{UserID: 7, Lines: []ReceiveLineInput{
			{LineID: 7, QtyReceived: 10, LocationID: 901},
			{LineID: 7, QtyReceived: 10, LocationID: 901},
		}}, &IP)
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("batch item requires batch_id", func(t *testing.T) {
		doc := &document.Document{
			DocType: document.DocTypeTransfer, Status: document.StatusInProgress,
			WarehouseID: 10, DestWarehouseID: &dest, CreatedBy: 5,
		}
		lines := []*document.DocumentLine{{ItemID: 2, Uom: "PCS", ConvFactor: 1, QtyRequest: 10}} // item 2 is batch
		h.docs.seed(doc, lines)
		_, err := h.uc.ReceiveTransfer(ctx, doc.ID, ReceiveInput{UserID: 7, Lines: []ReceiveLineInput{{LineID: lines[0].ID, QtyReceived: 10, LocationID: 901}}}, &IP)
		isAppErr(t, err, "ERR_VALIDATION")
	})
}

func TestReceiveTransfer_InsufficientInTransit(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	dest := int64(20)
	h.seedTransfer(document.StatusInProgress, 5, &dest)
	// no in_transit balance at all → posting engine shortage
	_, err := h.uc.ReceiveTransfer(context.Background(), 1, ReceiveInput{
		UserID: 7,
		Lines:  []ReceiveLineInput{{LineID: 1, QtyReceived: 10, LocationID: 901}},
	}, &IP)
	isAppErr(t, err, "ERR_STOCK_INSUFFICIENT")

	// rollback: no receipts, no status change
	assert.Len(t, h.docs.createdRec, 0)
	doc, _, _ := h.docs.GetByID(context.Background(), 1)
	assert.Equal(t, document.StatusInProgress, doc.Status)
}

func TestSubmitTransfer_WrongDocType(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	do := &document.Document{DocType: document.DocTypeDO, Status: document.StatusDraft, WarehouseID: 10, CreatedBy: 5}
	h.docs.seed(do, nil)

	err := h.uc.SubmitTransfer(context.Background(), do.ID)
	isAppErr(t, err, "ERR_NOT_FOUND")
}

func TestApproveTransfer_WrongDocType(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	do := &document.Document{DocType: document.DocTypeDO, Status: document.StatusSubmitted, WarehouseID: 10, CreatedBy: 5}
	h.docs.seed(do, nil)

	err := h.uc.ApproveTransfer(context.Background(), do.ID, 99)
	isAppErr(t, err, "ERR_NOT_FOUND")
}

func TestApproveTransfer_SelfApproval(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	dest := int64(20)
	doc, lines := h.seedTransfer(document.StatusSubmitted, 5, &dest)
	_ = lines

	err := h.uc.ApproveTransfer(context.Background(), doc.ID, 5)
	isAppErr(t, err, "ERR_SELF_APPROVAL")
}

func TestReceiveTransfer_EdgeValidation(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	ctx := context.Background()
	dest := int64(20)

	t.Run("wrong doc type", func(t *testing.T) {
		do := &document.Document{DocType: document.DocTypeDO, Status: document.StatusInProgress, WarehouseID: 10, CreatedBy: 5}
		h.docs.seed(do, nil)
		_, err := h.uc.ReceiveTransfer(ctx, do.ID, ReceiveInput{UserID: 7, Lines: []ReceiveLineInput{{LineID: 1, QtyReceived: 10, LocationID: 901}}}, &IP)
		isAppErr(t, err, "ERR_NOT_FOUND")
	})
	t.Run("no destination warehouse", func(t *testing.T) {
		doc, lines := h.seedTransfer(document.StatusInProgress, 5, nil)
		_, err := h.uc.ReceiveTransfer(ctx, doc.ID, ReceiveInput{UserID: 7, Lines: []ReceiveLineInput{{LineID: lines[0].ID, QtyReceived: 10, LocationID: 901}}}, &IP)
		isAppErr(t, err, "ERR_INVALID_STATE")
	})
	t.Run("empty lines", func(t *testing.T) {
		doc, _ := h.seedTransfer(document.StatusInProgress, 5, &dest)
		_, err := h.uc.ReceiveTransfer(ctx, doc.ID, ReceiveInput{UserID: 7}, &IP)
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("zero qty received", func(t *testing.T) {
		doc, lines := h.seedTransfer(document.StatusInProgress, 5, &dest)
		_, err := h.uc.ReceiveTransfer(ctx, doc.ID, ReceiveInput{UserID: 7, Lines: []ReceiveLineInput{{LineID: lines[0].ID, QtyReceived: 0, LocationID: 901}}}, &IP)
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("unknown location", func(t *testing.T) {
		doc, lines := h.seedTransfer(document.StatusInProgress, 5, &dest)
		_, err := h.uc.ReceiveTransfer(ctx, doc.ID, ReceiveInput{UserID: 7, Lines: []ReceiveLineInput{{LineID: lines[0].ID, QtyReceived: 10, LocationID: 999}}}, &IP)
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("inactive location", func(t *testing.T) {
		doc, lines := h.seedTransfer(document.StatusInProgress, 5, &dest)
		h.locs.byID[903] = &LocationInfo{ID: 903, WarehouseID: 20, Code: "BLK-20-01", LocType: "bulk", IsActive: false}
		_, err := h.uc.ReceiveTransfer(ctx, doc.ID, ReceiveInput{UserID: 7, Lines: []ReceiveLineInput{{LineID: lines[0].ID, QtyReceived: 10, LocationID: 903}}}, &IP)
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("invalid location type", func(t *testing.T) {
		doc, lines := h.seedTransfer(document.StatusInProgress, 5, &dest)
		h.locs.byID[904] = &LocationInfo{ID: 904, WarehouseID: 20, Code: "DAM-20-01", LocType: "damaged", IsActive: true}
		_, err := h.uc.ReceiveTransfer(ctx, doc.ID, ReceiveInput{UserID: 7, Lines: []ReceiveLineInput{{LineID: lines[0].ID, QtyReceived: 10, LocationID: 904}}}, &IP)
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("not all lines received", func(t *testing.T) {
		doc := &document.Document{DocType: document.DocTypeTransfer, Status: document.StatusInProgress, WarehouseID: 10, DestWarehouseID: &dest, CreatedBy: 5}
		lines := []*document.DocumentLine{
			{LineNo: 1, ItemID: 1, Uom: "PCS", ConvFactor: 1, QtyRequest: 10},
			{LineNo: 2, ItemID: 1, Uom: "PCS", ConvFactor: 1, QtyRequest: 10},
		}
		h.docs.seed(doc, lines)
		_, err := h.uc.ReceiveTransfer(ctx, doc.ID, ReceiveInput{UserID: 7, Lines: []ReceiveLineInput{{LineID: lines[0].ID, QtyReceived: 10, LocationID: 901}}}, &IP)
		isAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("no transit location", func(t *testing.T) {
		doc, lines := h.seedTransfer(document.StatusInProgress, 5, &dest)
		delete(h.locs.transit, 20)
		_, err := h.uc.ReceiveTransfer(ctx, doc.ID, ReceiveInput{UserID: 7, Lines: []ReceiveLineInput{{LineID: lines[0].ID, QtyReceived: 10, LocationID: 901}}}, &IP)
		isAppErr(t, err, "ERR_VALIDATION")
	})
}

func TestReceiveTransfer_DiscrepancyWithoutAuditSink(t *testing.T) {
	h := newHarness(t)
	h.stdMaster()
	dest := int64(20)
	h.seedTransfer(document.StatusInProgress, 5, &dest)
	h.stock.addBalance(&stock.StockBalance{ItemID: 1, LocationID: 900, Status: stock.StatusInTransit, QtyOnhand: 100})

	// No audit sink configured → discrepancy must not fail the receive.
	tx := snapTx{docs: h.docs, stock: h.stock}
	posting := stockuc.NewPostingUsecase(h.stock, inlineTx{})
	h.uc = NewTransferUsecase(h.docs, h.items, h.wh, h.locs, h.cands, posting, tx,
		docnum.NewGenerator(&mockSeq{}), nil,
		WithClock(func() time.Time { return testNow }))

	result, err := h.uc.ReceiveTransfer(context.Background(), 1, ReceiveInput{
		UserID: 7,
		Lines:  []ReceiveLineInput{{LineID: 1, QtyReceived: 80, LocationID: 901}},
	}, &IP)
	require.NoError(t, err)
	assert.True(t, result.HasDiscrepancy)
	assert.Equal(t, document.StatusCompleted, result.Status)
}
