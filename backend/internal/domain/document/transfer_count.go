package document

import "time"

// TransferReceipt records the received quantity of one transfer line at the
// destination warehouse (doc.transfer_receipts, Fase 8.1). Variance is the
// signed difference qty_received - qty_sent: a negative variance is a
// shortage (selisih) that must be logged and escalated.
type TransferReceipt struct {
	ID           int64
	DocumentID   int64
	LineID       int64
	QtySent      float64
	QtyReceived  float64
	Variance     float64
	ReceivedBy   int64
	ReceivedAt   time.Time
	Notes        *string
}

// CountLine is one snapshot row of a stock opname session (doc.count_lines,
// Fase 8.2-8.3). QtySystem is captured when the session opens (Blind Count:
// hidden from field counters); QtyCounted is filled by the counter; Variance
// is computed by the database as qty_counted - qty_system.
type CountLine struct {
	ID         int64
	DocumentID int64
	ItemID     int64
	LocationID int64
	BatchID    *int64
	QtySystem  float64
	QtyCounted *float64
	Variance   *float64
	ReasonCode *string
	CountedBy  *int64
	CountedAt  *time.Time
}

// Counted reports whether the line has been counted by a field staff.
func (l *CountLine) Counted() bool {
	return l.QtyCounted != nil
}
