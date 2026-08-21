package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"inventory/internal/delivery/http/dto"
	"inventory/internal/delivery/http/response"
	"inventory/internal/domain/document"
	"inventory/internal/domain/stock"
	"inventory/internal/pkg/authz"
	"inventory/internal/pkg/docnum"
	"inventory/internal/pkg/validation"
	inbounduc "inventory/internal/usecase/inbound"
	stockuc "inventory/internal/usecase/stock"

	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"strings"
)

// ─── Minimal mocks (handler layer only forwards; usecase logic is covered
// ─── by internal/usecase/inbound tests) ────────────────────────────────────

type hDocRepo struct {
	docs        map[int64]*document.Document
	lines       map[int64][]*document.DocumentLine
	byKey       map[string]int64
	nextID      int64
	nextLn      int64
	nextAtt     int64
	lastStatus  document.Status
	attachments map[int64]*document.Attachment
}

func newHDocRepo() *hDocRepo {
	return &hDocRepo{docs: map[int64]*document.Document{}, lines: map[int64][]*document.DocumentLine{}, byKey: map[string]int64{}, nextID: 1, attachments: map[int64]*document.Attachment{}}
}

func (m *hDocRepo) Create(ctx context.Context, doc *document.Document, lines []*document.DocumentLine) error {
	doc.ID = m.nextID
	m.nextID++
	for _, ln := range lines {
		m.nextLn++
		ln.ID = m.nextLn
	}
	m.docs[doc.ID] = doc
	m.lines[doc.ID] = lines
	if doc.IdempotencyKey != nil {
		m.byKey[*doc.IdempotencyKey] = doc.ID
	}
	return nil
}

func (m *hDocRepo) GetByID(ctx context.Context, id int64) (*document.Document, []*document.DocumentLine, error) {
	d, ok := m.docs[id]
	if !ok {
		return nil, nil, pgx.ErrNoRows
	}
	return d, m.lines[id], nil
}

func (m *hDocRepo) GetByIDempotencyKey(ctx context.Context, key string) (*document.Document, error) {
	id, ok := m.byKey[key]
	if !ok {
		return nil, pgx.ErrNoRows
	}
	return m.docs[id], nil
}

func (m *hDocRepo) UpdateStatus(ctx context.Context, id int64, status document.Status, approvedBy *int64) error {
	m.docs[id].Status = status
	m.lastStatus = status
	return nil
}

func (m *hDocRepo) TransitionStatus(ctx context.Context, id int64, expected, next document.Status, approvedBy *int64) (bool, error) {
	if m.docs[id].Status != expected {
		return false, nil
	}
	m.docs[id].Status = next
	m.lastStatus = next
	return true, nil
}

func (m *hDocRepo) UpdateLinePutaway(ctx context.Context, lineID int64, qtyProcessed float64, locationID int64) error {
	for _, lines := range m.lines {
		for _, ln := range lines {
			if ln.ID == lineID {
				ln.QtyProcessed = qtyProcessed
				ln.LocationID = &locationID
				return nil
			}
		}
	}
	return nil
}

// ─── Outbound-era additions (unused by receipt flows, harmless stubs) ──────

func (m *hDocRepo) UpdateLineProcessed(ctx context.Context, lineID int64, qtyProcessed float64) error {
	return nil
}

func (m *hDocRepo) CreateAllocations(ctx context.Context, allocations []*document.Allocation) error {
	return nil
}

func (m *hDocRepo) ListAllocations(ctx context.Context, documentID int64) ([]*document.Allocation, error) {
	return nil, nil
}

func (m *hDocRepo) UpdateAllocationPicked(ctx context.Context, id int64, qtyPicked float64) error {
	return nil
}

func (m *hDocRepo) UpdateReasonCode(ctx context.Context, id int64, reasonCode string) error {
	return nil
}

func (m *hDocRepo) GetDelivery(ctx context.Context, documentID int64) (*document.Delivery, error) {
	return nil, pgx.ErrNoRows
}

func (m *hDocRepo) UpsertDelivery(ctx context.Context, d *document.Delivery) error {
	return nil
}

// ── attachment support (lampiran GRN) ─────────────────────────────────────
func (m *hDocRepo) ListAttachments(ctx context.Context, documentID int64) ([]*document.Attachment, error) {
	var out []*document.Attachment
	for _, a := range m.attachments {
		if a.DocumentID == documentID {
			cp := *a
			out = append(out, &cp)
		}
	}
	return out, nil
}

func (m *hDocRepo) CreateAttachment(ctx context.Context, a *document.Attachment) error {
	m.nextAtt++
	a.ID = m.nextAtt
	cp := *a
	m.attachments[a.ID] = &cp
	return nil
}

func (m *hDocRepo) GetAttachmentByID(ctx context.Context, id int64) (*document.Attachment, error) {
	a, ok := m.attachments[id]
	if !ok {
		return nil, pgx.ErrNoRows
	}
	cp := *a
	return &cp, nil
}

func (m *hDocRepo) DeleteAttachment(ctx context.Context, id int64) error {
	delete(m.attachments, id)
	return nil
}

func (m *hDocRepo) NextSequence(ctx context.Context, docType, period string) (int64, error) {
	return 1, nil
}

type hItemLookup struct{}

func (hItemLookup) GetItemByID(ctx context.Context, id int64) (*inbounduc.ItemInfo, error) {
	return &inbounduc.ItemInfo{ID: id, SKU: fmt.Sprintf("SKU-%d", id), BaseUom: "PCS", IsActive: true}, nil
}

func (hItemLookup) UomConvFactor(ctx context.Context, itemID int64, uom string) (float64, error) {
	if uom == "PCS" || uom == "" {
		return 1, nil
	}
	return 0, pgx.ErrNoRows
}

type hWhLookup struct{}

func (hWhLookup) GetWarehouseByID(ctx context.Context, id int64) (*inbounduc.WarehouseInfo, error) {
	return &inbounduc.WarehouseInfo{ID: id, Code: "WH01", IsActive: true}, nil
}

type hLocStore struct{}

func (hLocStore) GetStaging(ctx context.Context, warehouseID int64) (*inbounduc.LocationInfo, error) {
	return &inbounduc.LocationInfo{ID: 100, Code: "STG-01-01", LocType: "staging"}, nil
}

func (hLocStore) GetByWarehouseCode(ctx context.Context, warehouseID int64, code string) (*inbounduc.LocationInfo, error) {
	return &inbounduc.LocationInfo{ID: 200, Code: code, LocType: "pick"}, nil
}

func (hLocStore) PutawayCandidates(ctx context.Context, warehouseID int64) ([]*inbounduc.PutawayCandidate, error) {
	return []*inbounduc.PutawayCandidate{
		{Location: inbounduc.LocationInfo{ID: 200, Code: "PK-01-01", LocType: "pick", PickSeq: &[]int{1}[0]}},
		{Location: inbounduc.LocationInfo{ID: 201, Code: "BLK-01-01", LocType: "bulk"}},
	}, nil
}

type hBatchStore struct{}

func (hBatchStore) GetByItemAndNo(ctx context.Context, itemID int64, batchNo string) (*inbounduc.BatchInfo, error) {
	return nil, pgx.ErrNoRows
}

func (hBatchStore) Create(ctx context.Context, itemID int64, batchNo string, expiry *time.Time) (*inbounduc.BatchInfo, error) {
	return &inbounduc.BatchInfo{ID: 500, ItemID: itemID, BatchNo: batchNo}, nil
}

type hStockRepo struct {
	stock.StockRepository
	balances  map[string]*stock.StockBalance
	movements []*stock.StockMovement
}

func (m *hStockRepo) GetBalancesForUpdate(ctx context.Context, keys []stock.BalanceKey) ([]*stock.StockBalance, error) {
	out := make([]*stock.StockBalance, 0, len(keys))
	for _, k := range keys {
		key := fmt.Sprintf("%d-%d-%s", k.ItemID, k.LocationID, k.Status)
		if b, ok := m.balances[key]; ok {
			out = append(out, b)
		}
	}
	return out, nil
}

func (m *hStockRepo) UpsertBalance(ctx context.Context, b *stock.StockBalance) error {
	key := fmt.Sprintf("%d-%d-%s", b.ItemID, b.LocationID, b.Status)
	m.balances[key] = b
	return nil
}

func (m *hStockRepo) InsertMovement(ctx context.Context, mv *stock.StockMovement) error {
	m.movements = append(m.movements, mv)
	return nil
}

type hTx struct{}

func (hTx) RunInTx(ctx context.Context, fn func(ctx context.Context) error) error { return fn(ctx) }

func newReceiptHarness(t *testing.T) (*ReceiptHandler, *hDocRepo) {
	t.Helper()
	docs := newHDocRepo()
	stockRepo := &hStockRepo{balances: map[string]*stock.StockBalance{}}
	posting := stockuc.NewPostingUsecase(stockRepo, hTx{})
	uc := inbounduc.NewReceiptUsecase(
		docs,
		hItemLookup{}, hWhLookup{}, hLocStore{}, hBatchStore{},
		posting, hTx{}, docnum.NewGenerator(docs),
		inbounduc.WithClock(func() time.Time { return time.Date(2026, 8, 14, 10, 0, 0, 0, time.UTC) }),
	)
	return NewReceiptHandler(uc), docs
}

// serveReceipt runs a request against the handler with a JWT user id in ctx.
// The path must be /api/v1/receipts/:id[/action] (or /api/v1/receipts for POST).
func serveReceipt(t *testing.T, h *ReceiptHandler, method, path string, body any, userID int64) *httptest.ResponseRecorder {
	t.Helper()
	e := echo.New()
	e.Validator = validation.New()
	var payload []byte
	if body != nil {
		payload, _ = json.Marshal(body)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.Set("user_id", userID)
	// RBACMiddleware normally injects the authenticated warehouse here (C-01
	// handler check + C-02 usecase guards). The harness bypasses middleware, so
	// seed warehouse 10 — every document these tests touch lives there.
	c.Set("warehouse_id", int64(10))
	ctx := authz.WithWarehouseID(c.Request().Context(), 10)
	c.SetRequest(c.Request().WithContext(ctx))
	// extract :id between "receipts/" and the next "/" ("" for the create route)
	rest := strings.TrimPrefix(path, "/api/v1/receipts")
	rest = strings.TrimPrefix(rest, "/")
	if i := strings.IndexByte(rest, '/'); i >= 0 {
		rest = rest[:i]
	}
	if rest != "" {
		c.SetParamNames("id")
		c.SetParamValues(rest)
	}
	// route dispatch: pick the handler by method/action
	var err error
	switch {
	case method == http.MethodPost && path == "/api/v1/receipts":
		err = h.CreateReceipt(c)
	case method == http.MethodPost && strings.HasSuffix(path, "/submit"):
		err = h.SubmitReceipt(c)
	case method == http.MethodPost && strings.HasSuffix(path, "/approve"):
		err = h.ApproveReceipt(c)
	case method == http.MethodPost && strings.HasSuffix(path, "/putaway"):
		err = h.Putaway(c)
	case method == http.MethodGet:
		err = h.PutawaySuggestion(c)
	default:
		t.Fatalf("unhandled route %s %s", method, path)
	}
	require.NoError(t, err)
	return rec
}

func decodeEnvelope(t *testing.T, rec *httptest.ResponseRecorder) response.Response {
	t.Helper()
	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	return resp
}

func TestCreateReceipt_Handler_Success(t *testing.T) {
	h, _ := newReceiptHarness(t)
	rec := serveReceipt(t, h, http.MethodPost, "/api/v1/receipts", dto.CreateReceiptRequest{
		WarehouseID: 10,
		Lines:       []dto.ReceiptLineRequest{{ItemID: 3, Qty: 10}},
	}, 7)

	assert.Equal(t, http.StatusCreated, rec.Code)
	resp := decodeEnvelope(t, rec)
	assert.True(t, resp.Success)
	data := resp.Data.(map[string]any)
	assert.Equal(t, "GRN/WH01/2608/00001", data["doc_no"])
	assert.Equal(t, "draft", data["status"])
}

func TestCreateReceipt_Handler_EmptyLines422(t *testing.T) {
	h, _ := newReceiptHarness(t)
	rec := serveReceipt(t, h, http.MethodPost, "/api/v1/receipts", dto.CreateReceiptRequest{
		WarehouseID: 10,
		Lines:       []dto.ReceiptLineRequest{},
	}, 7)

	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	resp := decodeEnvelope(t, rec)
	require.NotNil(t, resp.Error)
	assert.Equal(t, "ERR_VALIDATION", resp.Error.Code)
	require.NotEmpty(t, resp.Error.Details)
	assert.Equal(t, "lines", resp.Error.Details[0].Field)
}

func TestCreateReceipt_Handler_HeaderIdempotencyKey(t *testing.T) {
	// FSD 4.5: the key arrives as the Idempotency-Key header, not the body.
	h, docs := newReceiptHarness(t)
	e := echo.New()
	e.Validator = validation.New()
	payload, _ := json.Marshal(dto.CreateReceiptRequest{WarehouseID: 10, Lines: []dto.ReceiptLineRequest{{ItemID: 3, Qty: 10}}})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/receipts", bytes.NewReader(payload))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	req.Header.Set("Idempotency-Key", "6f1e9b2a-3c4d-4e5f-8a9b-0c1d2e3f4a5b")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.Set("user_id", int64(7))
	// RBACMiddleware normally injects the authenticated warehouse (C-01);
	// harness bypasses middleware, so seed the matching warehouse_id.
	c.Set("warehouse_id", int64(10))
	require.NoError(t, h.CreateReceipt(c))
	assert.Equal(t, http.StatusCreated, rec.Code)
	require.Equal(t, "6f1e9b2a-3c4d-4e5f-8a9b-0c1d2e3f4a5b", *docs.docs[1].IdempotencyKey)

	// replay with the same header must return the same document, not a 409
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/receipts", bytes.NewReader(payload))
	req2.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	req2.Header.Set("Idempotency-Key", "6f1e9b2a-3c4d-4e5f-8a9b-0c1d2e3f4a5b")
	rec2 := httptest.NewRecorder()
	c2 := e.NewContext(req2, rec2)
	c2.Set("user_id", int64(7))
	c2.Set("warehouse_id", int64(10))
	require.NoError(t, h.CreateReceipt(c2))
	assert.Equal(t, http.StatusCreated, rec2.Code)
	resp := decodeEnvelope(t, rec2)
	assert.Equal(t, float64(1), resp.Data.(map[string]any)["id"], "replay returns the original document")
}

func TestCreateReceipt_Handler_InvalidIdempotencyKey422(t *testing.T) {
	h, _ := newReceiptHarness(t)
	e := echo.New()
	e.Validator = validation.New()
	payload, _ := json.Marshal(dto.CreateReceiptRequest{WarehouseID: 10, Lines: []dto.ReceiptLineRequest{{ItemID: 3, Qty: 10}}})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/receipts", bytes.NewReader(payload))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	req.Header.Set("Idempotency-Key", "not-a-uuid")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.Set("user_id", int64(7))
	require.NoError(t, h.CreateReceipt(c))
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	resp := decodeEnvelope(t, rec)
	require.NotNil(t, resp.Error)
	assert.Equal(t, "ERR_VALIDATION", resp.Error.Code)
	assert.Equal(t, "idempotency_key", resp.Error.Details[0].Field)
}

func TestCreateReceipt_Handler_BadExpiryDate422(t *testing.T) {
	h, _ := newReceiptHarness(t)
	bad := "14-08-2026"
	rec := serveReceipt(t, h, http.MethodPost, "/api/v1/receipts", dto.CreateReceiptRequest{
		WarehouseID: 10,
		Lines:       []dto.ReceiptLineRequest{{ItemID: 3, Qty: 10, ExpiryDate: &bad}},
	}, 7)

	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	resp := decodeEnvelope(t, rec)
	require.NotNil(t, resp.Error)
	assert.Equal(t, "ERR_VALIDATION", resp.Error.Code)
	require.NotEmpty(t, resp.Error.Details)
	assert.Equal(t, "expiry_date", resp.Error.Details[0].Field)
}

func TestReceipt_Handler_FlowEndToEnd(t *testing.T) {
	h, docs := newReceiptHarness(t)

	// create
	rec := serveReceipt(t, h, http.MethodPost, "/api/v1/receipts", dto.CreateReceiptRequest{
		WarehouseID: 10,
		Lines:       []dto.ReceiptLineRequest{{ItemID: 3, Qty: 10}},
	}, 7)
	assert.Equal(t, http.StatusCreated, rec.Code)
	doc := docs.docs[1]
	require.NotNil(t, doc)

	// submit
	rec = serveReceipt(t, h, http.MethodPost, "/api/v1/receipts/1/submit", nil, 7)
	assert.Equal(t, http.StatusOK, rec.Code)
	resp := decodeEnvelope(t, rec)
	assert.Equal(t, "submitted", resp.Data.(map[string]any)["status"])

	// approve
	rec = serveReceipt(t, h, http.MethodPost, "/api/v1/receipts/1/approve", nil, 8)
	assert.Equal(t, http.StatusOK, rec.Code)

	// putaway suggestion
	rec = serveReceipt(t, h, http.MethodGet, "/api/v1/receipts/1/putaway-suggestion", nil, 8)
	assert.Equal(t, http.StatusOK, rec.Code)
	resp = decodeEnvelope(t, rec)
	assert.NotEmpty(t, resp.Data.([]any))

	// putaway (partial → in_progress)
	rec = serveReceipt(t, h, http.MethodPost, "/api/v1/receipts/1/putaway", dto.PutawayRequest{
		Lines: []dto.PutawayScanRequest{{LineID: 1, Qty: 4, LocationCode: "PK-01-01"}},
	}, 8)
	assert.Equal(t, http.StatusOK, rec.Code)
	resp = decodeEnvelope(t, rec)
	assert.Equal(t, "in_progress", resp.Data.(map[string]any)["status"])

	// finish the remaining qty → completed
	rec = serveReceipt(t, h, http.MethodPost, "/api/v1/receipts/1/putaway", dto.PutawayRequest{
		Lines: []dto.PutawayScanRequest{{LineID: 1, Qty: 6, LocationCode: "PK-01-01"}},
	}, 8)
	assert.Equal(t, http.StatusOK, rec.Code)
	resp = decodeEnvelope(t, rec)
	assert.Equal(t, "completed", resp.Data.(map[string]any)["status"])
}

func TestReceipt_Handler_SubmitBadID(t *testing.T) {
	h, _ := newReceiptHarness(t)
	e := echo.New()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/receipts/not-a-number/submit", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("not-a-number")
	c.Set("user_id", int64(7))

	err := h.SubmitReceipt(c)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}

func TestReceipt_Handler_NotFound(t *testing.T) {
	h, _ := newReceiptHarness(t)
	rec := serveReceipt(t, h, http.MethodPost, "/api/v1/receipts/999/submit", nil, 7)
	assert.Equal(t, http.StatusNotFound, rec.Code)
	resp := decodeEnvelope(t, rec)
	require.NotNil(t, resp.Error)
	assert.Equal(t, "ERR_NOT_FOUND", resp.Error.Code)
}

func TestPutaway_Handler_EmptyScans422(t *testing.T) {
	h, _ := newReceiptHarness(t)
	rec := serveReceipt(t, h, http.MethodPost, "/api/v1/receipts/1/putaway", dto.PutawayRequest{
		Lines: []dto.PutawayScanRequest{},
	}, 8)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}
