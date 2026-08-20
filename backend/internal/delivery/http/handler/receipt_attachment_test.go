package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"inventory/internal/delivery/http/dto"
	"inventory/internal/delivery/http/response"
	"inventory/internal/domain/document"
	"inventory/internal/pkg/validation"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// decodeData re-encodes the envelope's `data` (generic any after JSON decode)
// into a typed target, mirroring how existing handler tests read responses.
func decodeData[T any](t *testing.T, resp response.Response) T {
	t.Helper()
	var out T
	b, err := json.Marshal(resp.Data)
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(b, &out))
	return out
}

// serveReceiptAttachment runs an attachment request against the handler with
// both :id and :attachment_id path params resolved from the URL.
func serveReceiptAttachment(t *testing.T, h *ReceiptHandler, method, path string, body any, userID int64) *httptest.ResponseRecorder {
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

	rest := strings.TrimPrefix(path, "/api/v1/receipts")
	rest = strings.TrimPrefix(rest, "/")
	segments := strings.Split(rest, "/")
	if len(segments) > 0 && segments[0] != "" {
		c.SetParamNames("id")
		c.SetParamValues(segments[0])
	}
	// attachments/:attachment_id
	if len(segments) >= 3 {
		c.SetParamNames("id", "attachment_id")
		c.SetParamValues(segments[0], segments[2])
	}

	var err error
	switch {
	case method == http.MethodGet && strings.HasSuffix(path, "/attachments"):
		err = h.ListAttachments(c)
	case method == http.MethodPost && strings.HasSuffix(path, "/attachments"):
		err = h.AddAttachment(c)
	case method == http.MethodDelete:
		err = h.DeleteAttachment(c)
	default:
		t.Fatalf("unhandled route %s %s", method, path)
	}
	require.NoError(t, err)
	return rec
}

// seedAttachmentDoc creates one approved GRN (id 1) in the mock doc store.
func seedAttachmentDoc(t *testing.T, docs *hDocRepo) {
	t.Helper()
	err := docs.Create(context.Background(), &document.Document{
		DocNo:       "GRN-2026-001",
		DocType:     document.DocTypeGRN,
		Status:      document.StatusApproved,
		WarehouseID: 10,
		CreatedBy:   7,
	}, nil)
	require.NoError(t, err)
}

func TestListAttachments_Handler_Empty(t *testing.T) {
	h, docs := newReceiptHarness(t)
	seedAttachmentDoc(t, docs)

	rec := serveReceiptAttachment(t, h, http.MethodGet, "/api/v1/receipts/1/attachments", nil, 7)
	require.Equal(t, http.StatusOK, rec.Code)

	resp := decodeEnvelope(t, rec)
	assert.True(t, resp.Success)
	atts := decodeData[[]dto.AttachmentResponse](t, resp)
	assert.Empty(t, atts)
}

func TestAddAttachment_Handler_Created(t *testing.T) {
	h, docs := newReceiptHarness(t)
	seedAttachmentDoc(t, docs)

	rec := serveReceiptAttachment(t, h, http.MethodPost, "/api/v1/receipts/1/attachments", dto.AddAttachmentRequest{
		Category:      "delivery_note",
		FileName:      "Surat_Jalan_SJ-2026-9912.pdf",
		FileSizeBytes: 204800,
		FileURL:       "/uploads/grn/1/Surat_Jalan_SJ-2026-9912.pdf",
	}, 7)
	require.Equal(t, http.StatusCreated, rec.Code)

	resp := decodeEnvelope(t, rec)
	assert.True(t, resp.Success)
	a := decodeData[dto.AttachmentResponse](t, resp)
	assert.Equal(t, int64(1), a.ID)
	assert.Equal(t, "Surat_Jalan_SJ-2026-9912.pdf", a.FileName)
	assert.Equal(t, int64(7), a.UploadedBy)

	// The persisted row is now listed.
	rec2 := serveReceiptAttachment(t, h, http.MethodGet, "/api/v1/receipts/1/attachments", nil, 7)
	atts := decodeData[[]dto.AttachmentResponse](t, decodeEnvelope(t, rec2))
	require.Len(t, atts, 1)
	assert.Equal(t, "Surat_Jalan_SJ-2026-9912.pdf", atts[0].FileName)
}

func TestAddAttachment_Handler_UnknownDocument_404(t *testing.T) {
	h, _ := newReceiptHarness(t)

	rec := serveReceiptAttachment(t, h, http.MethodPost, "/api/v1/receipts/999/attachments", dto.AddAttachmentRequest{
		Category: "other",
		FileName: "x.pdf",
		FileURL:  "/uploads/x.pdf",
	}, 7)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestDeleteAttachment_Handler_Removes(t *testing.T) {
	h, docs := newReceiptHarness(t)
	seedAttachmentDoc(t, docs)

	// create first
	rec := serveReceiptAttachment(t, h, http.MethodPost, "/api/v1/receipts/1/attachments", dto.AddAttachmentRequest{
		Category: "qc_inspection",
		FileName: "BAP_QC.pdf",
		FileURL:  "/uploads/BAP_QC.pdf",
	}, 7)
	require.Equal(t, http.StatusCreated, rec.Code)

	recDel := serveReceiptAttachment(t, h, http.MethodDelete, "/api/v1/receipts/1/attachments/1", nil, 7)
	require.Equal(t, http.StatusOK, recDel.Code)

	recList := serveReceiptAttachment(t, h, http.MethodGet, "/api/v1/receipts/1/attachments", nil, 7)
	atts := decodeData[[]dto.AttachmentResponse](t, decodeEnvelope(t, recList))
	assert.Empty(t, atts)
}
