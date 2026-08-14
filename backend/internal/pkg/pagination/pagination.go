package pagination

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"
)

// Cursor represents the keyset pagination token containing the reference keys.
type Cursor struct {
	MovedAt time.Time `json:"moved_at"`
	ID      int64     `json:"id"`
}

// EncodeCursor converts a time.Time and ID into a base64-encoded JSON cursor string.
func EncodeCursor(movedAt time.Time, id int64) string {
	c := Cursor{
		MovedAt: movedAt.UTC(),
		ID:      id,
	}
	data, err := json.Marshal(c)
	if err != nil {
		return ""
	}
	return base64.StdEncoding.EncodeToString(data)
}

// DecodeCursor decodes a base64 cursor string back into a Cursor struct.
func DecodeCursor(cursorStr string) (*Cursor, error) {
	if cursorStr == "" {
		return nil, nil
	}
	data, err := base64.StdEncoding.DecodeString(cursorStr)
	if err != nil {
		return nil, fmt.Errorf("invalid cursor encoding: %w", err)
	}
	var c Cursor
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, fmt.Errorf("invalid cursor format: %w", err)
	}
	return &c, nil
}
