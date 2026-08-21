package outbound

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
	docs         map[int64]*document.Document
	lines        map[int64][]*document.DocumentLine
	byKey        map[string]int64
	allocations  map[int64]*document.Allocation
	allocsByLine map[int64][]*document.Allocation
	deliveries   map[int64]*document.Delivery
	nextID       int64
	nextLine     int64
	nextAlloc    int64
	statuses     []mockStatusUpdate
	createdDocs  []*document.Document
	createdAlloc []*document.Allocation
	picked       []mockPicked
	processed    []mockLineProcessed
	reasons      []mockReason
	upserts      []*document.Delivery
	errGet       error // injected GetByID failure
	errByKey     error // injected GetByIDempotencyKey failure
	errCreate    error // injected Create failure
}

type mockStatusUpdate struct {
	id        int64
	status    document.Status
	approvedBy *int64
}
type mockPicked struct{ allocID, qty float64 }
type mockLineProcessed struct{ lineID, qty float64 }
type mockReason struct{ id int64; reason string }

func newMockDocs() *mockDocs {
	return &mockDocs{
		docs:         map[int64]*document.Document{},
		lines:        map[int64][]*document.DocumentLine{},
		byKey:        map[string]int64{},
		allocations:  map[int64]*document.Allocation{},
		allocsByLine: map[int64][]*document.Allocation{},
		deliveries:   map[int64]*document.Delivery{},
		nextID:       1,
		nextLine:     1,
		nextAlloc:    1,
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
	if m.errCreate != nil {
		return m.errCreate
	}
	m.seed(doc, lines)
	m.createdDocs = append(m.createdDocs, doc)
	return nil
}

func (m *mockDocs) GetByID(ctx context.Context, id int64) (*document.Document, []*document.DocumentLine, error) {
	if m.errGet != nil {
		return nil, nil, m.errGet
	}
	doc, ok := m.docs[id]
	if !ok {
		return nil, nil, pgx.ErrNoRows
	}
	return doc, m.lines[id], nil
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

func (m *mockDocs) UpdateLinePutaway(ctx context.Context, lineID int64, qtyProcessed float64, locationID int64) error {
	return nil
}

func (m *mockDocs) UpdateLineProcessed(ctx context.Context, lineID int64, qtyProcessed float64) error {
	for _, lines := range m.lines {
		for _, ln := range lines {
			if ln.ID == lineID {
				ln.QtyProcessed = qtyProcessed
			}
		}
	}
	m.processed = append(m.processed, mockLineProcessed{lineID: float64(lineID), qty: qtyProcessed})
	return nil
}

func (m *mockDocs) CreateAllocations(ctx context.Context, allocations []*document.Allocation) error {
	for _, a := range allocations {
		a.ID = m.nextAlloc
		m.nextAlloc++
		m.allocations[a.ID] = a
		m.allocsByLine[a.DocLineID] = append(m.allocsByLine[a.DocLineID], a)
		m.createdAlloc = append(m.createdAlloc, a)
	}
	return nil
}

func (m *mockDocs) ListAllocations(ctx context.Context, documentID int64) ([]*document.Allocation, error) {
	out := make([]*document.Allocation, 0)
	for id, a := range m.allocations {
		line, ok := m.lineByID(a.DocLineID)
		if !ok {
			continue
		}
		if line.DocumentID == documentID {
			out = append(out, m.allocations[id])
		}
	}
	// Mirror the ListAllocationsByDocument SQL: pick_seq NULLS LAST, code, id.
	sort.SliceStable(out, func(i, j int) bool {
		pi, pj := int(^uint(0)>>1), int(^uint(0)>>1)
		if out[i].PickSeq != nil {
			pi = *out[i].PickSeq
		}
		if out[j].PickSeq != nil {
			pj = *out[j].PickSeq
		}
		if pi != pj {
			return pi < pj
		}
		if out[i].LocationCode != out[j].LocationCode {
			return out[i].LocationCode < out[j].LocationCode
		}
		return out[i].ID < out[j].ID
	})
	return out, nil
}

func (m *mockDocs) lineByID(lineID int64) (*document.DocumentLine, bool) {
	for _, lines := range m.lines {
		for _, ln := range lines {
			if ln.ID == lineID {
				return ln, true
			}
		}
	}
	return nil, false
}

func (m *mockDocs) UpdateAllocationPicked(ctx context.Context, id int64, qtyPicked float64) error {
	a, ok := m.allocations[id]
	if !ok {
		return pgx.ErrNoRows
	}
	a.QtyPicked += qtyPicked
	m.picked = append(m.picked, mockPicked{allocID: float64(id), qty: qtyPicked})
	return nil
}

func (m *mockDocs) UpdateReasonCode(ctx context.Context, id int64, reasonCode string) error {
	m.docs[id].ReasonCode = &reasonCode
	m.reasons = append(m.reasons, mockReason{id: id, reason: reasonCode})
	return nil
}

func (m *mockDocs) GetDelivery(ctx context.Context, documentID int64) (*document.Delivery, error) {
	d, ok := m.deliveries[documentID]
	if !ok {
		return nil, pgx.ErrNoRows
	}
	return d, nil
}

func (m *mockDocs) UpsertDelivery(ctx context.Context, d *document.Delivery) error {
	if existing, ok := m.deliveries[d.DocumentID]; ok {
		mergeDelivery(existing, d)
	} else {
		cp := *d
		m.deliveries[d.DocumentID] = &cp
	}
	m.upserts = append(m.upserts, d)
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

func (m *mockDocs) NextSequence(ctx context.Context, docType, period string) (int64, error) {
	seq := m.nextAlloc // irrelevant for formatting; only the count matters
	return int64(seq), nil
}

func mergeDelivery(dst, src *document.Delivery) {
	if src.VehicleNo != nil {
		dst.VehicleNo = src.VehicleNo
	}
	if src.DriverName != nil {
		dst.DriverName = src.DriverName
	}
	if src.ShippedAt != nil {
		dst.ShippedAt = src.ShippedAt
	}
	if src.ReceivedBy != nil {
		dst.ReceivedBy = src.ReceivedBy
	}
	if src.ReceivedAt != nil {
		dst.ReceivedAt = src.ReceivedAt
	}
	if src.PodFileURL != nil {
		dst.PodFileURL = src.PodFileURL
	}
	if src.SignatureURL != nil {
		dst.SignatureURL = src.SignatureURL
	}
}

// mockItems serves ItemLookup.
type mockItems struct {
	items map[int64]*ItemInfo
	uoms  map[int64]map[string]float64
	barc  map[string]*BarcodeItem
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

func (m *mockItems) GetItemByBarcode(ctx context.Context, barcode string) (*BarcodeItem, error) {
	it, ok := m.barc[barcode]
	if !ok {
		return nil, pgx.ErrNoRows
	}
	return it, nil
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
type mockLocs struct{ byCode map[int64]map[string]*LocationInfo }

func (m *mockLocs) GetByWarehouseCode(ctx context.Context, warehouseID int64, code string) (*LocationInfo, error) {
	l, ok := m.byCode[warehouseID][code]
	if !ok {
		return nil, pgx.ErrNoRows
	}
	return l, nil
}

// mockCands serves StockCandidates; reserves are recorded for assertions.
type mockCands struct {
	byItem    map[int64][]*AllocationCandidate
	byBal     map[int64]*AllocationCandidate
	reserve   []mockReserve
	errLock   error // injected LockAllocationCandidates failure
	errGetCand error // injected GetCandidateByBalanceID failure
}

type mockReserve struct {
	balanceID int64
	qty       float64
}

func (m *mockCands) LockAllocationCandidates(ctx context.Context, itemID, warehouseID int64) ([]*AllocationCandidate, error) {
	if m.errLock != nil {
		return nil, m.errLock
	}
	return m.byItem[itemID], nil
}

func (m *mockCands) GetCandidateByBalanceID(ctx context.Context, balanceID, warehouseID int64) (*AllocationCandidate, error) {
	if m.errGetCand != nil {
		return nil, m.errGetCand
	}
	c, ok := m.byBal[balanceID]
	if !ok {
		return nil, pgx.ErrNoRows
	}
	return c, nil
}

func (m *mockCands) UpdateBalanceReserved(ctx context.Context, balanceID int64, delta float64) error {
	m.reserve = append(m.reserve, mockReserve{balanceID: balanceID, qty: delta})
	return nil
}

// mockStockRepo mirrors the stock tables for the posting engine + ship release.
type mockStockRepo struct {
	stock.StockRepository
	balances   map[string]*stock.StockBalance
	byID       map[int64]*stock.StockBalance
	movements  []*stock.StockMovement
	nextID     int64
	errUpsert  error // injected UpsertBalance failure
	errInsert  error // injected InsertMovement failure
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
	if m.errUpsert != nil {
		return m.errUpsert
	}
	if b.ID == 0 {
		b.ID = m.nextID
		m.nextID++
	}
	m.balances[stockKey(b.ItemID, b.LocationID, b.BatchID, b.Status)] = b
	m.byID[b.ID] = b
	return nil
}

func (m *mockStockRepo) InsertMovement(ctx context.Context, mv *stock.StockMovement) error {
	if m.errInsert != nil {
		return m.errInsert
	}
	m.movements = append(m.movements, mv)
	return nil
}

func (m *mockStockRepo) GetMovements(ctx context.Context, filter stock.MovementFilter) ([]*stock.StockMovement, error) {
	return m.movements, nil
}

func (m *mockStockRepo) UpdateBalanceReserved(ctx context.Context, id int64, delta float64) error {
	b, ok := m.byID[id]
	if !ok {
		return pgx.ErrNoRows
	}
	b.QtyReserved += delta
	return nil
}

type inlineTx struct{}

func (inlineTx) RunInTx(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}

// snapTx runs the callback and rolls back the mock side-effects on error,
// mimicking a real database transaction (all-or-nothing, FSD 4.1).
type snapTx struct {
	docs  *mockDocs
	cands *mockCands
	stock *mockStockRepo
}

func (t snapTx) RunInTx(ctx context.Context, fn func(ctx context.Context) error) error {
	docsAlloc := len(t.docs.createdAlloc)
	docsReason := len(t.docs.reasons)
	candsReserve := len(t.cands.reserve)
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
		t.docs.createdAlloc = t.docs.createdAlloc[:docsAlloc]
		t.docs.reasons = t.docs.reasons[:docsReason]
		t.cands.reserve = t.cands.reserve[:candsReserve]
		t.stock.movements = t.stock.movements[:stockMoves]
		t.stock.balances = savedBalances
		t.stock.byID = savedByID
	}
	return err
}

// ─── Harness ────────────────────────────────────────────────────────────────

var testNow = time.Date(2026, time.August, 14, 10, 0, 0, 0, time.UTC)

type harness struct {
	uc    *OutboundUsecase
	docs  *mockDocs
	items *mockItems
	wh    *mockWh
	seq   *mockSeq
	locs  *mockLocs
	cands *mockCands
	stock *mockStockRepo
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	h := &harness{
		docs:  newMockDocs(),
		items: &mockItems{items: map[int64]*ItemInfo{}, uoms: map[int64]map[string]float64{}, barc: map[string]*BarcodeItem{}},
		wh:    &mockWh{warehouses: map[int64]*WarehouseInfo{}},
		locs:  &mockLocs{byCode: map[int64]map[string]*LocationInfo{}},
		cands: &mockCands{byItem: map[int64][]*AllocationCandidate{}, byBal: map[int64]*AllocationCandidate{}},
		stock: newMockStockRepo(),
	}
	tx := snapTx{docs: h.docs, cands: h.cands, stock: h.stock}
	h.seq = &mockSeq{}
	posting := stockuc.NewPostingUsecase(h.stock, inlineTx{})
	h.uc = NewOutboundUsecase(h.docs, h.items, h.wh, h.locs, h.cands, h.stock, tx, posting,
		docnum.NewGenerator(h.seq), WithClock(func() time.Time { return testNow }))
	return h
}

type mockSeq struct{ n int64; err error }

func (m *mockSeq) NextSequence(ctx context.Context, docType, period string) (int64, error) {
	if m.err != nil {
		return 0, m.err
	}
	m.n++
	return m.n, nil
}

func (h *harness) stdItems() {
	h.items.items[1] = &ItemInfo{ID: 1, SKU: "SKU-001", BaseUom: "PCS", IsActive: true}
	h.items.items[2] = &ItemInfo{ID: 2, SKU: "SKU-002", BaseUom: "PCS", IsActive: true}
	h.items.uoms[1] = map[string]float64{"PCS": 1, "BOX": 24}
	h.items.uoms[2] = map[string]float64{"PCS": 1}
	h.items.barc["8991002101001"] = &BarcodeItem{ItemID: 1, SKU: "SKU-001", BaseUom: "PCS", Uom: "PCS", ConvFactor: 1}
	h.items.barc["8991002101002"] = &BarcodeItem{ItemID: 1, SKU: "SKU-001", BaseUom: "PCS", Uom: "BOX", ConvFactor: 24}
	h.items.barc["8991002101003"] = &BarcodeItem{ItemID: 2, SKU: "SKU-002", BaseUom: "PCS", Uom: "PCS", ConvFactor: 1}
	h.wh.warehouses[10] = &WarehouseInfo{ID: 10, Code: "WH01", IsActive: true}
	h.locs.byCode[10] = map[string]*LocationInfo{
		"PK-01-01": {ID: 200, WarehouseID: 10, Code: "PK-01-01", LocType: "pick"},
		"BLK-01-01": {ID: 300, WarehouseID: 10, Code: "BLK-01-01", LocType: "bulk"},
	}
}

// seedApprovedREQ creates a REQ and moves it to approved; returns the doc.
func (h *harness) seedApprovedREQ(createdBy int64) *document.Document {
	doc, _, err := h.uc.CreateRequest(whCtx(10), CreateRequestInput{
		WarehouseID: 10,
		CreatedBy:   createdBy,
		Lines:       []CreateLineInput{{ItemID: 1, Qty: 10}},
	})
	if err != nil {
		panic(err)
	}
	if err := h.uc.SubmitRequest(whCtx(10), doc.ID); err != nil {
		panic(err)
	}
	if err := h.uc.ApproveRequest(whCtx(10), doc.ID, createdBy+1); err != nil {
		panic(err)
	}
	return doc
}

// seedApprovedDO creates a DO from an approved REQ and moves it to approved.
func (h *harness) seedApprovedDO(createdBy int64) (*document.Document, []*document.DocumentLine) {
	req := h.seedApprovedREQ(createdBy)
	doc, lines, err := h.uc.CreateDelivery(whCtx(10), CreateDeliveryInput{
		WarehouseID: 10,
		RequestID:   req.ID,
		CreatedBy:   createdBy,
	})
	if err != nil {
		panic(err)
	}
	if err := h.uc.SubmitDelivery(whCtx(10), doc.ID); err != nil {
		panic(err)
	}
	if err := h.uc.ApproveDelivery(whCtx(10), doc.ID, createdBy+1); err != nil {
		panic(err)
	}
	return doc, lines
}

// seedAllocatedDO creates an approved DO whose first line is fully allocated to
// balance 500 (PK-01-01). The allocation is enriched exactly like the SQL join
// (ItemID/LocationID/LocationCode) so pick/ship validation works.
func (h *harness) seedAllocatedDO(createdBy int64, onhand float64) (*document.Document, []*document.DocumentLine, *document.Allocation) {
	do, lines := h.seedApprovedDO(createdBy)

	h.cands.byBal[500] = &AllocationCandidate{BalanceID: 500, ItemID: 1, LocationID: 200, QtyFree: onhand, LocationCode: "PK-01-01"}
	_, err := h.uc.AllocateOverride(whCtx(10), do.ID, OverrideInput{
		ReasonCode: "test",
		Lines:      []OverrideLineInput{{LineID: lines[0].ID, Qty: onhand, BalanceID: 500}},
	})
	if err != nil {
		panic(err)
	}
	alloc := h.docs.createdAlloc[0]
	alloc.ItemID = 1
	alloc.LocationID = 200
	alloc.LocationCode = "PK-01-01"

	bal := &stock.StockBalance{ID: 500, ItemID: 1, LocationID: 200, Status: stock.StatusAvailable, QtyOnhand: onhand, QtyReserved: onhand}
	h.stock.addBalance(bal)
	return do, lines, alloc
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

func intPtr(v int) *int { return &v }

// ─── Requests (7.1) ─────────────────────────────────────────────────────────

func TestCreateRequest_ValidDraft(t *testing.T) {
	h := newHarness(t)
	h.stdItems()

	doc, lines, err := h.uc.CreateRequest(whCtx(10), CreateRequestInput{
		WarehouseID: 10,
		Notes:       "unit produksi minggu ke-3",
		CreatedBy:   7,
		Lines:       []CreateLineInput{{ItemID: 1, Qty: 2, Uom: "BOX"}, {ItemID: 2, Qty: 5}},
	})
	require.NoError(t, err)
	assert.Equal(t, "REQ/WH01/2608/00001", doc.DocNo)
	assert.Equal(t, document.StatusDraft, doc.Status)
	require.Len(t, lines, 2)
	assert.Equal(t, "BOX", lines[0].Uom)
	assert.Equal(t, 24.0, lines[0].ConvFactor)
	assert.Equal(t, "PCS", lines[1].Uom, "empty uom defaults to base uom")
}

func TestCreateRequest_ValidationMatrix(t *testing.T) {
	cases := []struct {
		name  string
		lines []CreateLineInput
		field string
	}{
		{"no lines", nil, "lines"},
		{"unknown item", []CreateLineInput{{ItemID: 999, Qty: 1}}, "lines[0].item_id"},
		{"inactive item", []CreateLineInput{{ItemID: 2, Qty: 1}}, "lines[0].item_id"},
		{"zero qty", []CreateLineInput{{ItemID: 1, Qty: 0}}, "lines[0].qty"},
		{"unknown uom", []CreateLineInput{{ItemID: 1, Qty: 1, Uom: "TIN"}}, "lines[0].uom"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := newHarness(t)
			h.stdItems()
			if tc.name == "inactive item" {
				h.items.items[2].IsActive = false
			}
			_, _, err := h.uc.CreateRequest(whCtx(10), CreateRequestInput{WarehouseID: 10, CreatedBy: 1, Lines: tc.lines})
			assertAppErr(t, err, "ERR_VALIDATION")
			var ae *apperr.AppError
			require.ErrorAs(t, err, &ae)
			details, ok := ae.Details.([]apperr.ErrorDetail)
			require.True(t, ok)
			require.NotEmpty(t, details)
			assert.Equal(t, tc.field, details[0].Field)
		})
	}
}

func TestCreateRequest_IdempotentReplay(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	key := "6f1e9b2a-3c4d-4e5f-8a9b-0c1d2e3f4a5b"
	in := CreateRequestInput{
		WarehouseID: 10, IdempotencyKey: key, CreatedBy: 7,
		Lines: []CreateLineInput{{ItemID: 1, Qty: 1}},
	}
	first, _, err := h.uc.CreateRequest(whCtx(10), in)
	require.NoError(t, err)
	second, _, err := h.uc.CreateRequest(whCtx(10), in)
	require.NoError(t, err)
	assert.Equal(t, first.ID, second.ID)
	assert.Len(t, h.docs.createdDocs, 1)
}

func TestRequest_SubmitApprove_Flow(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	doc, _, _ := h.uc.CreateRequest(whCtx(10), CreateRequestInput{
		WarehouseID: 10, CreatedBy: 7, Lines: []CreateLineInput{{ItemID: 1, Qty: 1}},
	})

	require.NoError(t, h.uc.SubmitRequest(whCtx(10), doc.ID))
	assert.Equal(t, document.StatusSubmitted, h.docs.docs[doc.ID].Status)

	err := h.uc.ApproveRequest(whCtx(10), doc.ID, 7) // same as creator
	assertAppErr(t, err, "ERR_SELF_APPROVAL")

	require.NoError(t, h.uc.ApproveRequest(whCtx(10), doc.ID, 8))
	assert.Equal(t, document.StatusApproved, h.docs.docs[doc.ID].Status)
	require.NotNil(t, h.docs.docs[doc.ID].ApprovedBy)
	assert.Equal(t, int64(8), *h.docs.docs[doc.ID].ApprovedBy)
}

func TestRequest_Submit_InvalidState(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	doc, _, _ := h.uc.CreateRequest(whCtx(10), CreateRequestInput{
		WarehouseID: 10, CreatedBy: 7, Lines: []CreateLineInput{{ItemID: 1, Qty: 1}},
	})
	require.NoError(t, h.uc.SubmitRequest(whCtx(10), doc.ID))
	assertAppErr(t, h.uc.SubmitRequest(whCtx(10), doc.ID), "ERR_INVALID_STATE")
}

// ─── Delivery orders (7.1) ───────────────────────────────────────────────────

func TestCreateDelivery_FromApprovedRequest(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	req := h.seedApprovedREQ(7)

	doc, lines, err := h.uc.CreateDelivery(whCtx(10), CreateDeliveryInput{
		WarehouseID: 10,
		RequestID:   req.ID,
		CreatedBy:   9,
	})
	require.NoError(t, err)
	assert.Equal(t, document.DocTypeDO, doc.DocType)
	assert.Equal(t, document.StatusDraft, doc.Status)
	require.NotNil(t, doc.RefDocID)
	assert.Equal(t, req.ID, *doc.RefDocID, "DO must reference the approved request")
	require.Len(t, lines, 1)
	assert.Equal(t, int64(1), lines[0].ItemID)
	assert.Equal(t, 10.0, lines[0].QtyRequest, "DO lines are copied from the request")
}

func TestCreateDelivery_RequestMustBeApproved(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	doc, _, _ := h.uc.CreateRequest(whCtx(10), CreateRequestInput{
		WarehouseID: 10, CreatedBy: 7, Lines: []CreateLineInput{{ItemID: 1, Qty: 1}},
	})

	_, _, err := h.uc.CreateDelivery(whCtx(10), CreateDeliveryInput{
		WarehouseID: 10, RequestID: doc.ID, CreatedBy: 9,
	})
	assertAppErr(t, err, "ERR_VALIDATION")
}

func TestCreateDelivery_RequestMustBeREQ(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	req := h.seedApprovedREQ(7)
	do, _, _ := h.uc.CreateDelivery(whCtx(10), CreateDeliveryInput{
		WarehouseID: 10, RequestID: req.ID, CreatedBy: 9,
	})

	// Referencing a DO instead of a REQ must be rejected.
	_, _, err := h.uc.CreateDelivery(whCtx(10), CreateDeliveryInput{
		WarehouseID: 10, RequestID: do.ID, CreatedBy: 9,
	})
	assertAppErr(t, err, "ERR_VALIDATION")
}

func TestCreateDelivery_UnknownRequest(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	_, _, err := h.uc.CreateDelivery(whCtx(10), CreateDeliveryInput{
		WarehouseID: 10, RequestID: 424242, CreatedBy: 9,
	})
	assertAppErr(t, err, "ERR_NOT_FOUND")
}

func TestDelivery_SubmitApprove(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	doc, _, err := h.uc.CreateDelivery(whCtx(10), CreateDeliveryInput{
		WarehouseID: 10, RequestID: h.seedApprovedREQ(7).ID, CreatedBy: 9,
	})
	require.NoError(t, err)

	require.NoError(t, h.uc.SubmitDelivery(whCtx(10), doc.ID))
	assert.Equal(t, document.StatusSubmitted, h.docs.docs[doc.ID].Status)

	err = h.uc.ApproveDelivery(whCtx(10), doc.ID, 9)
	assertAppErr(t, err, "ERR_SELF_APPROVAL")

	require.NoError(t, h.uc.ApproveDelivery(whCtx(10), doc.ID, 11))
	assert.Equal(t, document.StatusApproved, h.docs.docs[doc.ID].Status)
}

// ─── Allocation (7.2) ────────────────────────────────────────────────────────

func TestAllocate_FefoSplitAcrossCandidates(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, lines := h.seedApprovedDO(7)

	expEarly := time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC)
	expLate := time.Date(2027, 6, 1, 0, 0, 0, 0, time.UTC)
	// FEFO order enforced by the SQL: mock returns them pre-ordered.
	h.cands.byItem[1] = []*AllocationCandidate{
		{BalanceID: 500, ItemID: 1, LocationID: 200, QtyFree: 6, LocationCode: "PK-01-01", ExpiryDate: &expEarly},
		{BalanceID: 501, ItemID: 1, LocationID: 300, QtyFree: 10, LocationCode: "BLK-01-01", ExpiryDate: &expLate},
	}
	h.cands.byBal[500] = h.cands.byItem[1][0]
	h.cands.byBal[501] = h.cands.byItem[1][1]

	results, err := h.uc.Allocate(whCtx(10), do.ID, AllocateInput{
		Lines: []LineAllocInput{{LineID: lines[0].ID, Qty: 10}},
	})
	require.NoError(t, err)
	require.Len(t, results, 2)
	assert.Equal(t, 6.0, results[0].QtyAllocated, "first candidate (earliest expiry) exhausted first")
	assert.Equal(t, 4.0, results[1].QtyAllocated)

	require.Len(t, h.cands.reserve, 2)
	assert.Equal(t, int64(500), h.cands.reserve[0].balanceID)
	assert.Equal(t, 6.0, h.cands.reserve[0].qty)
	assert.Equal(t, int64(501), h.cands.reserve[1].balanceID)
	assert.Equal(t, 4.0, h.cands.reserve[1].qty)

	require.Len(t, h.docs.createdAlloc, 2)
	assert.Equal(t, lines[0].ID, h.docs.createdAlloc[0].DocLineID)
	assert.Equal(t, int64(500), h.docs.createdAlloc[0].BalanceID)
}

func TestAllocate_StockInsufficient(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, lines := h.seedApprovedDO(7)

	h.cands.byItem[1] = []*AllocationCandidate{
		{BalanceID: 500, ItemID: 1, LocationID: 200, QtyFree: 5, LocationCode: "PK-01-01"},
	}

	_, err := h.uc.Allocate(whCtx(10), do.ID, AllocateInput{
		Lines: []LineAllocInput{{LineID: lines[0].ID, Qty: 10}},
	})
	assertAppErr(t, err, "ERR_STOCK_INSUFFICIENT")
	assert.Empty(t, h.docs.createdAlloc, "nothing may be persisted when the transaction aborts")
}

func TestAllocate_RequiresApprovedDO(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, lines := h.seedApprovedDO(7)

	// Submit to draft → approved, then reject allocation when reverted.
	// Simplest: create a DO that stays submitted (no approval).
	req := h.seedApprovedREQ(7)
	draftDO, draftLines, _ := h.uc.CreateDelivery(whCtx(10), CreateDeliveryInput{
		WarehouseID: 10, RequestID: req.ID, CreatedBy: 9,
	})
	require.NoError(t, h.uc.SubmitDelivery(whCtx(10), draftDO.ID))

	_, err := h.uc.Allocate(whCtx(10), draftDO.ID, AllocateInput{
		Lines: []LineAllocInput{{LineID: draftLines[0].ID, Qty: 1}},
	})
	assertAppErr(t, err, "ERR_INVALID_STATE")
	_ = do
	_ = lines
}

func TestAllocate_LineNotInDocument(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, _ := h.seedApprovedDO(7)

	_, err := h.uc.Allocate(whCtx(10), do.ID, AllocateInput{
		Lines: []LineAllocInput{{LineID: 99999, Qty: 1}},
	})
	assertAppErr(t, err, "ERR_VALIDATION")
}

// ─── Override allocation (7.3) ───────────────────────────────────────────────

func TestAllocateOverride_RequiresReason(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, lines := h.seedApprovedDO(7)

	_, err := h.uc.AllocateOverride(whCtx(10), do.ID, OverrideInput{
		Lines: []OverrideLineInput{{LineID: lines[0].ID, Qty: 1, BalanceID: 500}},
	})
	assertAppErr(t, err, "ERR_VALIDATION")
}

func TestAllocateOverride_Valid(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, lines := h.seedApprovedDO(7)

	h.cands.byBal[500] = &AllocationCandidate{BalanceID: 500, ItemID: 1, LocationID: 200, QtyFree: 10, LocationCode: "PK-01-01"}

	results, err := h.uc.AllocateOverride(whCtx(10), do.ID, OverrideInput{
		ReasonCode: "rush_order",
		Lines:      []OverrideLineInput{{LineID: lines[0].ID, Qty: 10, BalanceID: 500}},
	})
	require.NoError(t, err)
	require.Len(t, results, 1)
	assert.Equal(t, int64(500), results[0].BalanceID)
	assert.Equal(t, 10.0, results[0].QtyAllocated)

	require.Len(t, h.docs.reasons, 1)
	assert.Equal(t, "rush_order", h.docs.reasons[0].reason)
	require.NotNil(t, h.docs.docs[do.ID].ReasonCode)
	assert.Equal(t, "rush_order", *h.docs.docs[do.ID].ReasonCode)
}

func TestAllocateOverride_BalanceItemMismatch(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, lines := h.seedApprovedDO(7)

	h.cands.byBal[500] = &AllocationCandidate{BalanceID: 500, ItemID: 2, LocationID: 200, QtyFree: 10} // wrong item

	_, err := h.uc.AllocateOverride(whCtx(10), do.ID, OverrideInput{
		ReasonCode: "rush_order",
		Lines:      []OverrideLineInput{{LineID: lines[0].ID, Qty: 1, BalanceID: 500}},
	})
	assertAppErr(t, err, "ERR_VALIDATION")
}

func TestAllocateOverride_Insufficient(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, lines := h.seedApprovedDO(7)

	h.cands.byBal[500] = &AllocationCandidate{BalanceID: 500, ItemID: 1, LocationID: 200, QtyFree: 3}

	_, err := h.uc.AllocateOverride(whCtx(10), do.ID, OverrideInput{
		ReasonCode: "rush_order",
		Lines:      []OverrideLineInput{{LineID: lines[0].ID, Qty: 10, BalanceID: 500}},
	})
	assertAppErr(t, err, "ERR_STOCK_INSUFFICIENT")
}

// ─── Picking list (7.4) ──────────────────────────────────────────────────────

func TestPickingList_OrderedByPickSeq(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, _ := h.seedApprovedDO(7)

	h.docs.CreateAllocations(whCtx(10), []*document.Allocation{
		{DocLineID: h.linesOf(do)[0].ID, BalanceID: 501, QtyAllocated: 4, LocationID: 300, LocationCode: "BLK-01-01", PickSeq: nil, SKU: "SKU-001", BaseUom: "PCS"},
		{DocLineID: h.linesOf(do)[0].ID, BalanceID: 500, QtyAllocated: 6, LocationID: 200, LocationCode: "PK-01-01", PickSeq: intPtr(1), SKU: "SKU-001", BaseUom: "PCS"},
	})

	items, err := h.uc.PickingList(whCtx(10), do.ID)
	require.NoError(t, err)
	require.Len(t, items, 2)
	assert.Equal(t, "PK-01-01", items[0].LocationCode, "pick_seq first")
	assert.Equal(t, "BLK-01-01", items[1].LocationCode)
	assert.Equal(t, 10.0, items[0].QtyAllocated+items[1].QtyAllocated)
}

func (h *harness) linesOf(doc *document.Document) []*document.DocumentLine {
	return h.docs.lines[doc.ID]
}

func TestPickingList_InvalidState(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	doc, _, _ := h.uc.CreateRequest(whCtx(10), CreateRequestInput{
		WarehouseID: 10, CreatedBy: 7, Lines: []CreateLineInput{{ItemID: 1, Qty: 1}},
	})
	require.NoError(t, h.uc.SubmitRequest(whCtx(10), doc.ID))

	_, err := h.uc.PickingList(whCtx(10), doc.ID)
	assertAppErr(t, err, "ERR_NOT_FOUND")
}

// ─── Pick (7.5) ──────────────────────────────────────────────────────────────

func TestPick_ValidScan(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, _, alloc := h.seedAllocatedDO(7, 10)

	err := h.uc.Pick(whCtx(10), do.ID, PickInput{
		Scans: []PickScanInput{
			{AllocationID: alloc.ID, LocationBarcode: "PK-01-01", ItemBarcode: "8991002101001", Qty: 10},
		},
	})
	require.NoError(t, err)
	require.Len(t, h.docs.picked, 1)
	assert.Equal(t, float64(alloc.ID), h.docs.picked[0].allocID)
	assert.Equal(t, 10.0, h.docs.picked[0].qty)
	require.Len(t, h.docs.processed, 1)
	assert.Equal(t, 10.0, h.docs.processed[0].qty, "line processed qty updated in line UOM")
}

func TestPick_ScanMismatch(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, _, alloc := h.seedAllocatedDO(7, 10)

	tests := []struct {
		name   string
		scan   PickScanInput
	}{
		{"wrong item barcode", PickScanInput{AllocationID: alloc.ID, LocationBarcode: "PK-01-01", ItemBarcode: "8991002101003", Qty: 1}},
		{"wrong location barcode", PickScanInput{AllocationID: alloc.ID, LocationBarcode: "BLK-01-01", ItemBarcode: "8991002101001", Qty: 1}},
		{"unknown item barcode", PickScanInput{AllocationID: alloc.ID, LocationBarcode: "PK-01-01", ItemBarcode: "nope", Qty: 1}},
		{"unknown location", PickScanInput{AllocationID: alloc.ID, LocationBarcode: "NOPE", ItemBarcode: "8991002101001", Qty: 1}},
		{"unknown allocation", PickScanInput{AllocationID: 99999, LocationBarcode: "PK-01-01", ItemBarcode: "8991002101001", Qty: 1}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := h.uc.Pick(whCtx(10), do.ID, PickInput{Scans: []PickScanInput{tc.scan}})
			assertAppErr(t, err, "ERR_SCAN_MISMATCH")
			assert.Empty(t, h.docs.picked, "no picked quantity may be persisted on mismatch")
		})
	}
}

func TestPick_QtyExceedsAllocation(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, _, alloc := h.seedAllocatedDO(7, 10)

	err := h.uc.Pick(whCtx(10), do.ID, PickInput{
		Scans: []PickScanInput{
			{AllocationID: alloc.ID, LocationBarcode: "PK-01-01", ItemBarcode: "8991002101001", Qty: 11},
		},
	})
	assertAppErr(t, err, "ERR_VALIDATION")
}

// ─── Ship (7.6) ──────────────────────────────────────────────────────────────

func TestShip_PostsIssueAndReleasesReservation(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, _, alloc := h.seedAllocatedDO(7, 10)
	require.NoError(t, h.uc.Pick(whCtx(10), do.ID, PickInput{
		Scans: []PickScanInput{{AllocationID: alloc.ID, LocationBarcode: "PK-01-01", ItemBarcode: "8991002101001", Qty: 10}},
	}))
	bal := h.stock.byID[500]

	status, err := h.uc.Ship(whCtx(10), do.ID, ShipInput{VehicleNo: "B 1234 XYZ", DriverName: "Budi"})
	require.NoError(t, err)
	assert.Equal(t, document.StatusInProgress, status)

	require.Len(t, h.stock.movements, 1, "one issue movement")
	mv := h.stock.movements[0]
	assert.Equal(t, stock.TypeIssue, mv.MovementType)
	assert.Equal(t, -10.0, mv.Qty)
	assert.Equal(t, 0.0, mv.QtyAfter)
	assert.Equal(t, do.DocNo, mv.DocNo)
	assert.Equal(t, alloc.DocLineID, mv.DocLineID)

	assert.Equal(t, 0.0, bal.QtyOnhand, "onhand reduced by the shipped qty")
	assert.Equal(t, 0.0, bal.QtyReserved, "reservation released by the shipped qty")

	require.Len(t, h.docs.upserts, 1)
	d := h.docs.upserts[0]
	require.NotNil(t, d.VehicleNo)
	assert.Equal(t, "B 1234 XYZ", *d.VehicleNo)
	require.NotNil(t, d.ShippedAt)

	// REQ submit+approve (2) + DO submit+approve (2) + ship in_progress (1)
	require.Len(t, h.docs.statuses, 5)
	assert.Equal(t, document.StatusInProgress, h.docs.statuses[4].status)
}

func TestShip_NothingPicked(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, _ := h.seedApprovedDO(7)

	_, err := h.uc.Ship(whCtx(10), do.ID, ShipInput{})
	assertAppErr(t, err, "ERR_VALIDATION")
}

func TestShip_InvalidState(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	req := h.seedApprovedREQ(7)
	draftDO, _, _ := h.uc.CreateDelivery(whCtx(10), CreateDeliveryInput{
		WarehouseID: 10, RequestID: req.ID, CreatedBy: 9,
	})

	_, err := h.uc.Ship(whCtx(10), draftDO.ID, ShipInput{})
	assertAppErr(t, err, "ERR_INVALID_STATE")
}

// ─── POD (7.7) ───────────────────────────────────────────────────────────────

func TestPod_ClosesCompleted(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, _, alloc := h.seedAllocatedDO(7, 10)
	require.NoError(t, h.uc.Pick(whCtx(10), do.ID, PickInput{
		Scans: []PickScanInput{{AllocationID: alloc.ID, LocationBarcode: "PK-01-01", ItemBarcode: "8991002101001", Qty: 10}},
	}))
	_, err := h.uc.Ship(whCtx(10), do.ID, ShipInput{})
	require.NoError(t, err)

	recAt := time.Date(2026, time.August, 14, 14, 0, 0, 0, time.UTC)
	status, err := h.uc.Pod(whCtx(10), do.ID, PodInput{
		ReceivedBy:   "Andi Wijaya",
		ReceivedAt:   &recAt,
		PodFileURL:   "s3://simbar/pod/do-1.jpg",
		SignatureURL: "s3://simbar/sig/do-1.png",
	})
	require.NoError(t, err)
	assert.Equal(t, document.StatusCompleted, status)
	assert.Equal(t, document.StatusCompleted, h.docs.docs[do.ID].Status)

	require.Len(t, h.docs.upserts, 2)
	pod := h.docs.upserts[1]
	require.NotNil(t, pod.ReceivedBy)
	assert.Equal(t, "Andi Wijaya", *pod.ReceivedBy)
	require.NotNil(t, pod.ReceivedAt)
	assert.Equal(t, recAt, *pod.ReceivedAt)
	require.NotNil(t, pod.PodFileURL)
	assert.Equal(t, "s3://simbar/pod/do-1.jpg", *pod.PodFileURL)
}

func TestPod_RequiresShipped(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, _ := h.seedApprovedDO(7)

	_, err := h.uc.Pod(whCtx(10), do.ID, PodInput{ReceivedBy: "X"})
	assertAppErr(t, err, "ERR_INVALID_STATE")
}

func TestPod_RequiresReceiver(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, _, alloc := h.seedAllocatedDO(7, 10)
	require.NoError(t, h.uc.Pick(whCtx(10), do.ID, PickInput{
		Scans: []PickScanInput{{AllocationID: alloc.ID, LocationBarcode: "PK-01-01", ItemBarcode: "8991002101001", Qty: 10}},
	}))
	_, err := h.uc.Ship(whCtx(10), do.ID, ShipInput{})
	require.NoError(t, err)

	_, err = h.uc.Pod(whCtx(10), do.ID, PodInput{})
	assertAppErr(t, err, "ERR_VALIDATION")
}

// ─── Request edge cases (7.1) ─────────────────────────────────────────────────

func TestRequest_Submit_WrongDocType(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	req := h.seedApprovedREQ(7)
	do, _, _ := h.uc.CreateDelivery(whCtx(10), CreateDeliveryInput{
		WarehouseID: 10, RequestID: req.ID, CreatedBy: 9,
	})

	err := h.uc.SubmitRequest(whCtx(10), do.ID)
	assertAppErr(t, err, "ERR_NOT_FOUND")
}

func TestRequest_Approve_WrongDocType(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	req := h.seedApprovedREQ(7)
	do, _, _ := h.uc.CreateDelivery(whCtx(10), CreateDeliveryInput{
		WarehouseID: 10, RequestID: req.ID, CreatedBy: 9,
	})

	err := h.uc.ApproveRequest(whCtx(10), do.ID, 99)
	assertAppErr(t, err, "ERR_NOT_FOUND")
}

func TestRequest_Approve_SelfApproval(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	doc, _, err := h.uc.CreateRequest(whCtx(10), CreateRequestInput{
		WarehouseID: 10, CreatedBy: 7, Lines: []CreateLineInput{{ItemID: 1, Qty: 2}},
	})
	require.NoError(t, err)
	require.NoError(t, h.uc.SubmitRequest(whCtx(10), doc.ID))

	err = h.uc.ApproveRequest(whCtx(10), doc.ID, 7)
	assertAppErr(t, err, "ERR_SELF_APPROVAL")
}

// ─── Delivery edge cases (7.1) ────────────────────────────────────────────────

func TestCreateDelivery_IdempotentReplay(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	req := h.seedApprovedREQ(7)
	key := "6f1e9b2a-3c4d-4e5f-8a9b-0c1d2e3f4a5b"

	first, _, err := h.uc.CreateDelivery(whCtx(10), CreateDeliveryInput{
		WarehouseID: 10, RequestID: req.ID, CreatedBy: 9, IdempotencyKey: key,
	})
	require.NoError(t, err)

	replay, lines, err := h.uc.CreateDelivery(whCtx(10), CreateDeliveryInput{
		WarehouseID: 10, RequestID: req.ID, CreatedBy: 9, IdempotencyKey: key,
	})
	require.NoError(t, err)
	assert.Equal(t, first.ID, replay.ID, "same idempotency key must replay the same document")
	assert.Nil(t, lines, "replay returns the existing document without lines")
}

func TestCreateDelivery_ByIdemKeyLookupError(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	req := h.seedApprovedREQ(7)
	h.docs.errByKey = errors.New("lookup boom")

	_, _, err := h.uc.CreateDelivery(whCtx(10), CreateDeliveryInput{
		WarehouseID: 10, RequestID: req.ID, CreatedBy: 9,
		IdempotencyKey: "6f1e9b2a-3c4d-4e5f-8a9b-0c1d2e3f4a5b",
	})
	require.ErrorContains(t, err, "lookup boom")
}

func TestCreateDelivery_RequestNoLines(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	req := &document.Document{
		DocNo: "REQ/WH01/2608/00001", DocType: document.DocTypeRequest,
		Status: document.StatusApproved, WarehouseID: 10, CreatedBy: 7,
	}
	h.docs.seed(req, nil)

	_, _, err := h.uc.CreateDelivery(whCtx(10), CreateDeliveryInput{
		WarehouseID: 10, RequestID: req.ID, CreatedBy: 9,
	})
	assertAppErr(t, err, "ERR_VALIDATION")
}

func TestCreateDelivery_InactiveWarehouse(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	req := h.seedApprovedREQ(7)
	h.wh.warehouses[10].IsActive = false

	_, _, err := h.uc.CreateDelivery(whCtx(10), CreateDeliveryInput{
		WarehouseID: 10, RequestID: req.ID, CreatedBy: 9,
	})
	assertAppErr(t, err, "ERR_VALIDATION")
}

func TestCreateDelivery_UnknownWarehouse(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	req := h.seedApprovedREQ(7)

	_, _, err := h.uc.CreateDelivery(whCtx(10), CreateDeliveryInput{
		WarehouseID: 999, RequestID: req.ID, CreatedBy: 9,
	})
	require.ErrorIs(t, err, pgx.ErrNoRows)
}

func TestCreateDelivery_SequenceError(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	req := h.seedApprovedREQ(7)
	h.seq.err = errors.New("seq boom")

	_, _, err := h.uc.CreateDelivery(whCtx(10), CreateDeliveryInput{
		WarehouseID: 10, RequestID: req.ID, CreatedBy: 9,
	})
	require.ErrorContains(t, err, "seq boom")
}

func TestCreateDelivery_PersistError(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	req := h.seedApprovedREQ(7)
	h.docs.errCreate = errors.New("create boom")

	_, _, err := h.uc.CreateDelivery(whCtx(10), CreateDeliveryInput{
		WarehouseID: 10, RequestID: req.ID, CreatedBy: 9,
	})
	require.ErrorContains(t, err, "create boom")
}

func TestDelivery_Submit_WrongDocType(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	req := h.seedApprovedREQ(7)

	err := h.uc.SubmitDelivery(whCtx(10), req.ID)
	assertAppErr(t, err, "ERR_NOT_FOUND")
}

func TestDelivery_Submit_InvalidState(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, _ := h.seedApprovedDO(7)

	err := h.uc.SubmitDelivery(whCtx(10), do.ID)
	assertAppErr(t, err, "ERR_INVALID_STATE")
}

func TestDelivery_Approve_SelfApproval(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	req := h.seedApprovedREQ(7)
	do, _, err := h.uc.CreateDelivery(whCtx(10), CreateDeliveryInput{
		WarehouseID: 10, RequestID: req.ID, CreatedBy: 7,
	})
	require.NoError(t, err)
	require.NoError(t, h.uc.SubmitDelivery(whCtx(10), do.ID))

	err = h.uc.ApproveDelivery(whCtx(10), do.ID, 7)
	assertAppErr(t, err, "ERR_SELF_APPROVAL")
}

func TestDelivery_Approve_DraftState(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	req := h.seedApprovedREQ(7)
	do, _, err := h.uc.CreateDelivery(whCtx(10), CreateDeliveryInput{
		WarehouseID: 10, RequestID: req.ID, CreatedBy: 7,
	})
	require.NoError(t, err)

	err = h.uc.ApproveDelivery(whCtx(10), do.ID, 99)
	assertAppErr(t, err, "ERR_INVALID_STATE")
}

// ─── Allocation edge cases (7.2 / 7.3) ───────────────────────────────────────

func TestAllocate_WrongDocType(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	req := h.seedApprovedREQ(7)

	_, err := h.uc.Allocate(whCtx(10), req.ID, AllocateInput{
		Lines: []LineAllocInput{{LineID: 1, Qty: 1}},
	})
	assertAppErr(t, err, "ERR_NOT_FOUND")
}

func TestAllocate_CandidateLookupError(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, lines := h.seedApprovedDO(7)
	h.cands.errLock = errors.New("lock boom")

	_, err := h.uc.Allocate(whCtx(10), do.ID, AllocateInput{
		Lines: []LineAllocInput{{LineID: lines[0].ID, Qty: 1}},
	})
	require.ErrorContains(t, err, "lock boom")
}

func TestAllocateOverride_WrongDocType(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	req := h.seedApprovedREQ(7)

	_, err := h.uc.AllocateOverride(whCtx(10), req.ID, OverrideInput{
		ReasonCode: "test",
		Lines:      []OverrideLineInput{{LineID: 1, Qty: 1, BalanceID: 500}},
	})
	assertAppErr(t, err, "ERR_NOT_FOUND")
}

func TestAllocateOverride_MissingBalanceID(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, lines := h.seedApprovedDO(7)

	_, err := h.uc.AllocateOverride(whCtx(10), do.ID, OverrideInput{
		ReasonCode: "test",
		Lines:      []OverrideLineInput{{LineID: lines[0].ID, Qty: 1}},
	})
	assertAppErr(t, err, "ERR_VALIDATION")
}

func TestAllocateOverride_CandidateLookupError(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, lines := h.seedApprovedDO(7)
	h.cands.errGetCand = errors.New("cand boom")

	_, err := h.uc.AllocateOverride(whCtx(10), do.ID, OverrideInput{
		ReasonCode: "test",
		Lines:      []OverrideLineInput{{LineID: lines[0].ID, Qty: 1, BalanceID: 500}},
	})
	require.ErrorContains(t, err, "cand boom")
}

// ─── Picking list edge cases (7.4) ───────────────────────────────────────────

func TestPickingList_WrongDocType(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	req := h.seedApprovedREQ(7)

	_, err := h.uc.PickingList(whCtx(10), req.ID)
	assertAppErr(t, err, "ERR_NOT_FOUND")
}

func TestPickingList_GetError(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	h.docs.errGet = errors.New("get boom")

	_, err := h.uc.PickingList(whCtx(10), 123)
	require.ErrorContains(t, err, "get boom")
}

// ─── Pick edge cases (7.5) ───────────────────────────────────────────────────

func TestPick_UnknownItemBarcode(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, _, alloc := h.seedAllocatedDO(7, 10)

	err := h.uc.Pick(whCtx(10), do.ID, PickInput{
		Scans: []PickScanInput{
			{AllocationID: alloc.ID, LocationBarcode: "PK-01-01", ItemBarcode: "9999999999999", Qty: 1},
		},
	})
	assertAppErr(t, err, "ERR_SCAN_MISMATCH")
}

func TestPick_UnknownLocationBarcode(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, _, alloc := h.seedAllocatedDO(7, 10)

	err := h.uc.Pick(whCtx(10), do.ID, PickInput{
		Scans: []PickScanInput{
			{AllocationID: alloc.ID, LocationBarcode: "ZZ-99-99", ItemBarcode: "8991002101001", Qty: 1},
		},
	})
	assertAppErr(t, err, "ERR_SCAN_MISMATCH")
}

func TestPick_UnknownAllocation(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, _ := h.seedApprovedDO(7)

	err := h.uc.Pick(whCtx(10), do.ID, PickInput{
		Scans: []PickScanInput{
			{AllocationID: 424242, LocationBarcode: "PK-01-01", ItemBarcode: "8991002101001", Qty: 1},
		},
	})
	assertAppErr(t, err, "ERR_SCAN_MISMATCH")
}

// ─── Ship edge cases (7.6) ───────────────────────────────────────────────────

func TestShip_WrongDocType(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	req := h.seedApprovedREQ(7)

	_, err := h.uc.Ship(whCtx(10), req.ID, ShipInput{})
	assertAppErr(t, err, "ERR_NOT_FOUND")
}

func TestShip_MergesAllocationsPerBalance(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, _, alloc := h.seedAllocatedDO(7, 10)

	// Second allocation against the same balance, partially picked already —
	// Ship must merge both into a single balance release but keep one ledger
	// row per allocation (FSD §4.2).
	a2 := &document.Allocation{
		DocLineID:    alloc.DocLineID,
		BalanceID:    500,
		QtyAllocated: 3,
		QtyPicked:    3,
		ItemID:       1,
		LocationID:   200,
		LocationCode: "PK-01-01",
	}
	a2.ID = h.docs.nextAlloc
	h.docs.nextAlloc++
	h.docs.allocations[a2.ID] = a2
	h.docs.allocsByLine[alloc.DocLineID] = append(h.docs.allocsByLine[alloc.DocLineID], a2)

	bal := h.stock.byID[500]
	bal.QtyReserved = 13
	bal.QtyOnhand = 13

	require.NoError(t, h.uc.Pick(whCtx(10), do.ID, PickInput{
		Scans: []PickScanInput{
			{AllocationID: alloc.ID, LocationBarcode: "PK-01-01", ItemBarcode: "8991002101001", Qty: 10},
		},
	}))

	status, err := h.uc.Ship(whCtx(10), do.ID, ShipInput{VehicleNo: "B 1 XYZ"})
	require.NoError(t, err)
	assert.Equal(t, document.StatusInProgress, status)

	require.Len(t, h.stock.movements, 2, "one issue movement per allocation")
	total := 0.0
	for _, mv := range h.stock.movements {
		assert.Equal(t, stock.TypeIssue, mv.MovementType)
		total += mv.Qty
	}
	assert.Equal(t, -13.0, total)
	assert.Equal(t, 0.0, bal.QtyOnhand, "onhand reduced by the merged shipped qty")
	assert.Equal(t, 0.0, bal.QtyReserved, "merged reservation released exactly once")
}

func TestShip_ReleaseErrorRollsBack(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, lines := h.seedApprovedDO(7)

	// Allocation pointing at a balance that does not exist in the ledger —
	// UpdateBalanceReserved fails and the whole shipment is aborted.
	orphan := &document.Allocation{
		DocLineID:    lines[0].ID,
		BalanceID:    999,
		QtyAllocated: 5,
		QtyPicked:    5,
		ItemID:       1,
		LocationID:   200,
		LocationCode: "PK-01-01",
	}
	orphan.ID = h.docs.nextAlloc
	h.docs.nextAlloc++
	h.docs.allocations[orphan.ID] = orphan
	h.docs.allocsByLine[lines[0].ID] = append(h.docs.allocsByLine[lines[0].ID], orphan)

	_, err := h.uc.Ship(whCtx(10), do.ID, ShipInput{})
	require.ErrorIs(t, err, pgx.ErrNoRows)
}

func TestShip_GetError(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	h.docs.errGet = errors.New("get boom")

	_, err := h.uc.Ship(whCtx(10), 123, ShipInput{})
	require.ErrorContains(t, err, "get boom")
}

func TestShip_PostingErrorRollsBack(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	do, _, alloc := h.seedAllocatedDO(7, 10)
	require.NoError(t, h.uc.Pick(whCtx(10), do.ID, PickInput{
		Scans: []PickScanInput{{AllocationID: alloc.ID, LocationBarcode: "PK-01-01", ItemBarcode: "8991002101001", Qty: 10}},
	}))

	h.stock.errUpsert = errors.New("upsert boom")
	_, err := h.uc.Ship(whCtx(10), do.ID, ShipInput{})
	require.ErrorContains(t, err, "upsert boom")
	assert.Equal(t, document.StatusApproved, h.docs.docs[do.ID].Status, "document must not move on failed posting")
	assert.Len(t, h.stock.movements, 0, "no ledger rows written on failure")
}

// ─── POD edge cases (7.7) ────────────────────────────────────────────────────

func TestPod_WrongDocType(t *testing.T) {
	h := newHarness(t)
	h.stdItems()
	req := h.seedApprovedREQ(7)

	_, err := h.uc.Pod(whCtx(10), req.ID, PodInput{ReceivedBy: "X"})
	assertAppErr(t, err, "ERR_NOT_FOUND")
}

// whCtx attaches a warehouse scope to a bare context so transition methods
// pass the C-02 cross-warehouse guard (authz.AssertDocInWarehouse). Every doc
// seeded by these tests lives in warehouse 10.
func whCtx(whID int64) context.Context {
	return authz.WithWarehouseID(context.Background(), whID)
}
