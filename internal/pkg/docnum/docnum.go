package docnum

import (
	"context"
	"fmt"
	"time"
)

// Format generates a document number in the format: {TIPE}/{KODE_GUDANG}/{YYMM}/{SEQ:5}
// For example: GRN/JKT01/2608/00042
func Format(docType string, warehouseCode string, t time.Time, seq int64) string {
	period := t.Format("0601") // Go layout for YYMM
	return fmt.Sprintf("%s/%s/%s/%05d", docType, warehouseCode, period, seq)
}

// NextSeqStore atomically allocates the next sequence number for a
// (docType, period) pair, inside the caller's transaction (BR-04).
type NextSeqStore interface {
	NextSequence(ctx context.Context, docType, period string) (int64, error)
}

// Generator produces document numbers of the format
// {TIPE}/{KODE_GUDANG}/{YYMM}/{SEQ:5}. The sequence is allocated atomically
// against doc.document_numbers (INSERT ... ON CONFLICT DO UPDATE ... RETURNING);
// call Next inside the same transaction that creates the document (FSD 4.3).
type Generator struct {
	store NextSeqStore
}

func NewGenerator(store NextSeqStore) *Generator {
	return &Generator{store: store}
}

// Next allocates the next sequence for docType/warehouseCode and returns the
// formatted document number. The period is derived from the same clock (t)
// used to stamp the document, so the sequence row and the number never diverge.
func (g *Generator) Next(ctx context.Context, docType, warehouseCode string, t time.Time) (string, error) {
	period := t.Format("0601")
	seq, err := g.store.NextSequence(ctx, docType, period)
	if err != nil {
		return "", fmt.Errorf("docnum: failed to allocate sequence %s/%s: %w", docType, period, err)
	}
	return Format(docType, warehouseCode, t, seq), nil
}
