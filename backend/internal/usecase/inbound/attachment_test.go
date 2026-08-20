package inbound

import (
	"context"
	"testing"

	"inventory/internal/domain/document"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// seedGRNForAttachment seeds one approved GRN document (id 1) into the mock
// doc store so attachment usecases have a valid parent document.
func seedGRNForAttachment(t *testing.T, h *harness) {
	t.Helper()
	h.docs.seed(&document.Document{
		DocNo:       "GRN-2026-001",
		DocType:     document.DocTypeGRN,
		Status:      document.StatusApproved,
		WarehouseID: 10,
		CreatedBy:   7,
	}, nil)
}

func TestListAttachments_EmptyList(t *testing.T) {
	h := newHarness(t)
	seedGRNForAttachment(t, h)

	atts, err := h.uc.ListAttachments(context.Background(), 1)
	require.NoError(t, err)
	assert.Empty(t, atts)
}

func TestAddAttachment_PersistsAndLists(t *testing.T) {
	h := newHarness(t)
	seedGRNForAttachment(t, h)

	a, err := h.uc.AddAttachment(context.Background(), 1, AddAttachmentInput{
		Category:      document.AttachDeliveryNote,
		FileName:      "Surat_Jalan_SJ-2026-9912.pdf",
		FileSizeBytes: 204800,
		FileURL:       "/uploads/grn/1/Surat_Jalan_SJ-2026-9912.pdf",
	}, 7)
	require.NoError(t, err)
	assert.Equal(t, int64(1), a.ID)
	assert.Equal(t, document.AttachDeliveryNote, a.Category)
	assert.Equal(t, int64(7), a.UploadedBy)

	atts, err := h.uc.ListAttachments(context.Background(), 1)
	require.NoError(t, err)
	require.Len(t, atts, 1)
	assert.Equal(t, "Surat_Jalan_SJ-2026-9912.pdf", atts[0].FileName)
}

func TestAddAttachment_UnknownDocument(t *testing.T) {
	h := newHarness(t)

	_, err := h.uc.AddAttachment(context.Background(), 99, AddAttachmentInput{
		Category: document.AttachOther,
		FileName: "x.pdf",
		FileURL:  "/uploads/x.pdf",
	}, 7)
	require.Error(t, err)
}

func TestDeleteAttachment_RemovesRow(t *testing.T) {
	h := newHarness(t)
	seedGRNForAttachment(t, h)

	a, err := h.uc.AddAttachment(context.Background(), 1, AddAttachmentInput{
		Category: document.AttachQCInspection,
		FileName: "BAP_QC.pdf",
		FileURL:  "/uploads/BAP_QC.pdf",
	}, 7)
	require.NoError(t, err)

	require.NoError(t, h.uc.DeleteAttachment(context.Background(), a.ID))

	atts, err := h.uc.ListAttachments(context.Background(), 1)
	require.NoError(t, err)
	assert.Empty(t, atts)
}
