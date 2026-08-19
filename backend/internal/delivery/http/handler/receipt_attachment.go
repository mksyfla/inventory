package handler

import (
	"net/http"
	"time"

	"inventory/internal/delivery/http/dto"
	"inventory/internal/delivery/http/response"
	"inventory/internal/domain/document"
	"inventory/internal/usecase/inbound"

	"github.com/labstack/echo/v4"
)

// ListAttachments handles GET /api/v1/receipts/:id/attachments — returns the
// lampiran metadata rows of a GRN document, newest first.
func (h *ReceiptHandler) ListAttachments(c echo.Context) error {
	docID, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}

	atts, err := h.uc.ListAttachments(c.Request().Context(), docID)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to list receipt attachments")
	}

	out := make([]dto.AttachmentResponse, 0, len(atts))
	for _, a := range atts {
		out = append(out, toAttachmentResponse(a))
	}
	return response.Success(c, http.StatusOK, out, nil)
}

// AddAttachment handles POST /api/v1/receipts/:id/attachments — persists one
// lampiran metadata row against the GRN document.
func (h *ReceiptHandler) AddAttachment(c echo.Context) error {
	docID, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}

	var req dto.AddAttachmentRequest
	if !bindAndValidate(c, &req) {
		return nil
	}

	in := inbound.AddAttachmentInput{
		Category:      document.AttachmentCategory(req.Category),
		FileName:      req.FileName,
		FileSizeBytes: req.FileSizeBytes,
		FileURL:       req.FileURL,
	}
	a, err := h.uc.AddAttachment(c.Request().Context(), docID, in, userIDFromCtx(c))
	if err != nil {
		return writeUsecaseError(c, err, "Failed to add receipt attachment")
	}
	return response.Success(c, http.StatusCreated, toAttachmentResponse(a), nil)
}

// DeleteAttachment handles DELETE /api/v1/receipts/:id/attachments/:attachment_id.
func (h *ReceiptHandler) DeleteAttachment(c echo.Context) error {
	if _, ok := pathIDParam(c, "id"); !ok {
		return nil
	}
	attID, ok := pathIDParam(c, "attachment_id")
	if !ok {
		return nil
	}

	if err := h.uc.DeleteAttachment(c.Request().Context(), attID); err != nil {
		return writeUsecaseError(c, err, "Failed to delete receipt attachment")
	}
	return response.Success(c, http.StatusOK, map[string]bool{"deleted": true}, nil)
}

func toAttachmentResponse(a *document.Attachment) dto.AttachmentResponse {
	return dto.AttachmentResponse{
		ID:            a.ID,
		DocumentID:    a.DocumentID,
		Category:      string(a.Category),
		FileName:      a.FileName,
		FileSizeBytes: a.FileSizeBytes,
		FileURL:       a.FileURL,
		UploadedBy:    a.UploadedBy,
		CreatedAt:     a.CreatedAt.Format(time.RFC3339),
	}
}
