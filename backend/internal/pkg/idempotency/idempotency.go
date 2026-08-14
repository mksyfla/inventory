package idempotency

import (
	"github.com/google/uuid"
)

// IsValidKey checks if the provided string is a valid UUIDv4 key.
func IsValidKey(key string) bool {
	u, err := uuid.Parse(key)
	if err != nil {
		return false
	}
	return u.Version() == 4
}
