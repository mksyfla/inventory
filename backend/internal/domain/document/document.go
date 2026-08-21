package document

import (
	"context"
	"time"
)

// DocType identifies the document family (doc.doc_type enum). The inbound
// module (Fase 6) uses GRN; the other values exist so the same table, state
// machine and number generator serve every future module (FSD 4.3).
type DocType string

const (
	DocTypeGRN      DocType = "GRN"
	DocTypeDO       DocType = "DO"
	DocTypeRequest  DocType = "REQ"
	DocTypeTransfer DocType = "TRF"
	DocTypeCount    DocType = "CNT" // matches doc.doc_type enum ('CNT')
	DocTypeAdjust   DocType = "ADJ"
)

func (d DocType) String() string { return string(d) }

// Document is a business document header (doc.documents).
type Document struct {
	ID             int64
	PublicID       string
	DocNo          string
	DocType        DocType
	DocDate        time.Time
	Status         Status
	WarehouseID    int64
	DestWarehouseID *int64 // destination warehouse for TRF transfers (Fase 8.1)
	RefDocID       *int64 // reference document (e.g. DO → approved REQ)
	PartnerID      *int64
	ReasonCode     *string // required for override allocations / adjustments
	IdempotencyKey *string
	Notes          *string
	CreatedBy      int64
	ApprovedBy     *int64
	ManagerApprovedBy *int64 // second-level approval for high-value counts (M6.4)
}

// DocumentLine is one item row of a document (doc.document_lines). Qty is
// stored in the line's UoM; the posting layer converts with ConvFactor
// (FSD 4.1: qty_base = qty_request * conv_factor).
type DocumentLine struct {
	ID           int64
	DocumentID   int64
	LineNo       int
	ItemID       int64
	Uom          string
	ConvFactor   float64
	QtyRequest   float64
	QtyProcessed float64
	BatchID      *int64
	LocationID   *int64
	// Status is the receiving QC outcome (inv.stock_status):
	// "available" | "quarantine" | "damaged".
	Status string
	Notes  *string
}

// Remaining returns how much of the line has not been put away yet.
func (l *DocumentLine) Remaining() float64 {
	r := l.QtyRequest - l.QtyProcessed
	if r < 0 {
		return 0
	}
	return r
}

// DocumentRepository persists documents and their lines. Methods that mutate
// must run inside the transaction the caller opened (PostgresTxRunner) so the
// docnum sequence bump, line inserts, stock posting and status change all
// commit atomically (FSD 4.1 "all-or-nothing", FSD 4.3).
type DocumentRepository interface {
	Create(ctx context.Context, doc *Document, lines []*DocumentLine) error
	// GetByID returns the header and all lines. Missing document surfaces as
	// pgx.ErrNoRows.
	GetByID(ctx context.Context, id int64) (*Document, []*DocumentLine, error)
	// GetByIDempotencyKey returns the header only (idempotent replay, FSD 4.5).
	GetByIDempotencyKey(ctx context.Context, key string) (*Document, error)
	// UpdateStatus moves the header to status; approvedBy must be set only
	// when status == StatusApproved (writes approved_by/approved_at).
	UpdateStatus(ctx context.Context, id int64, status Status, approvedBy *int64) error
	// TransitionStatus is the compare-and-set status write (H-04): the UPDATE
	// is guarded by `AND status = expected`, so a concurrent transition that
	// already committed wins and this one returns ok=false. Transitions that
	// post stock must treat ok=false as a conflict and roll back, so the loser
	// of the race never double-posts.
	TransitionStatus(ctx context.Context, id int64, expected, next Status, approvedBy *int64) (bool, error)
	// UpdateLinePutaway records the newly put-away quantity and the target
	// location on a line.
	UpdateLinePutaway(ctx context.Context, lineID int64, qtyProcessed float64, locationID int64) error
	// UpdateLineProcessed records a newly processed (picked/issued) quantity
	// on a line without touching the location column.
	UpdateLineProcessed(ctx context.Context, lineID int64, qtyProcessed float64) error
	// CreateAllocations inserts one doc.allocations row per allocation (Fase 7.2).
	CreateAllocations(ctx context.Context, allocations []*Allocation) error
	// ListAllocations returns every allocation of a document enriched with
	// balance/location/batch/item info (picking list source).
	ListAllocations(ctx context.Context, documentID int64) ([]*Allocation, error)
	// UpdateAllocationPicked bumps qty_picked on an allocation (Fase 7.5).
	UpdateAllocationPicked(ctx context.Context, id int64, qtyPicked float64) error
	// UpdateReasonCode persists the override/adjustment reason (Fase 7.3).
	UpdateReasonCode(ctx context.Context, id int64, reasonCode string) error
	// GetDelivery returns the doc.deliveries row or pgx.ErrNoRows when absent.
	GetDelivery(ctx context.Context, documentID int64) (*Delivery, error)
	// UpsertDelivery creates or merges the doc.deliveries row (Fase 7.6/7.7).
	UpsertDelivery(ctx context.Context, d *Delivery) error

	// ListAttachments returns the lampiran metadata rows of a document,
	// newest first (Fase 6 lampiran GRN).
	ListAttachments(ctx context.Context, documentID int64) ([]*Attachment, error)
	// CreateAttachment inserts one attachment metadata row.
	CreateAttachment(ctx context.Context, a *Attachment) error
	// GetAttachmentByID returns a single attachment or pgx.ErrNoRows.
	GetAttachmentByID(ctx context.Context, id int64) (*Attachment, error)
	// DeleteAttachment removes an attachment row by id (no-op when missing).
	DeleteAttachment(ctx context.Context, id int64) error
}
