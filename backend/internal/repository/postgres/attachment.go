package postgres

import (
	"context"

	"inventory/internal/domain/document"
)

// Attachment repository methods live on PostgresDocumentRepository so a single
// wired repo satisfies the whole DocumentRepository contract (header, lines,
// deliveries and lampiran metadata). Mutations follow the same transaction-in-
// ctx pattern as the document methods (FSD 4.1 all-or-nothing).

func toAttachment(row DocAttachments) *document.Attachment {
	return &document.Attachment{
		ID:            row.ID,
		DocumentID:    row.DocumentID,
		Category:      document.AttachmentCategory(row.Category),
		FileName:      row.FileName,
		FileSizeBytes: row.FileSizeBytes,
		FileURL:       row.FileUrl,
		UploadedBy:    row.UploadedBy,
		CreatedAt:     row.CreatedAt.Time,
	}
}

// ListAttachments returns the lampiran metadata rows of a document, newest first.
func (r *PostgresDocumentRepository) ListAttachments(ctx context.Context, documentID int64) ([]*document.Attachment, error) {
	rows, err := r.querier(ctx).ListAttachmentsByDocument(ctx, documentID)
	if err != nil {
		return nil, err
	}
	out := make([]*document.Attachment, 0, len(rows))
	for i := range rows {
		out = append(out, toAttachment(rows[i]))
	}
	return out, nil
}

// CreateAttachment inserts one attachment metadata row and fills in ID/CreatedAt.
func (r *PostgresDocumentRepository) CreateAttachment(ctx context.Context, a *document.Attachment) error {
	row, err := r.querier(ctx).CreateAttachment(ctx, CreateAttachmentParams{
		DocumentID:    a.DocumentID,
		Category:      string(a.Category),
		FileName:      a.FileName,
		FileSizeBytes: a.FileSizeBytes,
		FileUrl:       a.FileURL,
		UploadedBy:    a.UploadedBy,
	})
	if err != nil {
		return err
	}
	*a = *toAttachment(row)
	return nil
}

// GetAttachmentByID returns a single attachment or pgx.ErrNoRows when missing.
func (r *PostgresDocumentRepository) GetAttachmentByID(ctx context.Context, id int64) (*document.Attachment, error) {
	row, err := r.querier(ctx).GetAttachmentByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return toAttachment(row), nil
}

// DeleteAttachment removes an attachment row by id (no-op when missing).
func (r *PostgresDocumentRepository) DeleteAttachment(ctx context.Context, id int64) error {
	return r.querier(ctx).DeleteAttachmentByID(ctx, id)
}
