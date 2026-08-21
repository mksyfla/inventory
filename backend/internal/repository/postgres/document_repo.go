package postgres

import (
	"context"
	"fmt"
	"time"

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
		DestWarehouseID: int8Param(doc.DestWarehouseID),
		RefDocID:       int8Param(doc.RefDocID),
		PartnerID:      int8Param(doc.PartnerID),
		ReasonCode:     textParam(doc.ReasonCode),
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

// TransitionStatus is the compare-and-set status write (H-04): the UPDATE is
// guarded by `AND status = expected`, so a concurrent transition that already
// committed wins and this one returns ok=false. Callers that post stock must
// treat ok=false as a conflict and roll back the whole transaction — the loser
// of the race never double-posts.
func (r *PostgresDocumentRepository) TransitionStatus(ctx context.Context, id int64, expected, next document.Status, approvedBy *int64) (bool, error) {
	n, err := r.querier(ctx).TransitionDocumentStatus(ctx, TransitionDocumentStatusParams{
		ID:         id,
		Column2:    expected.String(),
		Column3:    next.String(),
		ApprovedBy: int8Param(approvedBy),
	})
	if err != nil {
		return false, fmt.Errorf("postgres: failed to transition document status: %w", err)
	}
	return n > 0, nil
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

func (r *PostgresDocumentRepository) UpdateLineProcessed(ctx context.Context, lineID int64, qtyProcessed float64) error {
	err := r.querier(ctx).UpdateDocumentLineProcessed(ctx, UpdateDocumentLineProcessedParams{
		ID:           lineID,
		QtyProcessed: numericParam(qtyProcessed),
	})
	if err != nil {
		return fmt.Errorf("postgres: failed to update line processed qty: %w", err)
	}
	return nil
}

// CreateAllocations persists one doc.allocations row per allocation. All runs
// inside the caller's transaction so the reservation and the allocation rows
// commit atomically with the doc (Fase 7.2).
func (r *PostgresDocumentRepository) CreateAllocations(ctx context.Context, allocations []*document.Allocation) error {
	q := r.querier(ctx)
	for _, a := range allocations {
		row, err := q.CreateAllocation(ctx, CreateAllocationParams{
			DocLineID:    a.DocLineID,
			BalanceID:    a.BalanceID,
			QtyAllocated: numericParam(a.QtyAllocated),
		})
		if err != nil {
			return fmt.Errorf("postgres: failed to create allocation: %w", err)
		}
		a.ID = row.ID
	}
	return nil
}

func (r *PostgresDocumentRepository) ListAllocations(ctx context.Context, documentID int64) ([]*document.Allocation, error) {
	rows, err := r.querier(ctx).ListAllocationsByDocument(ctx, documentID)
	if err != nil {
		return nil, err
	}
	out := make([]*document.Allocation, 0, len(rows))
	for _, row := range rows {
		out = append(out, allocationFromRow(row))
	}
	return out, nil
}

func (r *PostgresDocumentRepository) UpdateAllocationPicked(ctx context.Context, id int64, qtyPicked float64) error {
	err := r.querier(ctx).UpdateAllocationPicked(ctx, UpdateAllocationPickedParams{
		ID:        id,
		QtyPicked: numericParam(qtyPicked),
	})
	if err != nil {
		return fmt.Errorf("postgres: failed to update allocation picked: %w", err)
	}
	return nil
}

func (r *PostgresDocumentRepository) UpdateReasonCode(ctx context.Context, id int64, reasonCode string) error {
	err := r.querier(ctx).UpdateDocumentReasonCode(ctx, UpdateDocumentReasonCodeParams{
		ID:         id,
		ReasonCode: pgtype.Text{String: reasonCode, Valid: true},
	})
	if err != nil {
		return fmt.Errorf("postgres: failed to update document reason: %w", err)
	}
	return nil
}

func (r *PostgresDocumentRepository) GetDelivery(ctx context.Context, documentID int64) (*document.Delivery, error) {
	row, err := r.querier(ctx).GetDeliveryByDocument(ctx, documentID)
	if err != nil {
		return nil, err
	}
	return deliveryFromRow(row), nil
}

func (r *PostgresDocumentRepository) UpsertDelivery(ctx context.Context, d *document.Delivery) error {
	err := r.querier(ctx).UpsertDelivery(ctx, UpsertDeliveryParams{
		DocumentID:   d.DocumentID,
		VehicleNo:    textParam(d.VehicleNo),
		DriverName:   textParam(d.DriverName),
		ShippedAt:    timestamptzParam(d.ShippedAt),
		ReceivedBy:   textParam(d.ReceivedBy),
		ReceivedAt:   timestamptzParam(d.ReceivedAt),
		PodFileUrl:   textParam(d.PodFileURL),
		SignatureUrl: textParam(d.SignatureURL),
	})
	if err != nil {
		return fmt.Errorf("postgres: failed to upsert delivery: %w", err)
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

// ─── Fase 8: Transfer receipts & count lines ─────────────────────────────────

// CreateTransferReceipt persists one line receipt of a transfer receive
// (doc.transfer_receipts, Fase 8.1). Runs in the caller's transaction so the
// in-transit → available posting and the receipt record commit atomically.
func (r *PostgresDocumentRepository) CreateTransferReceipt(ctx context.Context, rec *document.TransferReceipt) error {
	row, err := r.querier(ctx).CreateTransferReceipt(ctx, CreateTransferReceiptParams{
		DocumentID:  rec.DocumentID,
		LineID:      rec.LineID,
		QtySent:     numericParam(rec.QtySent),
		QtyReceived: numericParam(rec.QtyReceived),
		ReceivedBy:  rec.ReceivedBy,
		Notes:       textParam(rec.Notes),
	})
	if err != nil {
		return fmt.Errorf("postgres: failed to create transfer receipt: %w", err)
	}
	rec.ID = row.ID
	if f, err := row.Variance.Float64Value(); err == nil {
		rec.Variance = f.Float64
	}
	if row.ReceivedAt.Valid {
		rec.ReceivedAt = row.ReceivedAt.Time
	}
	return nil
}

func (r *PostgresDocumentRepository) ListTransferReceipts(ctx context.Context, documentID int64) ([]*document.TransferReceipt, error) {
	rows, err := r.querier(ctx).ListTransferReceipts(ctx, documentID)
	if err != nil {
		return nil, err
	}
	out := make([]*document.TransferReceipt, 0, len(rows))
	for _, row := range rows {
		out = append(out, transferReceiptFromRow(row))
	}
	return out, nil
}

// CreateCountLines persists the qty_system snapshot rows of an opname session
// (doc.count_lines, Fase 8.2). Runs in the caller's transaction.
func (r *PostgresDocumentRepository) CreateCountLines(ctx context.Context, lines []*document.CountLine) error {
	q := r.querier(ctx)
	for _, ln := range lines {
		row, err := q.CreateCountLine(ctx, CreateCountLineParams{
			DocumentID: ln.DocumentID,
			ItemID:     ln.ItemID,
			LocationID: ln.LocationID,
			BatchID:    int8Param(ln.BatchID),
			QtySystem:  numericParam(ln.QtySystem),
		})
		if err != nil {
			return fmt.Errorf("postgres: failed to create count line: %w", err)
		}
		ln.ID = row.ID
	}
	return nil
}

func (r *PostgresDocumentRepository) ListCountLines(ctx context.Context, documentID int64) ([]*document.CountLine, error) {
	rows, err := r.querier(ctx).ListCountLines(ctx, documentID)
	if err != nil {
		return nil, err
	}
	out := make([]*document.CountLine, 0, len(rows))
	for _, row := range rows {
		out = append(out, countLineFromRow(row))
	}
	return out, nil
}

// UpdateCountLineCounted records the field count on a snapshot line
// (Fase 8.3): qty_counted, optional reason_code, and the counter identity.
func (r *PostgresDocumentRepository) UpdateCountLineCounted(ctx context.Context, id int64, qtyCounted float64, reasonCode *string, countedBy int64) error {
	err := r.querier(ctx).UpdateCountLineCounted(ctx, UpdateCountLineCountedParams{
		ID:         id,
		QtyCounted: numericParam(qtyCounted),
		ReasonCode: textParam(reasonCode),
		CountedBy:  pgtype.Int8{Int64: countedBy, Valid: true},
	})
	if err != nil {
		return fmt.Errorf("postgres: failed to update count line %d: %w", id, err)
	}
	return nil
}

// UpdateManagerApproval records the second-level (Inventory Manager) approval
// for high-value count variances (M6.4).
func (r *PostgresDocumentRepository) UpdateManagerApproval(ctx context.Context, id, managerID int64) error {
	err := r.querier(ctx).UpdateDocumentManagerApproval(ctx, UpdateDocumentManagerApprovalParams{
		ID:                id,
		ManagerApprovedBy: pgtype.Int8{Int64: managerID, Valid: true},
	})
	if err != nil {
		return fmt.Errorf("postgres: failed to update manager approval: %w", err)
	}
	return nil
}

// transferReceiptFromRow maps a sqlc DocTransferReceipts row into the domain.
func transferReceiptFromRow(row DocTransferReceipts) *document.TransferReceipt {
	rec := &document.TransferReceipt{
		ID:          row.ID,
		DocumentID:  row.DocumentID,
		LineID:      row.LineID,
		ReceivedBy:  row.ReceivedBy,
		Notes:       textPtr(row.Notes),
	}
	if f, err := row.QtySent.Float64Value(); err == nil {
		rec.QtySent = f.Float64
	}
	if f, err := row.QtyReceived.Float64Value(); err == nil {
		rec.QtyReceived = f.Float64
	}
	if f, err := row.Variance.Float64Value(); err == nil {
		rec.Variance = f.Float64
	}
	if row.ReceivedAt.Valid {
		rec.ReceivedAt = row.ReceivedAt.Time
	}
	return rec
}

// countLineFromRow maps a sqlc DocCountLines row into the domain entity.
func countLineFromRow(row DocCountLines) *document.CountLine {
	ln := &document.CountLine{
		ID:         row.ID,
		DocumentID: row.DocumentID,
		ItemID:     row.ItemID,
		LocationID: row.LocationID,
		BatchID:    int8Ptr(row.BatchID),
		ReasonCode: textPtr(row.ReasonCode),
		CountedBy:  int8Ptr(row.CountedBy),
	}
	if f, err := row.QtySystem.Float64Value(); err == nil {
		ln.QtySystem = f.Float64
	}
	if row.QtyCounted.Valid {
		if f, err := row.QtyCounted.Float64Value(); err == nil {
			ln.QtyCounted = &f.Float64
		}
	}
	if row.Variance.Valid {
		if f, err := row.Variance.Float64Value(); err == nil {
			ln.Variance = &f.Float64
		}
	}
	if row.CountedAt.Valid {
		t := row.CountedAt.Time
		ln.CountedAt = &t
	}
	return ln
}

// documentFromRow maps a sqlc DocDocuments row into the domain entity.
func documentFromRow(row DocDocuments) *document.Document {
	return &document.Document{
		ID:               row.ID,
		PublicID:         row.PublicID.String(),
		DocNo:            row.DocNo,
		DocType:          document.DocType(fmt.Sprint(row.DocType)),
		DocDate:          row.DocDate.Time,
		Status:           document.Status(fmt.Sprint(row.Status)),
		WarehouseID:      row.WarehouseID,
		DestWarehouseID:  int8Ptr(row.DestWarehouseID),
		RefDocID:         int8Ptr(row.RefDocID),
		PartnerID:        int8Ptr(row.PartnerID),
		ReasonCode:       textPtr(row.ReasonCode),
		IdempotencyKey:   textPtr(row.IdempotencyKey),
		Notes:            textPtr(row.Notes),
		CreatedBy:        row.CreatedBy,
		ApprovedBy:       int8Ptr(row.ApprovedBy),
		ManagerApprovedBy: int8Ptr(row.ManagerApprovedBy),
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

// timestamptzParam builds a pgtype.Timestamptz parameter from a *time.Time.
func timestamptzParam(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: *t, Valid: true}
}

// timestamptzPtr converts a pgtype.Timestamptz result into a *time.Time.
func timestamptzPtr(v pgtype.Timestamptz) *time.Time {
	if !v.Valid {
		return nil
	}
	t := v.Time
	return &t
}

// allocationFromRow maps a sqlc ListAllocationsByDocumentRow into the domain
// allocation enriched for picking/verification.
func allocationFromRow(row ListAllocationsByDocumentRow) *document.Allocation {
	a := &document.Allocation{
		ID:           row.ID,
		DocLineID:    row.DocLineID,
		BalanceID:    row.BalanceID,
		ItemID:       row.ItemID,
		LocationID:   row.LocationID,
		BatchID:      int8Ptr(row.BatchID),
		LocationCode: row.LocationCode,
		BatchNo:      row.BatchNo.String,
		SKU:          row.Sku,
		BaseUom:      row.BaseUom,
	}
	if f, err := row.QtyAllocated.Float64Value(); err == nil {
		a.QtyAllocated = f.Float64
	}
	if f, err := row.QtyPicked.Float64Value(); err == nil {
		a.QtyPicked = f.Float64
	}
	if row.PickSeq.Valid {
		v := int(row.PickSeq.Int32)
		a.PickSeq = &v
	}
	if row.ExpiryDate.Valid {
		t := row.ExpiryDate.Time
		a.ExpiryDate = &t
	}
	return a
}

// deliveryFromRow maps a sqlc DocDeliveries row into the domain entity.
func deliveryFromRow(row DocDeliveries) *document.Delivery {
	return &document.Delivery{
		DocumentID:   row.DocumentID,
		VehicleNo:    textPtr(row.VehicleNo),
		DriverName:   textPtr(row.DriverName),
		ShippedAt:    timestamptzPtr(row.ShippedAt),
		ReceivedBy:   textPtr(row.ReceivedBy),
		ReceivedAt:   timestamptzPtr(row.ReceivedAt),
		PodFileURL:   textPtr(row.PodFileUrl),
		SignatureURL: textPtr(row.SignatureUrl),
	}
}
