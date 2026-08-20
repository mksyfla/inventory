package inbound

import (
	"context"

	"inventory/internal/domain/document"
)

// AddAttachmentInput is the metadata payload of a GRN lampiran upload. File
// bytes are not stored — the receipt stores the reference (FileURL), category,
// size and uploader (Fase 6 lampiran GRN).
type AddAttachmentInput struct {
	Category      document.AttachmentCategory
	FileName      string
	FileSizeBytes int64
	FileURL       string
}

// ListAttachments returns the lampiran metadata of a GRN document, newest
// first. Missing documents surface as pgx.ErrNoRows → 404.
func (u *ReceiptUsecase) ListAttachments(ctx context.Context, documentID int64) ([]*document.Attachment, error) {
	if _, _, err := u.docs.GetByID(ctx, documentID); err != nil {
		return nil, err
	}
	return u.docs.ListAttachments(ctx, documentID)
}

// AddAttachment persists one lampiran metadata row for a GRN document and
// returns the row with ID/CreatedAt filled in.
func (u *ReceiptUsecase) AddAttachment(ctx context.Context, documentID int64, in AddAttachmentInput, uploadedBy int64) (*document.Attachment, error) {
	if _, _, err := u.docs.GetByID(ctx, documentID); err != nil {
		return nil, err
	}
	a := &document.Attachment{
		DocumentID:    documentID,
		Category:      in.Category,
		FileName:      in.FileName,
		FileSizeBytes: in.FileSizeBytes,
		FileURL:       in.FileURL,
		UploadedBy:    uploadedBy,
	}
	if err := u.docs.CreateAttachment(ctx, a); err != nil {
		return nil, err
	}
	return a, nil
}

// DeleteAttachment removes one lampiran metadata row (no-op when missing).
func (u *ReceiptUsecase) DeleteAttachment(ctx context.Context, attachmentID int64) error {
	return u.docs.DeleteAttachment(ctx, attachmentID)
}
