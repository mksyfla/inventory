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
	"inventory/internal/domain/document"
	"inventory/internal/domain/stock"
	"inventory/internal/pkg/docnum"
	"inventory/internal/pkg/validation"
	countinguc "inventory/internal/usecase/counting"
	stockuc "inventory/internal/usecase/stock"
	transferuc "inventory/internal/usecase/transfer"

	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─── Shared minimal mocks (handler layer forwards to the usecase; business
// ─── logic is covered by internal/usecase/transfer|counting tests) ──────────

type tDocs struct {
	docs   map[int64]*document.Document
	lines  map[int64][]*document.DocumentLine
	byKey  map[string]int64
	nextID int64
}

func newTDocs() *tDocs {
	return &tDocs{docs: map[int64]*document.Document{}, lines: map[int64][]*document.DocumentLine{}, byKey: map[string]int64{}, nextID: 1}
}

func (m *tDocs) GetByID(ctx context.Context, id int64) (*document.Document, []*document.DocumentLine, error) {
	d, ok := m.docs[id]
	if !ok {
		return nil, nil, pgx.ErrNoRows
	}
	return d, m.lines[id], nil
}

func (m *tDocs) Create(ctx context.Context, doc *document.Document, lines []*document.DocumentLine) error {
	doc.ID = m.nextID
	m.nextID++
	m.docs[doc.ID] = doc
	m.lines[doc.ID] = lines
	if doc.IdempotencyKey != nil {
		m.byKey[*doc.IdempotencyKey] = doc.ID
	}
	return nil
}

func (m *tDocs) UpdateStatus(ctx context.Context, id int64, status document.Status, approvedBy *int64) error {
	if d, ok := m.docs[id]; ok {
		d.Status = status
	}
	return nil
}

func (m *tDocs) GetByIDempotencyKey(ctx context.Context, key string) (*document.Document, error) {
	id, ok := m.byKey[key]
	if !ok {
		return nil, pgx.ErrNoRows
	}
	return m.docs[id], nil
}

func (m *tDocs) NextSequence(ctx context.Context, docType, period string) (int64, error) { return 1, nil }
func (m *tDocs) CreateTransferReceipt(ctx context.Context, rec *document.TransferReceipt) error {
	rec.ID = 1
	rec.Variance = rec.QtyReceived - rec.QtySent
	return nil
}

type tItems struct{}

func (tItems) GetItemByID(ctx context.Context, id int64) (*transferuc.ItemInfo, error) {
	return &transferuc.ItemInfo{ID: id, SKU: fmt.Sprintf("SKU-%d", id), BaseUom: "PCS", IsActive: true}, nil
}
func (tItems) UomConvFactor(ctx context.Context, itemID int64, uom string) (float64, error) {
	if uom == "PCS" || uom == "" {
		return 1, nil
	}
	return 0, pgx.ErrNoRows
}

type tWh struct{}

func (tWh) GetWarehouseByID(ctx context.Context, id int64) (*transferuc.WarehouseInfo, error) {
	return &transferuc.WarehouseInfo{ID: id, Code: fmt.Sprintf("WH%02d", id), IsActive: true}, nil
}

type tLocs struct{}

func (tLocs) GetLocationByID(ctx context.Context, id int64) (*transferuc.LocationInfo, error) {
	return &transferuc.LocationInfo{ID: id, WarehouseID: 20, Code: "PK-20-01", LocType: "pick", IsActive: true}, nil
}
func (tLocs) GetTransitLocation(ctx context.Context, warehouseID int64) (*transferuc.LocationInfo, error) {
	return &transferuc.LocationInfo{ID: 900, WarehouseID: warehouseID, Code: "TRS-01", LocType: "transit", IsActive: true}, nil
}

type tCands struct{}

func (tCands) LockCandidates(ctx context.Context, itemID, warehouseID int64) ([]*transferuc.Candidate, error) {
	return []*transferuc.Candidate{{BalanceID: 1, ItemID: itemID, LocationID: 100, QtyFree: 9999}}, nil
}

type tAudit struct{}

func (tAudit) InsertAuditLog(ctx context.Context, userID int64, action, entity string, entityID int64, newValue []byte) error {
	return nil
}

// tStock mirrors stock tables for the posting engine.
type tStock struct {
	balances map[string]*stock.StockBalance
	byID     map[int64]*stock.StockBalance
	nextID   int64
}

func newTStock() *tStock {
	return &tStock{balances: map[string]*stock.StockBalance{}, byID: map[int64]*stock.StockBalance{}, nextID: 1}
}

func tKey(itemID, locationID int64, batch *int64, status stock.StockStatus) string {
	b := int64(0)
	if batch != nil {
		b = *batch
	}
	return fmt.Sprintf("%d-%d-%d-%s", itemID, locationID, b, status)
}

func (m *tStock) GetBalancesForUpdate(ctx context.Context, keys []stock.BalanceKey) ([]*stock.StockBalance, error) {
	var out []*stock.StockBalance
	for _, k := range keys {
		if b, ok := m.balances[tKey(k.ItemID, k.LocationID, k.BatchID, k.Status)]; ok {
			out = append(out, b)
		}
	}
	return out, nil
}
func (m *tStock) UpsertBalance(ctx context.Context, b *stock.StockBalance) error {
	if b.ID == 0 {
		b.ID = m.nextID
		m.nextID++
	}
	m.balances[tKey(b.ItemID, b.LocationID, b.BatchID, b.Status)] = b
	m.byID[b.ID] = b
	return nil
}
func (m *tStock) InsertMovement(ctx context.Context, mv *stock.StockMovement) error { return nil }
func (m *tStock) GetMovements(ctx context.Context, filter stock.MovementFilter) ([]*stock.StockMovement, error) {
	return nil, nil
}
func (m *tStock) UpdateBalanceReserved(ctx context.Context, id int64, delta float64) error { return nil }

type noTx struct{}

func (noTx) RunInTx(ctx context.Context, fn func(ctx context.Context) error) error { return fn(ctx) }

func newTransferHandler() *TransferHandler {
	docs := newTDocs()
	posting := stockuc.NewPostingUsecase(newTStock(), noTx{})
	uc := transferuc.NewTransferUsecase(docs, tItems{}, tWh{}, tLocs{}, tCands{}, posting, noTx{},
		docnum.NewGenerator(docs), tAudit{},
		transferuc.WithClock(func() time.Time { return time.Date(2026, 8, 14, 10, 0, 0, 0, time.UTC) }),
	)
	return NewTransferHandler(uc)
}

func serveTransfer(t *testing.T, h *TransferHandler, method, path string, body any, userID int64) *httptest.ResponseRecorder {
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
	if strings.Contains(path, "/transfers/") {
		c.SetParamNames("id")
		c.SetParamValues(strings.Split(path, "/")[4])
	}
	var err error
	switch {
	case method == http.MethodPost && path == "/api/v1/transfers":
		err = h.CreateTransfer(c)
	case method == http.MethodPost && strings.HasSuffix(path, "/send"):
		err = h.SendTransfer(c)
	case method == http.MethodPost && strings.HasSuffix(path, "/receive"):
		err = h.ReceiveTransfer(c)
	default:
		t.Fatalf("unhandled route %s %s", method, path)
	}
	require.NoError(t, err)
	return rec
}

// ─── Transfer handler ────────────────────────────────────────────────────────

func TestTransferHandler_Create_Success(t *testing.T) {
	h := newTransferHandler()
	rec := serveTransfer(t, h, http.MethodPost, "/api/v1/transfers", dto.CreateTransferRequest{
		WarehouseID:     10,
		DestWarehouseID: 20,
		Notes:           "pindah stok",
		Lines:           []dto.TransferLineRequest{{ItemID: 1, Qty: 10}},
	}, 7)
	assert.Equal(t, http.StatusCreated, rec.Code)

	var envelope struct {
		Success bool `json:"success"`
		Data    struct {
			ID              int64  `json:"id"`
			DocNo           string `json:"doc_no"`
			DocType         string `json:"doc_type"`
			Status          string `json:"status"`
			DestWarehouseID *int64 `json:"dest_warehouse_id"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &envelope))
	assert.True(t, envelope.Success)
	assert.Equal(t, "TRF", envelope.Data.DocType)
	assert.Equal(t, "draft", envelope.Data.Status)
	require.NotNil(t, envelope.Data.DestWarehouseID)
	assert.Equal(t, int64(20), *envelope.Data.DestWarehouseID)
}

func TestTransferHandler_Validation(t *testing.T) {
	h := newTransferHandler()

	t.Run("empty lines → 422", func(t *testing.T) {
		rec := serveTransfer(t, h, http.MethodPost, "/api/v1/transfers", dto.CreateTransferRequest{
			WarehouseID: 10, DestWarehouseID: 20,
		}, 7)
		assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
		assert.Contains(t, rec.Body.String(), "ERR_VALIDATION")
	})
	t.Run("same source and dest → 422", func(t *testing.T) {
		rec := serveTransfer(t, h, http.MethodPost, "/api/v1/transfers", dto.CreateTransferRequest{
			WarehouseID: 10, DestWarehouseID: 10,
			Lines: []dto.TransferLineRequest{{ItemID: 1, Qty: 5}},
		}, 7)
		assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	})
	t.Run("malformed json → 422", func(t *testing.T) {
		e := echo.New()
		req := httptest.NewRequest(http.MethodPost, "/api/v1/transfers", bytes.NewReader([]byte("{not-json")))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.Set("user_id", int64(7))
		require.NoError(t, h.CreateTransfer(c))
		assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	})
	t.Run("bad path id → 422", func(t *testing.T) {
		e := echo.New()
		req := httptest.NewRequest(http.MethodPost, "/api/v1/transfers/abc/send", nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.Set("user_id", int64(7))
		c.SetParamNames("id")
		c.SetParamValues("abc")
		require.NoError(t, h.SendTransfer(c))
		assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	})
	t.Run("invalid idempotency key → 422", func(t *testing.T) {
		rec := serveTransfer(t, h, http.MethodPost, "/api/v1/transfers", dto.CreateTransferRequest{
			WarehouseID: 10, DestWarehouseID: 20, IdempotencyKey: "not-a-uuid",
			Lines: []dto.TransferLineRequest{{ItemID: 1, Qty: 5}},
		}, 7)
		assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	})
}

// ─── Counting handler ────────────────────────────────────────────────────────

type cDocs struct {
	tDocs
	countLines map[int64][]*document.CountLine
	nextLine   int64
}

func newCDocs() *cDocs {
	return &cDocs{tDocs: *newTDocs(), countLines: map[int64][]*document.CountLine{}, nextLine: 1}
}

func (m *cDocs) Create(ctx context.Context, doc *document.Document, lines []*document.DocumentLine) error {
	doc.ID = m.nextID
	m.nextID++
	m.docs[doc.ID] = doc
	if doc.IdempotencyKey != nil {
		m.byKey[*doc.IdempotencyKey] = doc.ID
	}
	return nil
}

func (m *cDocs) CreateCountLines(ctx context.Context, lines []*document.CountLine) error {
	for _, ln := range lines {
		ln.ID = m.nextLine
		m.nextLine++
		m.countLines[ln.DocumentID] = append(m.countLines[ln.DocumentID], ln)
	}
	return nil
}
func (m *cDocs) ListCountLines(ctx context.Context, documentID int64) ([]*document.CountLine, error) {
	out := make([]*document.CountLine, 0, len(m.countLines[documentID]))
	for _, ln := range m.countLines[documentID] {
		cp := *ln
		out = append(out, &cp)
	}
	return out, nil
}
func (m *cDocs) UpdateCountLineCounted(ctx context.Context, id int64, qtyCounted float64, reasonCode *string, countedBy int64) error {
	for _, lines := range m.countLines {
		for _, ln := range lines {
			if ln.ID == id {
				ln.QtyCounted = &qtyCounted
				v := qtyCounted - ln.QtySystem
				ln.Variance = &v
				return nil
			}
		}
	}
	return pgx.ErrNoRows
}
func (m *cDocs) UpdateManagerApproval(ctx context.Context, id, managerID int64) error { return nil }

type cWh struct{}

func (cWh) GetWarehouseByID(ctx context.Context, id int64) (*countinguc.WarehouseInfo, error) {
	return &countinguc.WarehouseInfo{ID: id, Code: fmt.Sprintf("WH%02d", id), IsActive: true}, nil
}

type cItems struct{}

func (cItems) GetItemByID(ctx context.Context, id int64) (*countinguc.ItemInfo, error) {
	return &countinguc.ItemInfo{ID: id, SKU: fmt.Sprintf("SKU-%d", id), BaseUom: "PCS", IsActive: true}, nil
}

type cBalances struct{}

func (cBalances) ListSnapshotBalances(ctx context.Context, warehouseID int64, zone string, itemID int64) ([]*countinguc.BalanceSnapshot, error) {
	return []*countinguc.BalanceSnapshot{{ItemID: 1, LocationID: 101, QtyOnhand: 100}}, nil
}

type cValues struct{}

func (cValues) LastUnitCost(ctx context.Context, itemID int64) (float64, error) { return 0, pgx.ErrNoRows }

func newCountingHandler() (*CountingHandler, *tStock) {
	docs := newCDocs()
	stockRepo := newTStock()
	posting := stockuc.NewPostingUsecase(stockRepo, noTx{})
	uc := countinguc.NewCountingUsecase(docs, cWh{}, cItems{}, cBalances{}, cValues{}, posting, noTx{},
		docnum.NewGenerator(docs),
		countinguc.WithClock(func() time.Time { return time.Date(2026, 8, 14, 10, 0, 0, 0, time.UTC) }),
		countinguc.WithValueThreshold(1_000_000),
	)
	return NewCountingHandler(uc), stockRepo
}

func serveCounting(t *testing.T, h *CountingHandler, method, path string, body any, userID int64) *httptest.ResponseRecorder {
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
	if strings.Contains(path, "/counts/") {
		c.SetParamNames("id")
		c.SetParamValues(strings.Split(path, "/")[4])
	}
	var err error
	switch {
	case method == http.MethodPost && path == "/api/v1/counts":
		err = h.CreateCount(c)
	case method == http.MethodPost && strings.HasSuffix(path, "/lines"):
		err = h.InputCountLines(c)
	case method == http.MethodPost && strings.HasSuffix(path, "/post"):
		err = h.PostCount(c)
	case method == http.MethodPost && path == "/api/v1/adjustments":
		err = h.CreateAdjustment(c)
	default:
		t.Fatalf("unhandled route %s %s", method, path)
	}
	require.NoError(t, err)
	return rec
}

func TestCountingHandler_CreateCount_Success(t *testing.T) {
	h, _ := newCountingHandler()
	rec := serveCounting(t, h, http.MethodPost, "/api/v1/counts", dto.CreateCountRequest{
		WarehouseID: 10,
		Notes:       "opname zona A",
	}, 7)
	assert.Equal(t, http.StatusCreated, rec.Code)

	// Blind Count: qty_system must NOT leak into the response
	var envelope struct {
		Success bool `json:"success"`
		Data    struct {
			DocNo  string `json:"doc_no"`
			Status string `json:"status"`
			Lines  []struct {
				QtySystem *float64 `json:"qty_system"`
			} `json:"lines"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &envelope))
	assert.Equal(t, "CNT/WH10/2608/00001", envelope.Data.DocNo)
	assert.Equal(t, "draft", envelope.Data.Status)
	require.Len(t, envelope.Data.Lines, 1)
	assert.Nil(t, envelope.Data.Lines[0].QtySystem, "blind count: qty_system must be hidden")
}

func TestCountingHandler_Validation(t *testing.T) {
	h, _ := newCountingHandler()

	t.Run("count without warehouse → 422", func(t *testing.T) {
		rec := serveCounting(t, h, http.MethodPost, "/api/v1/counts", dto.CreateCountRequest{}, 7)
		assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
		assert.Contains(t, rec.Body.String(), "ERR_VALIDATION")
	})
	t.Run("negative counted qty → 422", func(t *testing.T) {
		rec := serveCounting(t, h, http.MethodPost, "/api/v1/counts/1/lines", dto.InputCountLinesRequest{
			Lines: []dto.InputCountLineRequest{{CountLineID: 1, QtyCounted: -5}},
		}, 7)
		assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	})
	t.Run("zero counted qty is valid (not 'is required')", func(t *testing.T) {
		// qty_counted=0 adalah hasil hitung fisik yang sah (barang habis).
		// Payload harus LOLOS validasi DTO: kegagalan yang terjadi bukan
		// ERR_VALIDATION qty_counted, melainkan 404 karena sesi mock kosong.
		rec := serveCounting(t, h, http.MethodPost, "/api/v1/counts/1/lines", dto.InputCountLinesRequest{
			Lines: []dto.InputCountLineRequest{{CountLineID: 1, QtyCounted: 0}},
		}, 7)
		assert.Equal(t, http.StatusNotFound, rec.Code)
		assert.NotContains(t, rec.Body.String(), "qty_counted")
	})
	t.Run("adjustment without reason_code → 422", func(t *testing.T) {
		rec := serveCounting(t, h, http.MethodPost, "/api/v1/adjustments", dto.CreateAdjustmentRequest{
			WarehouseID: 10,
			Notes:       "penjelasan",
			Lines:       []dto.AdjustmentLineRequest{{ItemID: 1, LocationID: 101, Qty: -5}},
		}, 7)
		assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	})
	t.Run("adjustment invalid status → 422", func(t *testing.T) {
		rec := serveCounting(t, h, http.MethodPost, "/api/v1/adjustments", dto.CreateAdjustmentRequest{
			WarehouseID: 10, ReasonCode: "RUSAK", Notes: "penjelasan",
			Lines: []dto.AdjustmentLineRequest{{ItemID: 1, LocationID: 101, Qty: -5, Status: "staging"}},
		}, 7)
		assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	})
}

func TestAdjustmentHandler_Success(t *testing.T) {
	h, stockRepo := newCountingHandler()
	stockRepo.UpsertBalance(context.Background(), &stock.StockBalance{
		ItemID: 1, LocationID: 101, Status: stock.StatusAvailable, QtyOnhand: 50,
	})
	rec := serveCounting(t, h, http.MethodPost, "/api/v1/adjustments", dto.CreateAdjustmentRequest{
		WarehouseID: 10,
		ReasonCode:  "RUSAK",
		Notes:       "Barang rusak ditemukan saat inspeksi",
		Lines:       []dto.AdjustmentLineRequest{{ItemID: 1, LocationID: 101, Qty: -5}},
	}, 7)
	assert.Equal(t, http.StatusCreated, rec.Code)

	var envelope struct {
		Success bool `json:"success"`
		Data    struct {
			DocNo      string  `json:"doc_no"`
			Status     string  `json:"status"`
			ReasonCode *string `json:"reason_code"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &envelope))
	assert.Equal(t, "ADJ/WH10/2608/00001", envelope.Data.DocNo)
	assert.Equal(t, "completed", envelope.Data.Status)
	require.NotNil(t, envelope.Data.ReasonCode)
	assert.Equal(t, "RUSAK", *envelope.Data.ReasonCode)
}
