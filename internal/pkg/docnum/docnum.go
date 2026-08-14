package docnum

import (
	"fmt"
	"time"
)

// Format generates a document number in the format: {TIPE}/{KODE_GUDANG}/{YYMM}/{SEQ:5}
// For example: GRN/JKT01/2608/00042
func Format(docType string, warehouseCode string, t time.Time, seq int64) string {
	period := t.Format("0601") // Go layout for YYMM
	return fmt.Sprintf("%s/%s/%s/%05d", docType, warehouseCode, period, seq)
}
