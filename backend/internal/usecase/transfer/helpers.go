package transfer

import (
	"encoding/json"

	"inventory/internal/domain/document"
	"inventory/internal/pkg/apperr"
)

// ShortageDetail is the per-line shortage shape carried by
// ERR_STOCK_INSUFFICIENT (FSD §4.2, reused by FR-5.1 send). Its JSON tags
// line up with the delivery layer's ErrorDetail.
type ShortageDetail struct {
	Field     string  `json:"field"`
	SKU       string  `json:"sku,omitempty"`
	Requested float64 `json:"requested"`
	Available float64 `json:"available"`
}

// resolved is one validated receive line (used for posting and receipts).
type resolved struct {
	line        *document.DocumentLine
	qtyBase     float64
	qtyReceived float64
	loc         *LocationInfo
	batchID     *int64
	notes       string
}

func validationErr(field, msg string) error {
	return &apperr.AppError{
		Code:    "ERR_VALIDATION",
		Message: "Invalid request payload",
		Details: []apperr.ErrorDetail{{Field: field, Message: msg}},
	}
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func jsonMarshal(v any) ([]byte, error) {
	return json.Marshal(v)
}

// discrepancyEntry is one line of the discrepancy audit payload.
type discrepancyEntry struct {
	LineID      int64   `json:"line_id"`
	QtySent     float64 `json:"qty_sent"`
	QtyReceived float64 `json:"qty_received"`
	Variance    float64 `json:"variance"`
	Severity    string  `json:"severity"`
}

// receiptSummary builds the durable audit payload for a receive with
// shortages (FR-5.1): only lines whose received qty differs from sent.
func receiptSummary(lines []resolved) []discrepancyEntry {
	out := make([]discrepancyEntry, 0, len(lines))
	for _, rl := range lines {
		if rl.qtyReceived == rl.qtyBase {
			continue
		}
		out = append(out, discrepancyEntry{
			LineID:      rl.line.ID,
			QtySent:     rl.qtyBase,
			QtyReceived: rl.qtyReceived,
			Variance:    rl.qtyReceived - rl.qtyBase,
			Severity:    "critical",
		})
	}
	return out
}
