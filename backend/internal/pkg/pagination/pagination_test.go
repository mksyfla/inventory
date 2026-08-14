package pagination

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestEncodeDecodeCursor(t *testing.T) {
	now := time.Now().Round(time.Second) // round to avoid sub-second difference issues during JSON serialization/deserialization
	id := int64(98765)

	encoded := EncodeCursor(now, id)
	assert.NotEmpty(t, encoded)

	decoded, err := DecodeCursor(encoded)
	assert.NoError(t, err)
	assert.NotNil(t, decoded)
	assert.Equal(t, now.UTC(), decoded.MovedAt)
	assert.Equal(t, id, decoded.ID)
}

func TestDecodeCursor_Empty(t *testing.T) {
	decoded, err := DecodeCursor("")
	assert.NoError(t, err)
	assert.Nil(t, decoded)
}

func TestDecodeCursor_InvalidBase64(t *testing.T) {
	_, err := DecodeCursor("invalid-base64-string!!!")
	assert.Error(t, err)
}

func TestDecodeCursor_InvalidJSON(t *testing.T) {
	// "ey..." is valid base64 but contains invalid JSON content
	_, err := DecodeCursor("eyJhIjogMX0=") // {"a": 1} is valid JSON but lacks moved_at / id format or parsing structure
	// Wait, JSON unmarshaling into Cursor might succeed with zero values, but let's test absolute garbage JSON.
	_, err = DecodeCursor("aW52YWxpZCBqc29u") // base64 of "invalid json"
	assert.Error(t, err)
}
