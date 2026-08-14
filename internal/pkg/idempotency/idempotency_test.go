package idempotency

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestIsValidKey(t *testing.T) {
	// Valid UUID v4
	validV4 := uuid.New().String()
	assert.True(t, IsValidKey(validV4))

	// Invalid UUID (random text)
	assert.False(t, IsValidKey("not-a-uuid"))

	// Empty key
	assert.False(t, IsValidKey(""))

	// Valid UUID but v1 (not v4)
	validV1, err := uuid.NewUUID()
	assert.NoError(t, err)
	assert.False(t, IsValidKey(validV1.String()))
}
