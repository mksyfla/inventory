package postgres

import (
	"context"
	"fmt"
)

// PostgresDocumentNumberRepository allocates document sequences against
// doc.document_numbers. It reuses the caller's transaction when present
// (same-transaction guarantee required by BR-04 / FSD 4.3).
type PostgresDocumentNumberRepository struct {
	queries *Queries
}

func NewPostgresDocumentNumberRepository(db DBTX) *PostgresDocumentNumberRepository {
	return &PostgresDocumentNumberRepository{queries: New(db)}
}

// NextSequence atomically bumps the last sequence for (docType, period):
// first use inserts 1, every subsequent use increments (RETURNING last_seq).
func (r *PostgresDocumentNumberRepository) NextSequence(ctx context.Context, docType, period string) (int64, error) {
	q := r.queries
	if tx := GetTx(ctx); tx != nil {
		q = q.WithTx(tx)
	}

	seq, err := q.UpsertDocumentNumber(ctx, UpsertDocumentNumberParams{
		DocType: docType,
		Period:  period,
	})
	if err != nil {
		return 0, fmt.Errorf("postgres: failed to bump document sequence: %w", err)
	}
	return int64(seq), nil
}
