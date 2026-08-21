package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"inventory/internal/delivery/http/dto"
	"inventory/internal/delivery/http/response"
	"inventory/internal/domain/document"
	"inventory/internal/domain/stock"
	"inventory/internal/pkg/authz"
	"inventory/internal/pkg/docnum"
	"inventory/internal/pkg/validation"
	outbounduc "inventory/internal/usecase/outbound"
	stockuc "inventory/internal/usecase/stock"

	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─── Mocks (handler layer forwards to the usecase; business logic is covered
// ─── by internal/usecase/outbound tests) ────────────────────────────────────

type oDocs struct {
	docs        map[int64]*document.Document
	lines       map[int64][]*document.DocumentLine
	byKey       map[string]int64
	allocations map[int64]*document.Allocation
	nextID      int64
	nextLine    int64
	nextAlloc   int64
}

func newODocs() *oDocs {
	return &oDocs{
		docs:        map[int64]*document.Document{},
		lines:       map[int64][]*document.DocumentLine{},
		byKey:       map[string]int64{},
		allocations: map[int64]*document.Allocation{},
		nextID:      1,
		nextLine:    1,
		nextAlloc:   1,
	}
}

func (m *oDocs) seed(doc *document.Document, lines []*document.DocumentLine) {
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

func (m *oDocs) Create(ctx context.Context, doc *document.Document, lines []*document.DocumentLine) error {
	m.seed(doc, lines)
	return nil
}

func (m *oDocs) GetByID(ctx context.Context, id int64) (*document.Document, []*document.DocumentLine, error) {
	d, ok := m.docs[id]
	if !ok {
		return nil, nil, pgx.ErrNoRows
	}
	return d, m.lines[id], nil
}

func (m *oDocs) GetByIDempotencyKey(ctx context.Context, key string) (*document.Document, error) {
	id, ok := m.byKey[key]
	if !ok {
		return nil, pgx.ErrNoRows
	}
	return m.docs[id], nil
}

func (m *oDocs) UpdateStatus(ctx context.Context, id int64, status document.Status, approvedBy *int64) error {
	m.docs[id].Status = status
	if approvedBy != nil {
		m.docs[id].ApprovedBy = approvedBy
	}
	return nil
}

func (m *oDocs) TransitionStatus(ctx context.Context, id int64, expected, next document.Status, approvedBy *int64) (bool, error) {
	if m.docs[id].Status != expected {
		return false, nil
	}
	m.docs[id].Status = next
	if approvedBy != nil {
		m.docs[id].ApprovedBy = approvedBy
	}
	return true, nil
}

func (m *oDocs) UpdateLinePutaway(ctx context.Context, lineID int64, qtyProcessed float64, locationID int64) error {
	return nil
}

func (m *oDocs) UpdateLineProcessed(ctx context.Context, lineID int64, qtyProcessed float64) error {
	return nil
}

func (m *oDocs) CreateAllocations(ctx context.Context, allocations []*document.Allocation) error {
	for _, a := range allocations {
		a.ID = m.nextAlloc
		m.nextAlloc++
		a.ItemID = 1
		a.LocationID = 200
		a.LocationCode = "PK-01-01"
		m.allocations[a.ID] = a
	}
	return nil
}

func (m *oDocs) ListAllocations(ctx context.Context, documentID int64) ([]*document.Allocation, error) {
	out := make([]*document.Allocation, 0, len(m.allocations))
	for _, a := range m.allocations {
		out = append(out, a)
	}
	return out, nil
}

func (m *oDocs) UpdateAllocationPicked(ctx context.Context, id int64, qtyPicked float64) error {
	if a, ok := m.allocations[id]; ok {
		a.QtyPicked += qtyPicked
	}
	return nil
}

func (m *oDocs) UpdateReasonCode(ctx context.Context, id int64, reasonCode string) error {
	return nil
}

func (m *oDocs) GetDelivery(ctx context.Context, documentID int64) (*document.Delivery, error) {
	return nil, pgx.ErrNoRows
}

func (m *oDocs) UpsertDelivery(ctx context.Context, d *document.Delivery) error {
	return nil
}

// ── attachment stubs (lampiran GRN) ───────────────────────────────────────
func (m *oDocs) ListAttachments(ctx context.Context, documentID int64) ([]*document.Attachment, error) {
	return nil, nil
}

func (m *oDocs) CreateAttachment(ctx context.Context, a *document.Attachment) error {
	return nil
}

func (m *oDocs) GetAttachmentByID(ctx context.Context, id int64) (*document.Attachment, error) {
	return nil, nil
}

func (m *oDocs) DeleteAttachment(ctx context.Context, id int64) error {
	return nil
}

func (m *oDocs) NextSequence(ctx context.Context, docType, period string) (int64, error) {
	return 1, nil
}

type oItems struct{}

func (oItems) GetItemByID(ctx context.Context, id int64) (*outbounduc.ItemInfo, error) {
	if id == 0 {
		return nil, pgx.ErrNoRows
	}
	return &outbounduc.ItemInfo{ID: id, SKU: fmt.Sprintf("SKU-%d", id), BaseUom: "PCS", IsActive: true}, nil
}

func (oItems) UomConvFactor(ctx context.Context, itemID int64, uom string) (float64, error) {
	if uom == "PCS" || uom == "" {
		return 1, nil
	}
	return 0, pgx.ErrNoRows
}

func (oItems) GetItemByBarcode(ctx context.Context, barcode string) (*outbounduc.BarcodeItem, error) {
	if barcode != "8991002101001" {
		return nil, pgx.ErrNoRows
	}
	return &outbounduc.BarcodeItem{ItemID: 1, SKU: "SKU-001", BaseUom: "PCS", Uom: "PCS", ConvFactor: 1}, nil
}

type oWh struct{}

func (oWh) GetWarehouseByID(ctx context.Context, id int64) (*outbounduc.WarehouseInfo, error) {
	return &outbounduc.WarehouseInfo{ID: id, Code: "WH01", IsActive: true}, nil
}

type oLocs struct{}

func (oLocs) GetByWarehouseCode(ctx context.Context, warehouseID int64, code string) (*outbounduc.LocationInfo, error) {
	if code != "PK-01-01" {
		return nil, pgx.ErrNoRows
	}
	return &outbounduc.LocationInfo{ID: 200, WarehouseID: warehouseID, Code: code, LocType: "pick"}, nil
}

type oCands struct{}

func (oCands) LockAllocationCandidates(ctx context.Context, itemID, warehouseID int64) ([]*outbounduc.AllocationCandidate, error) {
	return []*outbounduc.AllocationCandidate{
		{BalanceID: 500, ItemID: itemID, LocationID: 200, QtyFree: 100, LocationCode: "PK-01-01"},
	}, nil
}

func (oCands) GetCandidateByBalanceID(ctx context.Context, balanceID, warehouseID int64) (*outbounduc.AllocationCandidate, error) {
	if balanceID != 500 {
		return nil, pgx.ErrNoRows
	}
	return &outbounduc.AllocationCandidate{BalanceID: 500, ItemID: 1, LocationID: 200, QtyFree: 100, LocationCode: "PK-01-01"}, nil
}

func (oCands) UpdateBalanceReserved(ctx context.Context, balanceID int64, delta float64) error {
	return nil
}

type oStock struct {
	stock.StockRepository
	movements []*stock.StockMovement
}

func (m *oStock) GetBalancesForUpdate(ctx context.Context, keys []stock.BalanceKey) ([]*stock.StockBalance, error) {
	return nil, nil
}

func (m *oStock) UpsertBalance(ctx context.Context, b *stock.StockBalance) error {
	return nil
}

func (m *oStock) InsertMovement(ctx context.Context, mv *stock.StockMovement) error {
	m.movements = append(m.movements, mv)
	return nil
}

func (m *oStock) GetMovements(ctx context.Context, filter stock.MovementFilter) ([]*stock.StockMovement, error) {
	return m.movements, nil
}

func (m *oStock) UpdateBalanceReserved(ctx context.Context, id int64, delta float64) error {
	return nil
}

type oTx struct{}

func (oTx) RunInTx(ctx context.Context, fn func(ctx context.Context) error) error { return fn(ctx) }

func newOutboundHarness(t *testing.T) (*OutboundHandler, *oDocs) {
	t.Helper()
	docs := newODocs()
	stockRepo := &oStock{}
	posting := stockuc.NewPostingUsecase(stockRepo, oTx{})
	uc := outbounduc.NewOutboundUsecase(
		docs,
		oItems{}, oWh{}, oLocs{}, oCands{}, stockRepo, oTx{}, posting,
		docnum.NewGenerator(docs),
		outbounduc.WithClock(func() time.Time { return time.Date(2026, 8, 14, 10, 0, 0, 0, time.UTC) }),
	)
	return NewOutboundHandler(uc), docs
}

func serveOutbound(t *testing.T, h *OutboundHandler, method, path string, body any, userID int64) *httptest.ResponseRecorder {
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

	// extract {id} from the path (empty for collection POST routes)
	segments := strings.Split(path, "/")
	id := ""
	for i, s := range segments {
		if s == "requests" || s == "deliveries" {
			if i+1 < len(segments) && segments[i+1] != "" {
				id = segments[i+1]
			}
		}
	}
	if id != "" {
		c.SetParamNames("id")
		c.SetParamValues(id)
	}

	var err error
	switch {
	case method == http.MethodPost && path == "/api/v1/requests":
		err = h.CreateRequest(c)
	case method == http.MethodPost && strings.HasSuffix(path, "/requests/"+id+"/submit"):
		err = h.SubmitRequest(c)
	case method == http.MethodPost && strings.HasSuffix(path, "/requests/"+id+"/approve"):
		err = h.ApproveRequest(c)
	case method == http.MethodPost && path == "/api/v1/deliveries":
		err = h.CreateDelivery(c)
	case method == http.MethodPost && strings.HasSuffix(path, "/submit"):
		err = h.SubmitDelivery(c)
	case method == http.MethodPost && strings.HasSuffix(path, "/approve"):
		err = h.ApproveDelivery(c)
	case method == http.MethodPost && strings.HasSuffix(path, "/allocate/override"):
		err = h.AllocateOverride(c)
	case method == http.MethodPost && strings.HasSuffix(path, "/allocate"):
		err = h.Allocate(c)
	case method == http.MethodGet:
		err = h.PickingList(c)
	case method == http.MethodPost && strings.HasSuffix(path, "/pick"):
		err = h.Pick(c)
	case method == http.MethodPost && strings.HasSuffix(path, "/ship"):
		err = h.Ship(c)
	case method == http.MethodPost && strings.HasSuffix(path, "/pod"):
		err = h.Pod(c)
	default:
		t.Fatalf("unhandled route %s %s", method, path)
	}
	require.NoError(t, err)
	return rec
}

func TestCreateRequest_Handler_Success(t *testing.T) {
	h, _ := newOutboundHarness(t)
	rec := serveOutbound(t, h, http.MethodPost, "/api/v1/requests", dto.CreateRequestRequest{
		WarehouseID: 10,
		Lines:       []dto.RequestLineRequest{{ItemID: 3, Qty: 10}},
	}, 7)

	assert.Equal(t, http.StatusCreated, rec.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	data := resp.Data.(map[string]any)
	assert.Equal(t, "REQ/WH01/2608/00001", data["doc_no"])
	assert.Equal(t, "draft", data["status"])
}

func TestCreateRequest_Handler_EmptyLines422(t *testing.T) {
	h, _ := newOutboundHarness(t)
	rec := serveOutbound(t, h, http.MethodPost, "/api/v1/requests", dto.CreateRequestRequest{
		WarehouseID: 10,
		Lines:       []dto.RequestLineRequest{},
	}, 7)

	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.NotNil(t, resp.Error)
	assert.Equal(t, "ERR_VALIDATION", resp.Error.Code)
}

func TestCreateRequest_Handler_BadID(t *testing.T) {
	h, _ := newOutboundHarness(t)
	e := echo.New()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/requests/not-a-number/submit", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("not-a-number")
	c.Set("user_id", int64(7))
	require.NoError(t, h.SubmitRequest(c))
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}

func TestCreateDelivery_Handler_RequestNotApproved422(t *testing.T) {
	h, docs := newOutboundHarness(t)
	// Seed a REQ that stays draft (never approved).
	req := &document.Document{DocNo: "REQ/WH01/2608/00001", DocType: document.DocTypeRequest, Status: document.StatusDraft, WarehouseID: 10, CreatedBy: 7}
	docs.seed(req, []*document.DocumentLine{{LineNo: 1, ItemID: 1, Uom: "PCS", ConvFactor: 1, QtyRequest: 10}})

	rec := serveOutbound(t, h, http.MethodPost, "/api/v1/deliveries", dto.CreateDeliveryRequest{
		WarehouseID: 10,
		RequestID:   req.ID,
	}, 9)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.NotNil(t, resp.Error)
	assert.Equal(t, "ERR_VALIDATION", resp.Error.Code)
	assert.Equal(t, "request_id", resp.Error.Details[0].Field)
}

func TestCreateDelivery_Handler_UnknownRequest404(t *testing.T) {
	h, _ := newOutboundHarness(t)
	rec := serveOutbound(t, h, http.MethodPost, "/api/v1/deliveries", dto.CreateDeliveryRequest{
		WarehouseID: 10,
		RequestID:   99999,
	}, 9)
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestAllocate_Handler_StockInsufficient409(t *testing.T) {
	h, docs := newOutboundHarness(t)
	// Seed an approved DO whose line asks for 1000 (candidates only offer 100).
	do := &document.Document{DocNo: "DO/WH01/2608/00001", DocType: document.DocTypeDO, Status: document.StatusApproved, WarehouseID: 10, CreatedBy: 7}
	docs.seed(do, []*document.DocumentLine{{LineNo: 1, ItemID: 1, Uom: "PCS", ConvFactor: 1, QtyRequest: 1000}})

	rec := serveOutbound(t, h, http.MethodPost, "/api/v1/deliveries/1/allocate", dto.AllocateRequest{
		Lines: []dto.AllocateLineRequest{{LineID: docs.lines[do.ID][0].ID, Qty: 1000}},
	}, 7)
	assert.Equal(t, http.StatusConflict, rec.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.NotNil(t, resp.Error)
	assert.Equal(t, "ERR_STOCK_INSUFFICIENT", resp.Error.Code)
	require.NotEmpty(t, resp.Error.Details, "shortage details must be forwarded")
}

func TestPick_Handler_ScanMismatch409(t *testing.T) {
	h, docs := newOutboundHarness(t)
	do := &document.Document{DocNo: "DO/WH01/2608/00001", DocType: document.DocTypeDO, Status: document.StatusApproved, WarehouseID: 10, CreatedBy: 7}
	docs.seed(do, []*document.DocumentLine{{LineNo: 1, ItemID: 1, Uom: "PCS", ConvFactor: 1, QtyRequest: 10}})
	docs.allocations[1] = &document.Allocation{ID: 1, DocLineID: docs.lines[do.ID][0].ID, BalanceID: 500,
		QtyAllocated: 10, ItemID: 1, LocationID: 200, LocationCode: "PK-01-01"}

	rec := serveOutbound(t, h, http.MethodPost, "/api/v1/deliveries/1/pick", dto.PickRequest{
		Scans: []dto.PickScanRequest{{AllocationID: 1, LocationBarcode: "PK-01-01", ItemBarcode: "WRONG", Qty: 1}},
	}, 7)
	assert.Equal(t, http.StatusConflict, rec.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.NotNil(t, resp.Error)
	assert.Equal(t, "ERR_SCAN_MISMATCH", resp.Error.Code)
}

func TestShip_Handler_NothingPicked422(t *testing.T) {
	h, docs := newOutboundHarness(t)
	do := &document.Document{DocNo: "DO/WH01/2608/00001", DocType: document.DocTypeDO, Status: document.StatusApproved, WarehouseID: 10, CreatedBy: 7}
	docs.seed(do, []*document.DocumentLine{{LineNo: 1, ItemID: 1, Uom: "PCS", ConvFactor: 1, QtyRequest: 10}})

	rec := serveOutbound(t, h, http.MethodPost, "/api/v1/deliveries/1/ship", dto.ShipRequest{VehicleNo: "B 1234 XYZ"}, 7)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}

func TestPod_Handler_RequiresReceiver422(t *testing.T) {
	h, docs := newOutboundHarness(t)
	do := &document.Document{DocNo: "DO/WH01/2608/00001", DocType: document.DocTypeDO, Status: document.StatusInProgress, WarehouseID: 10, CreatedBy: 7}
	docs.seed(do, nil)

	rec := serveOutbound(t, h, http.MethodPost, "/api/v1/deliveries/1/pod", dto.PodRequest{}, 7)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}

func TestOutbound_Handler_NotFound(t *testing.T) {
	h, _ := newOutboundHarness(t)
	rec := serveOutbound(t, h, http.MethodPost, "/api/v1/requests/999/approve", nil, 8)
	assert.Equal(t, http.StatusNotFound, rec.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.NotNil(t, resp.Error)
	assert.Equal(t, "ERR_NOT_FOUND", resp.Error.Code)
}
