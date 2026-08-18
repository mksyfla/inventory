package inbound

import (
	"context"
	"errors"
	"fmt"
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

type mockDocs struct {
	docs     map[int64]*document.Document
	lines    map[int64][]*document.DocumentLine
	nextID   int64
	nextLine int64
	byKey    map[string]int64
	statuses []mockStatusUpdate
	putaways []mockLinePutaway
	created  []*document.Document
}

type mockStatusUpdate struct {
	id        int64
	status    document.Status
	approvedBy *int64
}

type mockLinePutaway struct {
	lineID   int64
	processed float64
	location int64
}

func newMockDocs() *mockDocs {
	return &mockDocs{
		docs:   map[int64]*document.Document{},
		lines:  map[int64][]*document.DocumentLine{},
		byKey:  map[string]int64{},
		nextID: 1,
	}
}

func (m *mockDocs) seed(doc *document.Document, lines []*document.DocumentLine) {
	doc.ID = m.nextID
	m.nextID++
	for _, ln := range lines {
		ln.DocumentID = doc.ID
	}
	m.docs[doc.ID] = doc
	m.lines[doc.ID] = lines
	if doc.IdempotencyKey != nil {
		m.byKey[*doc.IdempotencyKey] = doc.ID
	}
}

func (m *mockDocs) Create(ctx context.Context, doc *document.Document, lines []*document.DocumentLine) error {
	m.seed(doc, lines)
	m.created = append(m.created, doc)
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

func (m *mockDocs) UpdateLinePutaway(ctx context.Context, lineID int64, qtyProcessed float64, locationID int64) error {
	for _, lines := range m.lines {
		for _, ln := range lines {
			if ln.ID == lineID {
				ln.QtyProcessed = qtyProcessed
				ln.LocationID = &locationID
			}
		}
	}
	m.putaways = append(m.putaways, mockLinePutaway{lineID: lineID, processed: qtyProcessed, location: locationID})
	return nil
}

// ─── Outbound-era additions (unused by inbound flows, harmless stubs) ──────

func (m *mockDocs) UpdateLineProcessed(ctx context.Context, lineID int64, qtyProcessed float64) error {
	for _, lines := range m.lines {
		for _, ln := range lines {
			if ln.ID == lineID {
				ln.QtyProcessed = qtyProcessed
			}
		}
	}
	return nil
}

func (m *mockDocs) CreateAllocations(ctx context.Context, allocations []*document.Allocation) error {
	return nil
}

func (m *mockDocs) ListAllocations(ctx context.Context, documentID int64) ([]*document.Allocation, error) {
	return nil, nil
}

func (m *mockDocs) UpdateAllocationPicked(ctx context.Context, id int64, qtyPicked float64) error {
	return nil
}

func (m *mockDocs) UpdateReasonCode(ctx context.Context, id int64, reasonCode string) error {
	return nil
}

func (m *mockDocs) GetDelivery(ctx context.Context, documentID int64) (*document.Delivery, error) {
	return nil, pgx.ErrNoRows
}

func (m *mockDocs) UpsertDelivery(ctx context.Context, d *document.Delivery) error {
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

// mockLocs serves LocationStore.
type mockLocs struct {
	staging    map[int64]*LocationInfo
	byCode     map[int64]map[string]*LocationInfo
	candidates []*PutawayCandidate
}

func (m *mockLocs) GetStaging(ctx context.Context, warehouseID int64) (*LocationInfo, error) {
	l, ok := m.staging[warehouseID]
	if !ok {
		return nil, pgx.ErrNoRows
	}
	return l, nil
}

func (m *mockLocs) GetByWarehouseCode(ctx context.Context, warehouseID int64, code string) (*LocationInfo, error) {
	l, ok := m.byCode[warehouseID][code]
	if !ok {
		return nil, pgx.ErrNoRows
	}
	return l, nil
}

func (m *mockLocs) PutawayCandidates(ctx context.Context, warehouseID int64) ([]*PutawayCandidate, error) {
	return m.candidates, nil
}

// mockBatches serves BatchStore.
type mockBatches struct {
	batches map[string]*BatchInfo
	nextID  int64
	created []*BatchInfo
}

func (m *mockBatches) GetByItemAndNo(ctx context.Context, itemID int64, batchNo string) (*BatchInfo, error) {
	b, ok := m.batches[fmt.Sprintf("%d/%s", itemID, batchNo)]
	if !ok {
		return nil, pgx.ErrNoRows
	}
	return b, nil
}

func (m *mockBatches) Create(ctx context.Context, itemID int64, batchNo string, expiry *time.Time) (*BatchInfo, error) {
	m.nextID++
	b := &BatchInfo{ID: m.nextID, ItemID: itemID, BatchNo: batchNo, ExpiryDate: expiry}
	m.batches[fmt.Sprintf("%d/%s", itemID, batchNo)] = b
	m.created = append(m.created, b)
	return b, nil
}

// mockStockRepo records posting writes; balances persist across calls like a
// real database so multi-step flows (approve then putaway) see prior state.
type mockStockRepo struct {
	stock.StockRepository
	balances   map[string]*stock.StockBalance
	lockedKeys []stock.BalanceKey
	upserts    []*stock.StockBalance
	movements  []*stock.StockMovement
}

func balanceKeyOf(k stock.BalanceKey) string {
	return fmt.Sprintf("%d-%d-%s", k.ItemID, k.LocationID, k.Status)
}

func (m *mockStockRepo) GetBalancesForUpdate(ctx context.Context, keys []stock.BalanceKey) ([]*stock.StockBalance, error) {
	m.lockedKeys = keys
	out := make([]*stock.StockBalance, 0, len(keys))
	for _, k := range keys {
		if b, ok := m.balances[balanceKeyOf(k)]; ok {
			out = append(out, b)
		}
	}
	return out, nil
}

func (m *mockStockRepo) UpsertBalance(ctx context.Context, b *stock.StockBalance) error {
	m.upserts = append(m.upserts, b)
	m.balances[balanceKeyOf(stock.BalanceKey{
		ItemID:     b.ItemID,
		LocationID: b.LocationID,
		BatchID:    b.BatchID,
		Status:     b.Status,
	})] = b
	return nil
}

func (m *mockStockRepo) InsertMovement(ctx context.Context, mv *stock.StockMovement) error {
	m.movements = append(m.movements, mv)
	return nil
}

// mockSeq is a trivial docnum.NextSeqStore.
type mockSeq struct{ n int64 }

func (m *mockSeq) NextSequence(ctx context.Context, docType, period string) (int64, error) {
	m.n++
	return m.n, nil
}

// ─── Harness ────────────────────────────────────────────────────────────────

type harness struct {
	uc      *ReceiptUsecase
	docs    *mockDocs
	items   *mockItems
	wh      *mockWh
	locs    *mockLocs
	batches *mockBatches
	stock   *mockStockRepo
	gen     *docnum.Generator
}

var testNow = time.Date(2026, time.August, 14, 10, 0, 0, 0, time.UTC)

func newHarness(t *testing.T) *harness {
	t.Helper()
	h := &harness{
		docs:    newMockDocs(),
		items:   &mockItems{items: map[int64]*ItemInfo{}, uoms: map[int64]map[string]float64{}},
		wh:      &mockWh{warehouses: map[int64]*WarehouseInfo{}},
		locs:    &mockLocs{staging: map[int64]*LocationInfo{}, byCode: map[int64]map[string]*LocationInfo{}},
		batches: &mockBatches{batches: map[string]*BatchInfo{}},
		stock:   &mockStockRepo{balances: map[string]*stock.StockBalance{}},
	}
	seq := &mockSeq{}
	h.gen = docnum.NewGenerator(seq)
	posting := stockuc.NewPostingUsecase(h.stock, &inlineTx{})
	h.uc = NewReceiptUsecase(h.docs, h.items, h.wh, h.locs, h.batches, posting, &inlineTx{}, h.gen, WithClock(func() time.Time { return testNow }))
	return h
}

type inlineTx struct{}

func (r *inlineTx) RunInTx(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}

func (h *harness) addItem(id int64, it *ItemInfo, uoms map[string]float64) {
	h.items.items[id] = it
	h.items.uoms[id] = uoms
}

func (h *harness) addStaging(whID int64, loc *LocationInfo) {
	h.locs.staging[whID] = loc
	if h.locs.byCode[whID] == nil {
		h.locs.byCode[whID] = map[string]*LocationInfo{}
	}
	h.locs.byCode[whID][loc.Code] = loc
}

func stdItems(h *harness) {
	h.addItem(1, &ItemInfo{ID: 1, SKU: "SKU-001", BaseUom: "PCS", IsBatch: true, IsExpiry: true, IsActive: true, ABCClass: "A"},
		map[string]float64{"PCS": 1, "BOX": 24})
	h.addItem(2, &ItemInfo{ID: 2, SKU: "SKU-003", BaseUom: "PCS", IsBatch: true, IsActive: true, ABCClass: "B"},
		map[string]float64{"PCS": 1})
	h.addItem(3, &ItemInfo{ID: 3, SKU: "SKU-004", BaseUom: "PCS", IsActive: true, ABCClass: "B"},
		map[string]float64{"PCS": 1})
	h.wh.warehouses[10] = &WarehouseInfo{ID: 10, Code: "WH01", IsActive: true}
	h.addStaging(10, &LocationInfo{ID: 100, WarehouseID: 10, Code: "STG-01-01", LocType: "staging"})
}

func appErrCode(err error) string {
	var ae *apperr.AppError
	if errors.As(err, &ae) {
		return ae.Code
	}
	return ""
}

func assertAppErr(t *testing.T, err error, code string) {
	t.Helper()
	require.Error(t, err)
	assert.Equal(t, code, appErrCode(err))
}

// ─── Create (6.1) ───────────────────────────────────────────────────────────

func TestCreate_ValidDraft(t *testing.T) {
	h := newHarness(t)
	stdItems(h)
	expiry := time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC)
	lines := []CreateLineInput{
		{ItemID: 1, Qty: 100, BatchNo: "B-2026-001", ExpiryDate: &expiry},
		{ItemID: 3, Qty: 50, Status: "quarantine"},
	}

	doc, createdLines, err := h.uc.Create(context.Background(), CreateInput{
		WarehouseID: 10,
		Notes:       "receiving batch 1",
		CreatedBy:   7,
		Lines:       lines,
	})
	require.NoError(t, err)

	assert.Equal(t, "GRN/WH01/2608/00001", doc.DocNo, "docnum must use warehouse code + current period")
	assert.Equal(t, document.StatusDraft, doc.Status)
	assert.Equal(t, int64(10), doc.WarehouseID)
	assert.Equal(t, int64(7), doc.CreatedBy)
	require.Len(t, createdLines, 2)
	require.NotNil(t, createdLines[0].BatchID, "batch must resolve to existing/new batch")
	assert.Equal(t, int64(1), *createdLines[0].BatchID)
	assert.Equal(t, "PCS", createdLines[0].Uom, "empty uom defaults to base uom")
	assert.Equal(t, "quarantine", createdLines[1].Status)
	assert.Nil(t, createdLines[1].BatchID, "non-batch item line keeps nil batch")
}

func TestCreate_NewBatchCreatedAndLinked(t *testing.T) {
	h := newHarness(t)
	stdItems(h)
	expiry := time.Date(2027, 3, 1, 0, 0, 0, 0, time.UTC)

	_, lines, err := h.uc.Create(context.Background(), CreateInput{
		WarehouseID: 10, CreatedBy: 7,
		Lines: []CreateLineInput{{ItemID: 1, Qty: 10, BatchNo: "FRESH-01", ExpiryDate: &expiry}},
	})
	require.NoError(t, err)
	require.Len(t, h.batches.created, 1, "missing batch must be created")
	assert.Equal(t, "FRESH-01", h.batches.created[0].BatchNo)
	require.NotNil(t, lines[0].BatchID)
	assert.Equal(t, h.batches.created[0].ID, *lines[0].BatchID)
}

func TestCreate_ExistingBatchReused(t *testing.T) {
	h := newHarness(t)
	stdItems(h)
	expiry := time.Date(2027, 2, 1, 0, 0, 0, 0, time.UTC)
	h.batches.batches["1/B-2026-001"] = &BatchInfo{ID: 9, ItemID: 1, BatchNo: "B-2026-001"}

	_, lines, err := h.uc.Create(context.Background(), CreateInput{
		WarehouseID: 10, CreatedBy: 7,
		Lines: []CreateLineInput{{ItemID: 1, Qty: 10, BatchNo: "B-2026-001", ExpiryDate: &expiry}},
	})
	require.NoError(t, err)
	assert.Empty(t, h.batches.created, "existing batch must not be re-created")
	require.NotNil(t, lines[0].BatchID)
	assert.Equal(t, int64(9), *lines[0].BatchID)
}

func TestCreate_ValidationMatrix(t *testing.T) {
	cases := []struct {
		name   string
		lines  []CreateLineInput
		field  string
	}{
		{"no lines", nil, "lines"},
		{"unknown item", []CreateLineInput{{ItemID: 999, Qty: 1}}, "lines[0].item_id"},
		{"zero qty", []CreateLineInput{{ItemID: 3, Qty: 0}}, "lines[0].qty"},
		{"negative qty", []CreateLineInput{{ItemID: 3, Qty: -5}}, "lines[0].qty"},
		{"unknown uom", []CreateLineInput{{ItemID: 3, Qty: 1, Uom: "TIN"}}, "lines[0].uom"},
		{"batch required", []CreateLineInput{{ItemID: 2, Qty: 1}}, "lines[0].batch_no"},
		{"batch forbidden", []CreateLineInput{{ItemID: 3, Qty: 1, BatchNo: "B"}}, "lines[0].batch_no"},
		{"expiry required", []CreateLineInput{{ItemID: 1, Qty: 1, BatchNo: "B"}}, "lines[0].expiry_date"},
		{"bad status", []CreateLineInput{{ItemID: 3, Qty: 1, Status: "expired"}}, "lines[0].status"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := newHarness(t)
			stdItems(h)
			_, _, err := h.uc.Create(context.Background(), CreateInput{WarehouseID: 10, CreatedBy: 1, Lines: tc.lines})
			assertAppErr(t, err, "ERR_VALIDATION")
			var ae *apperr.AppError
			require.ErrorAs(t, err, &ae)
			details, ok := ae.Details.([]apperr.ErrorDetail)
			require.True(t, ok, "validation error must carry neutral details")
			require.NotEmpty(t, details)
			assert.Equal(t, tc.field, details[0].Field)
		})
	}
}

func TestCreate_InactiveItemRejected(t *testing.T) {
	h := newHarness(t)
	stdItems(h)
	expiry := time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC)
	h.items.items[1].IsActive = false

	_, _, err := h.uc.Create(context.Background(), CreateInput{
		WarehouseID: 10, CreatedBy: 1,
		Lines: []CreateLineInput{{ItemID: 1, Qty: 1, BatchNo: "X", ExpiryDate: &expiry}},
	})
	assertAppErr(t, err, "ERR_VALIDATION")
	var ae *apperr.AppError
	require.ErrorAs(t, err, &ae)
	details, _ := ae.Details.([]apperr.ErrorDetail)
	require.NotEmpty(t, details)
	assert.Equal(t, "lines[0].item_id", details[0].Field)
}

func TestCreate_InactiveWarehouseRejected(t *testing.T) {
	h := newHarness(t)
	stdItems(h)
	h.wh.warehouses[10].IsActive = false

	_, _, err := h.uc.Create(context.Background(), CreateInput{
		WarehouseID: 10, CreatedBy: 1,
		Lines: []CreateLineInput{{ItemID: 3, Qty: 1}},
	})
	assertAppErr(t, err, "ERR_VALIDATION")
}

func TestCreate_IdempotentReplay(t *testing.T) {
	h := newHarness(t)
	stdItems(h)
	key := "5a9e6e6e-0000-4000-8000-000000000001"
	in := CreateInput{
		WarehouseID: 10, IdempotencyKey: key, CreatedBy: 7,
		Lines: []CreateLineInput{{ItemID: 3, Qty: 10}},
	}

	first, _, err := h.uc.Create(context.Background(), in)
	require.NoError(t, err)
	second, _, err := h.uc.Create(context.Background(), in)
	require.NoError(t, err)

	assert.Equal(t, first.ID, second.ID, "repeated key must return the same document (FSD 4.5)")
	assert.Len(t, h.docs.created, 1, "no second document may be created")
}

// ─── Submit (6.1) ───────────────────────────────────────────────────────────

func TestSubmit_DraftToSubmitted(t *testing.T) {
	h := newHarness(t)
	stdItems(h)
	doc, _, _ := h.uc.Create(context.Background(), CreateInput{
		WarehouseID: 10, CreatedBy: 7, Lines: []CreateLineInput{{ItemID: 3, Qty: 10}},
	})

	err := h.uc.Submit(context.Background(), doc.ID)
	require.NoError(t, err)
	require.Len(t, h.docs.statuses, 1)
	assert.Equal(t, document.StatusSubmitted, h.docs.statuses[0].status)
	assert.Nil(t, h.docs.statuses[0].approvedBy, "submit must not set approver")
}

func TestSubmit_InvalidState(t *testing.T) {
	h := newHarness(t)
	stdItems(h)
	doc, _, _ := h.uc.Create(context.Background(), CreateInput{
		WarehouseID: 10, CreatedBy: 7, Lines: []CreateLineInput{{ItemID: 3, Qty: 10}},
	})
	require.NoError(t, h.uc.Submit(context.Background(), doc.ID))

	err := h.uc.Submit(context.Background(), doc.ID)
	assertAppErr(t, err, "ERR_INVALID_STATE")
}

func TestSubmit_NotFound(t *testing.T) {
	h := newHarness(t)
	err := h.uc.Submit(context.Background(), 424242)
	require.Error(t, err)
	assert.ErrorIs(t, err, pgx.ErrNoRows)
}

// ─── Approve (6.2) ──────────────────────────────────────────────────────────

func TestApprove_PostsReceiptToStaging(t *testing.T) {
	h := newHarness(t)
	stdItems(h)
	expiry := time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC)
	doc, lines, _ := h.uc.Create(context.Background(), CreateInput{
		WarehouseID: 10, CreatedBy: 7,
		Lines: []CreateLineInput{
			{ItemID: 1, Qty: 2, Uom: "BOX", BatchNo: "B1", ExpiryDate: &expiry}, // 2 BOX × 24 = 48 PCS
			{ItemID: 3, Qty: 5},
		},
	})
	require.NoError(t, h.uc.Submit(context.Background(), doc.ID))

	err := h.uc.Approve(context.Background(), doc.ID, 8)
	require.NoError(t, err)

	require.Len(t, h.stock.movements, 2, "one receipt movement per line")
	m1, m2 := h.stock.movements[0], h.stock.movements[1]
	assert.Equal(t, stock.TypeReceipt, m1.MovementType)
	assert.Equal(t, int64(100), m1.LocationID, "receipt lands in staging")
	assert.Equal(t, 48.0, m1.Qty, "qty must be converted to base uom (FSD 4.1)")
	assert.Equal(t, lines[0].ID, m1.DocLineID)
	assert.Equal(t, int64(8), m1.CreatedBy)
	assert.Equal(t, 5.0, m2.Qty)

	require.Len(t, h.docs.statuses, 2)
	last := h.docs.statuses[1]
	assert.Equal(t, document.StatusApproved, last.status)
	require.NotNil(t, last.approvedBy, "approve must record the approver")
	assert.Equal(t, int64(8), *last.approvedBy)
}

func TestApprove_SelfApprovalRejected(t *testing.T) {
	h := newHarness(t)
	stdItems(h)
	doc, _, _ := h.uc.Create(context.Background(), CreateInput{
		WarehouseID: 10, CreatedBy: 7, Lines: []CreateLineInput{{ItemID: 3, Qty: 10}},
	})
	require.NoError(t, h.uc.Submit(context.Background(), doc.ID))

	err := h.uc.Approve(context.Background(), doc.ID, 7) // same as creator
	assertAppErr(t, err, "ERR_SELF_APPROVAL")
	assert.Empty(t, h.stock.movements, "no posting may occur on rejected approval")
}

func TestApprove_InvalidState(t *testing.T) {
	h := newHarness(t)
	stdItems(h)
	doc, _, _ := h.uc.Create(context.Background(), CreateInput{
		WarehouseID: 10, CreatedBy: 7, Lines: []CreateLineInput{{ItemID: 3, Qty: 10}},
	})

	err := h.uc.Approve(context.Background(), doc.ID, 8) // still draft
	assertAppErr(t, err, "ERR_INVALID_STATE")
}

func TestApprove_NoStagingLocation(t *testing.T) {
	h := newHarness(t)
	stdItems(h)
	doc, _, _ := h.uc.Create(context.Background(), CreateInput{
		WarehouseID: 10, CreatedBy: 7, Lines: []CreateLineInput{{ItemID: 3, Qty: 10}},
	})
	require.NoError(t, h.uc.Submit(context.Background(), doc.ID))

	delete(h.locs.staging, 10)
	err := h.uc.Approve(context.Background(), doc.ID, 8)
	assertAppErr(t, err, "ERR_NOT_FOUND")
}

// ─── SuggestPutaway (6.3) ───────────────────────────────────────────────────

func TestSuggestPutaway_ABCPrefersPickFace(t *testing.T) {
	h := newHarness(t)
	stdItems(h)
	expiry := time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC)
	doc, lines, _ := h.uc.Create(context.Background(), CreateInput{
		WarehouseID: 10, CreatedBy: 7,
		Lines: []CreateLineInput{{ItemID: 1, Qty: 100, BatchNo: "B1", ExpiryDate: &expiry}},
	})
	require.NoError(t, h.uc.Submit(context.Background(), doc.ID))
	require.NoError(t, h.uc.Approve(context.Background(), doc.ID, 8))

	h.locs.candidates = []*PutawayCandidate{
		{Location: LocationInfo{ID: 200, Code: "BLK-01-01", LocType: "bulk", PickSeq: nil}, UsedQty: 0},
		{Location: LocationInfo{ID: 201, Code: "PK-01-02", LocType: "pick", PickSeq: intPtr(2)}, UsedQty: 0},
		{Location: LocationInfo{ID: 202, Code: "PK-01-01", LocType: "pick", PickSeq: intPtr(1)}, UsedQty: 0},
	}

	sugg, err := h.uc.SuggestPutaway(context.Background(), doc.ID)
	require.NoError(t, err)
	require.Len(t, sugg, 1, "one suggestion per line with remaining qty")
	assert.Equal(t, lines[0].ID, sugg[0].LineID)
	assert.Equal(t, 100.0, sugg[0].QtyRemaining)
	require.Len(t, sugg[0].Locations, 3)
	// Class A: pick face first, then bulk; pick_seq breaks pick ties.
	assert.Equal(t, "PK-01-01", sugg[0].Locations[0].Code)
	assert.Equal(t, "PK-01-02", sugg[0].Locations[1].Code)
	assert.Equal(t, "BLK-01-01", sugg[0].Locations[2].Code)
}

func TestSuggestPutaway_CapacityFilterAndLimit(t *testing.T) {
	h := newHarness(t)
	stdItems(h)
	doc, _, _ := h.uc.Create(context.Background(), CreateInput{
		WarehouseID: 10, CreatedBy: 7, Lines: []CreateLineInput{{ItemID: 3, Qty: 200}},
	})
	require.NoError(t, h.uc.Submit(context.Background(), doc.ID))
	require.NoError(t, h.uc.Approve(context.Background(), doc.ID, 8))

	cap100 := 100.0
	h.locs.candidates = []*PutawayCandidate{
		{Location: LocationInfo{ID: 201, Code: "PK-01-01", LocType: "pick", PickSeq: intPtr(1), Capacity: &cap100}, UsedQty: 0}, // 200 > 100 → cannot fit
		{Location: LocationInfo{ID: 202, Code: "PK-01-02", LocType: "pick", PickSeq: intPtr(2)}, UsedQty: 0},
		{Location: LocationInfo{ID: 203, Code: "BLK-01-01", LocType: "bulk"}, UsedQty: 0},
		{Location: LocationInfo{ID: 204, Code: "BLK-01-02", LocType: "bulk"}, UsedQty: 0},
	}

	sugg, err := h.uc.SuggestPutaway(context.Background(), doc.ID)
	require.NoError(t, err)
	require.Len(t, sugg[0].Locations, 3, "top-3 limit, capacity-infeasible excluded")
	assert.Equal(t, "PK-01-02", sugg[0].Locations[0].Code)
	assert.Equal(t, "BLK-01-01", sugg[0].Locations[1].Code)
	assert.Equal(t, "BLK-01-02", sugg[0].Locations[2].Code)
}

func TestSuggestPutaway_SkipsFullyPutAwayLines(t *testing.T) {
	h := newHarness(t)
	stdItems(h)
	doc, _, _ := h.uc.Create(context.Background(), CreateInput{
		WarehouseID: 10, CreatedBy: 7, Lines: []CreateLineInput{{ItemID: 3, Qty: 10}},
	})
	require.NoError(t, h.uc.Submit(context.Background(), doc.ID))
	require.NoError(t, h.uc.Approve(context.Background(), doc.ID, 8))
	h.locs.candidates = []*PutawayCandidate{{Location: LocationInfo{ID: 202, Code: "PK-01-01", LocType: "pick"}}}

	// Mark the line fully processed as if a previous putaway finished it.
	done := 10.0
	docLines := h.docs.lines[doc.ID]
	docLines[0].QtyProcessed = done

	sugg, err := h.uc.SuggestPutaway(context.Background(), doc.ID)
	require.NoError(t, err)
	assert.Empty(t, sugg, "no suggestion when nothing remains")
}

func TestSuggestPutaway_InvalidState(t *testing.T) {
	h := newHarness(t)
	stdItems(h)
	doc, _, _ := h.uc.Create(context.Background(), CreateInput{
		WarehouseID: 10, CreatedBy: 7, Lines: []CreateLineInput{{ItemID: 3, Qty: 10}},
	})

	_, err := h.uc.SuggestPutaway(context.Background(), doc.ID) // draft
	assertAppErr(t, err, "ERR_INVALID_STATE")
}

// ─── Putaway (6.4) ──────────────────────────────────────────────────────────

func TestPutaway_FullScanCompletesDocument(t *testing.T) {
	h := newHarness(t)
	stdItems(h)
	doc, lines, _ := h.uc.Create(context.Background(), CreateInput{
		WarehouseID: 10, CreatedBy: 7, Lines: []CreateLineInput{{ItemID: 3, Qty: 10}},
	})
	require.NoError(t, h.uc.Submit(context.Background(), doc.ID))
	require.NoError(t, h.uc.Approve(context.Background(), doc.ID, 8))
	h.addStaging(10, &LocationInfo{ID: 100, Code: "STG-01-01", LocType: "staging"})
	h.locs.byCode[10]["PK-01-01"] = &LocationInfo{ID: 202, Code: "PK-01-01", LocType: "pick"}

	status, err := h.uc.Putaway(context.Background(), doc.ID, 8, []PutawayScan{
		{LineID: lines[0].ID, Qty: 10, LocationCode: "PK-01-01"},
	})
	require.NoError(t, err)
	assert.Equal(t, document.StatusCompleted, status, "single line fully stored → completed")

	require.Len(t, h.stock.movements, 3, "1 receipt (approve) + 2 internal_move (putaway)")
	stgOut, targetIn := h.stock.movements[1], h.stock.movements[2]
	assert.Equal(t, stock.TypeInternalMove, stgOut.MovementType)
	assert.Equal(t, int64(100), stgOut.LocationID)
	assert.Equal(t, -10.0, stgOut.Qty, "staging must decrease")
	assert.Equal(t, int64(202), targetIn.LocationID)
	assert.Equal(t, 10.0, targetIn.Qty, "target must increase")

	require.Len(t, h.docs.putaways, 1)
	assert.Equal(t, lines[0].ID, h.docs.putaways[0].lineID)
	assert.Equal(t, 10.0, h.docs.putaways[0].processed)
	assert.Equal(t, int64(202), h.docs.putaways[0].location)

	// doc statuses: submit → approved → completed; the intermediate
	// in_progress edge is validated in-memory (FSD 4.4), final status persisted.
	require.Len(t, h.docs.statuses, 3)
	assert.Equal(t, document.StatusCompleted, h.docs.statuses[2].status)
}

func TestPutaway_PartialScanMovesToInProgress(t *testing.T) {
	h := newHarness(t)
	stdItems(h)
	doc, lines, _ := h.uc.Create(context.Background(), CreateInput{
		WarehouseID: 10, CreatedBy: 7, Lines: []CreateLineInput{{ItemID: 3, Qty: 100}},
	})
	require.NoError(t, h.uc.Submit(context.Background(), doc.ID))
	require.NoError(t, h.uc.Approve(context.Background(), doc.ID, 8))
	h.locs.byCode[10]["BLK-01-01"] = &LocationInfo{ID: 300, Code: "BLK-01-01", LocType: "bulk"}

	status, err := h.uc.Putaway(context.Background(), doc.ID, 8, []PutawayScan{
		{LineID: lines[0].ID, Qty: 40, LocationCode: "BLK-01-01"},
	})
	require.NoError(t, err)
	assert.Equal(t, document.StatusInProgress, status, "partial storage → in_progress")
	require.Len(t, h.docs.statuses, 3)
	assert.Equal(t, document.StatusInProgress, h.docs.statuses[2].status)
}

// TestPutaway_TwoStepCompletion is the path the state machine must walk when a
// document is completed by a scan that is NOT the first one: the status is
// already in_progress, so the completion walk must skip the redundant
// approved → in_progress edge (regression: previously transitioned
// in_progress → in_progress and failed with ERR_INVALID_STATE).
func TestPutaway_TwoStepCompletion(t *testing.T) {
	h := newHarness(t)
	stdItems(h)
	doc, lines, _ := h.uc.Create(context.Background(), CreateInput{
		WarehouseID: 10, CreatedBy: 7, Lines: []CreateLineInput{{ItemID: 3, Qty: 10}},
	})
	require.NoError(t, h.uc.Submit(context.Background(), doc.ID))
	require.NoError(t, h.uc.Approve(context.Background(), doc.ID, 8))
	h.locs.byCode[10]["PK-01-01"] = &LocationInfo{ID: 202, Code: "PK-01-01", LocType: "pick"}

	status, err := h.uc.Putaway(context.Background(), doc.ID, 8, []PutawayScan{
		{LineID: lines[0].ID, Qty: 4, LocationCode: "PK-01-01"},
	})
	require.NoError(t, err)
	assert.Equal(t, document.StatusInProgress, status)

	status, err = h.uc.Putaway(context.Background(), doc.ID, 8, []PutawayScan{
		{LineID: lines[0].ID, Qty: 6, LocationCode: "PK-01-01"},
	})
	require.NoError(t, err)
	assert.Equal(t, document.StatusCompleted, status, "final scan completes a document already in_progress")
}

func TestPutaway_ValidationMatrix(t *testing.T) {
	h := newHarness(t)
	stdItems(h)
	doc, lines, _ := h.uc.Create(context.Background(), CreateInput{
		WarehouseID: 10, CreatedBy: 7, Lines: []CreateLineInput{{ItemID: 3, Qty: 10}},
	})
	require.NoError(t, h.uc.Submit(context.Background(), doc.ID))
	require.NoError(t, h.uc.Approve(context.Background(), doc.ID, 8))

	t.Run("no scans", func(t *testing.T) {
		_, err := h.uc.Putaway(context.Background(), doc.ID, 8, nil)
		assertAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("qty exceeds remaining", func(t *testing.T) {
		_, err := h.uc.Putaway(context.Background(), doc.ID, 8, []PutawayScan{
			{LineID: lines[0].ID, Qty: 11, LocationCode: "PK-01-01"},
		})
		assertAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("line not in document", func(t *testing.T) {
		_, err := h.uc.Putaway(context.Background(), doc.ID, 8, []PutawayScan{
			{LineID: 99999, Qty: 1, LocationCode: "PK-01-01"},
		})
		assertAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("location not found", func(t *testing.T) {
		_, err := h.uc.Putaway(context.Background(), doc.ID, 8, []PutawayScan{
			{LineID: lines[0].ID, Qty: 1, LocationCode: "NOPE"},
		})
		assertAppErr(t, err, "ERR_VALIDATION")
	})
	t.Run("wrong state", func(t *testing.T) {
		doc2, _, _ := h.uc.Create(context.Background(), CreateInput{
			WarehouseID: 10, CreatedBy: 7, Lines: []CreateLineInput{{ItemID: 3, Qty: 5}},
		})
		_, err := h.uc.Putaway(context.Background(), doc2.ID, 8, []PutawayScan{
			{LineID: lines[0].ID, Qty: 1, LocationCode: "PK-01-01"},
		})
		assertAppErr(t, err, "ERR_INVALID_STATE")
	})
}

// ─── pickBestPutaway (pure) ──────────────────────────────────────────────────

func intPtr(v int) *int { return &v }

func TestPickBestPutaway_Ordering(t *testing.T) {
	cands := []*PutawayCandidate{
		{Location: LocationInfo{ID: 1, Code: "B1", LocType: "bulk"}},
		{Location: LocationInfo{ID: 2, Code: "P2", LocType: "pick", PickSeq: intPtr(2)}},
		{Location: LocationInfo{ID: 3, Code: "P1", LocType: "pick", PickSeq: intPtr(1)}},
	}
	best := pickBestPutaway(cands, "A", 10, 3)
	require.Len(t, best, 3)
	assert.Equal(t, "P1", best[0].Location.Code, "class A: pick face, pick_seq 1 first")
	assert.Equal(t, "P2", best[1].Location.Code)
	assert.Equal(t, "B1", best[2].Location.Code, "bulk last for class A")
}

func TestPickBestPutaway_NonAPrefersPickSeq(t *testing.T) {
	cands := []*PutawayCandidate{
		{Location: LocationInfo{ID: 1, Code: "B1", LocType: "bulk"}},
		{Location: LocationInfo{ID: 2, Code: "P1", LocType: "pick", PickSeq: intPtr(1)}},
	}
	best := pickBestPutaway(cands, "B", 10, 2)
	assert.Equal(t, "P1", best[0].Location.Code, "no class preference → pick_seq wins")
	assert.Equal(t, "B1", best[1].Location.Code)
}

func TestPickBestPutaway_CapacityExcluded(t *testing.T) {
	cap := 50.0
	cands := []*PutawayCandidate{
		{Location: LocationInfo{ID: 1, Code: "P1", LocType: "pick", Capacity: &cap}, UsedQty: 40}, // free 10 < 20
		{Location: LocationInfo{ID: 2, Code: "B1", LocType: "bulk"}},
	}
	best := pickBestPutaway(cands, "A", 20, 3)
	require.Len(t, best, 1)
	assert.Equal(t, "B1", best[0].Location.Code, "infeasible location must never be suggested")
}

func TestPickBestPutaway_NoFeasibleReturnsEmpty(t *testing.T) {
	cap := 10.0
	cands := []*PutawayCandidate{
		{Location: LocationInfo{ID: 1, Code: "P1", LocType: "pick", Capacity: &cap}, UsedQty: 9},
	}
	assert.Empty(t, pickBestPutaway(cands, "A", 100, 3))
}

func TestPickBestPutaway_CodeTiebreak(t *testing.T) {
	cands := []*PutawayCandidate{
		{Location: LocationInfo{ID: 1, Code: "B-02", LocType: "bulk"}},
		{Location: LocationInfo{ID: 2, Code: "B-01", LocType: "bulk"}},
	}
	best := pickBestPutaway(cands, "C", 1, 2)
	assert.Equal(t, "B-01", best[0].Location.Code)
}
