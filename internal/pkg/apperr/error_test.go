package apperr

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestAppError_JSON(t *testing.T) {
	err := &AppError{
		Code:      "INVALID_INPUT",
		Message:   "Data tidak valid",
		RequestID: "req-123",
	}

	data, _ := json.Marshal(err)
	assert.Contains(t, string(data), "INVALID_INPUT")
	assert.Contains(t, string(data), "req-123")
}
