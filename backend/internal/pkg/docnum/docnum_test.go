package docnum

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestFormat(t *testing.T) {
	// 2026-08-12
	targetTime := time.Date(2026, time.August, 12, 10, 0, 0, 0, time.UTC)
	formatted := Format("GRN", "JKT01", targetTime, 42)
	assert.Equal(t, "GRN/JKT01/2608/00042", formatted)

	// test sequence padding
	formattedSeq2 := Format("DO", "SUB02", targetTime, 123456)
	assert.Equal(t, "DO/SUB02/2608/123456", formattedSeq2)
}
