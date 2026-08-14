package postgres

import (
	"context"
	"fmt"

	"inventory/internal/domain/document"

	"github.com/jackc/pgx/v5/pgtype"
)

// PostgresDocumentRepository persists document headers and lines on the
// sqlc Queries, honoring an active transaction in ctx so the docnum sequence
// bump, batch creation, lines and stock posting commit atomically (FSD 4.1).
type PostgresDocumentRepository struct {
	queries *Queries
}

// NewPostgresDocumentRepository wires the document repository.
func NewPostgresDocumentRepository(q *Queries) *PostgresDocumentRepository {
	return &PostgresDocumentRepository{queries: q}
}

func (r *PostgresDocumentRepository) querier(ctx context.Context) *Queries {
	if tx := GetTx(ctx); tx != nil {
		return r.queries.WithTx(tx)
	}
	return r.queries
}

func (r *PostgresDocumentRepository) Create(ctx context.Context, doc *document.Document, lines []*document.DocumentLine) error {
	q := r.querier(ctx)
	row, err := q.CreateDocument(ctx, CreateDocumentParams{
		DocNo:          doc.DocNo,
		Column2:        doc.DocType.String(),
		DocDate:        pgtype.Date{Time: doc.DocDate, Valid: true},
		Column4:        doc.Status.String(),
		WarehouseID:    doc.WarehouseID,
		PartnerID:      int8Param(doc.PartnerID),
		IdempotencyKey: textParam(doc.IdempotencyKey),
		Notes:          textParam(doc.Notes),
		CreatedBy:      doc.CreatedBy,
	})
	if err != nil {
		return fmt.Errorf("postgres: failed to create document: %w", err)
	}
	doc.ID = row.ID
	doc.PublicID = row.PublicID.String()

	for _, ln := range lines {
		lrow, err := q.CreateDocumentLine(ctx, CreateDocumentLineParams{
			DocumentID:   doc.ID,
			LineNo:       int16(ln.LineNo),
			ItemID:       ln.ItemID,
			Uom:          ln.Uom,
			ConvFactor:   numericParam(ln.ConvFactor),
			QtyRequest:   numericParam(ln.QtyRequest),
			QtyProcessed: numericParam(ln.QtyProcessed),
			BatchID:      int8Param(ln.BatchID),
			LocationID:   int8Param(ln.LocationID),
			Column10:     ln.Status,
			Notes:        textParam(ln.Notes),
		})
		if err != nil {
			return fmt.Errorf("postgres: failed to create document line %d: %w", ln.LineNo, err)
		}
		ln.ID = lrow.ID
	}
	return nil
}

func (r *PostgresDocumentRepository) GetByID(ctx context.Context, id int64) (*document.Document, []*document.DocumentLine, error) {
	doc, err := r.getHeader(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	rows, err := r.querier(ctx).ListDocumentLines(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	lines := make([]*document.DocumentLine, 0, len(rows))
	for _, row := range rows {
		lines = append(lines, documentLineFromRow(row))
	}
	return doc, lines, nil
}

func (r *PostgresDocumentRepository) GetByIDempotencyKey(ctx context.Context, key string) (*document.Document, error) {
	row, err := r.querier(ctx).GetDocumentByIDempotencyKey(ctx, pgtype.Text{String: key, Valid: true})
	if err != nil {
		return nil, err
	}
	return documentFromRow(row), nil
}

func (r *PostgresDocumentRepository) UpdateStatus(ctx context.Context, id int64, status document.Status, approvedBy *int64) error {
	err := r.querier(ctx).UpdateDocumentStatus(ctx, UpdateDocumentStatusParams{
		ID:         id,
		Column2:    status.String(),
		ApprovedBy: int8Param(approvedBy),
	})
	if err != nil {
		return fmt.Errorf("postgres: failed to update document status: %w", err)
	}
	return nil
}

// NextSequence implements docnum.NextSeqStore (FSD 4.3): atomically bumps
// the (doc_type, period) counter and returns the new sequence. Runs inside
// the caller's transaction so the sequence and the document commit together.
func (r *PostgresDocumentRepository) NextSequence(ctx context.Context, docType, period string) (int64, error) {
	row, err := r.querier(ctx).UpsertDocumentNumber(ctx, UpsertDocumentNumberParams{
		DocType: docType,
		Period:  period,
	})
	if err != nil {
		return 0, fmt.Errorf("postgres: failed to bump document sequence: %w", err)
	}
	return int64(row), nil
}

func (r *PostgresDocumentRepository) UpdateLinePutaway(ctx context.Context, lineID int64, qtyProcessed float64, locationID int64) error {
	err := r.querier(ctx).UpdateDocumentLinePutaway(ctx, UpdateDocumentLinePutawayParams{
		ID:           lineID,
		QtyProcessed: numericParam(qtyProcessed),
		LocationID:   pgtype.Int8{Int64: locationID, Valid: true},
	})
	if err != nil {
		return fmt.Errorf("postgres: failed to update line putaway: %w", err)
	}
	return nil
}

func (r *PostgresDocumentRepository) getHeader(ctx context.Context, id int64) (*document.Document, error) {
	row, err := r.querier(ctx).GetDocumentByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return documentFromRow(row), nil
}

// documentFromRow maps a sqlc DocDocuments row into the domain entity.
func documentFromRow(row DocDocuments) *document.Document {
	return &document.Document{
		ID:             row.ID,
		PublicID:       row.PublicID.String(),
		DocNo:          row.DocNo,
		DocType:        document.DocType(fmt.Sprint(row.DocType)),
		DocDate:        row.DocDate.Time,
		Status:         document.Status(fmt.Sprint(row.Status)),
		WarehouseID:    row.WarehouseID,
		PartnerID:      int8Ptr(row.PartnerID),
		IdempotencyKey: textPtr(row.IdempotencyKey),
		Notes:          textPtr(row.Notes),
		CreatedBy:      row.CreatedBy,
		ApprovedBy:     int8Ptr(row.ApprovedBy),
	}
}

// documentLineFromRow maps a sqlc DocDocumentLines row into the domain entity.
func documentLineFromRow(row DocDocumentLines) *document.DocumentLine {
	line := &document.DocumentLine{
		ID:         row.ID,
		DocumentID: row.DocumentID,
		LineNo:     int(row.LineNo),
		ItemID:     row.ItemID,
		Uom:        row.Uom,
		BatchID:    int8Ptr(row.BatchID),
		LocationID: int8Ptr(row.LocationID),
		Status:     fmt.Sprint(row.Status),
		Notes:      textPtr(row.Notes),
	}
	if f, err := row.ConvFactor.Float64Value(); err == nil {
		line.ConvFactor = f.Float64
	}
	if f, err := row.QtyRequest.Float64Value(); err == nil {
		line.QtyRequest = f.Float64
	}
	if f, err := row.QtyProcessed.Float64Value(); err == nil {
		line.QtyProcessed = f.Float64
	}
	return line
}

// int8Param builds a pgtype.Int8 parameter from a *int64.
func int8Param(v *int64) pgtype.Int8 {
	if v == nil {
		return pgtype.Int8{}
	}
	return pgtype.Int8{Int64: *v, Valid: true}
}

// int8Ptr converts a pgtype.Int8 result into a *int64.
func int8Ptr(v pgtype.Int8) *int64 {
	if !v.Valid {
		return nil
	}
	out := v.Int64
	return &out
}

// textParam builds a pgtype.Text parameter from a *string (nil-safe).
func textParam(v *string) pgtype.Text {
	if v == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *v, Valid: true}
}

// textPtr converts a pgtype.Text result into a *string.
func textPtr(v pgtype.Text) *string {
	if !v.Valid {
		return nil
	}
	out := v.String
	return &out
}

// numericParam builds a pgtype.Numeric parameter from a float64.
func numericParam(v float64) pgtype.Numeric {
	var n pgtype.Numeric
	_ = n.Scan(fmt.Sprintf("%f", v))
	return n
}
