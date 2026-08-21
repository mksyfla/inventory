package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"math"
	"runtime/debug"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/argon2"
	"golang.org/x/sync/semaphore"
)

// Argon2 derivation concurrency cap (H-11). Each derivation with m=64MB
// transiently allocates ~64MB; without a cap a distributed login burst can OOM
// the process long before the per-IP rate limiter matters.
var (
	pwSemMu sync.Mutex
	pwSem   *semaphore.Weighted
)

// pwAcquireTimeout is how long a request waits for an Argon2 slot before the
// handler is told the password service is saturated (mapped to 503).
const pwAcquireTimeout = 3 * time.Second

// ErrPasswordHashBusy is returned when the Argon2 concurrency cap is saturated.
// Handlers map it to HTTP 503 Service Unavailable.
var ErrPasswordHashBusy = errors.New("argon2id: password derivation capacity reached, try again")

// detectPasswordHashConcurrency derives the concurrency cap from the process
// memory budget: at most one-eighth of available memory may be spent on
// transient Argon2 allocations at once (each ~64MB), clamped to [1, 16].
func detectPasswordHashConcurrency() int {
	const perOpMB = 64
	limit := debug.SetMemoryLimit(-1) // query current GOMEMLIMIT, don't change it
	if limit <= 0 || limit == math.MaxInt64 {
		limit = 1 << 30 // no GOMEMLIMIT set → assume 1GiB
	}
	n := int((limit / 8) / (perOpMB << 20))
	if n < 1 {
		n = 1
	}
	if n > 16 {
		n = 16
	}
	return n
}

// setPWSem lazily initializes the password-hash semaphore to the auto-derived
// size and returns it.
func setPWSem() *semaphore.Weighted {
	pwSemMu.Lock()
	defer pwSemMu.Unlock()
	if pwSem == nil {
		pwSem = semaphore.NewWeighted(int64(detectPasswordHashConcurrency()))
	}
	return pwSem
}

// acquirePW reserves one Argon2 derivation slot, waiting at most
// pwAcquireTimeout. It returns ErrPasswordHashBusy when saturated.
func acquirePW() error {
	ctx, cancel := context.WithTimeout(context.Background(), pwAcquireTimeout)
	defer cancel()
	if err := setPWSem().Acquire(ctx, 1); err != nil {
		return ErrPasswordHashBusy
	}
	return nil
}

func releasePW() {
	setPWSem().Release(1)
}

// SetPasswordHashConcurrency overrides the Argon2 concurrency cap (H-11). Call
// once at startup from the composition root; n <= 0 restores the auto-derived
// default. In-flight operations keep running on the previous semaphore.
func SetPasswordHashConcurrency(n int) {
	pwSemMu.Lock()
	defer pwSemMu.Unlock()
	if n <= 0 {
		n = detectPasswordHashConcurrency()
	}
	pwSem = semaphore.NewWeighted(int64(n))
}

// argon2Params holds parameters matching the FSD specification:
// memory=64MB, iterations=3, parallelism=2.
type argon2Params struct {
	memory      uint32
	iterations  uint32
	parallelism uint8
	saltLen     uint32
	keyLen      uint32
}

var defaultParams = argon2Params{
	memory:      64 * 1024, // 64MB in KB
	iterations:  3,
	parallelism: 2,
	saltLen:     16,
	keyLen:      32,
}

// HashPassword hashes a plaintext password using Argon2id and returns the encoded string.
// Format: $argon2id$v=19$m=65536,t=3,p=2$<salt>$<hash>
func HashPassword(password string) (string, error) {
	if err := acquirePW(); err != nil {
		return "", err
	}
	defer releasePW()

	salt := make([]byte, defaultParams.saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("failed to generate salt: %w", err)
	}

	hash := argon2.IDKey(
		[]byte(password),
		salt,
		defaultParams.iterations,
		defaultParams.memory,
		defaultParams.parallelism,
		defaultParams.keyLen,
	)

	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	encoded := fmt.Sprintf(
		"$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version,
		defaultParams.memory,
		defaultParams.iterations,
		defaultParams.parallelism,
		b64Salt,
		b64Hash,
	)
	return encoded, nil
}

// VerifyPassword verifies a plaintext password against an encoded Argon2id hash.
// Returns true if the password matches, false otherwise.
func VerifyPassword(password, encodedHash string) (bool, error) {
	if err := acquirePW(); err != nil {
		return false, err
	}
	defer releasePW()

	params, salt, hash, err := decodeHash(encodedHash)
	if err != nil {
		return false, err
	}

	otherHash := argon2.IDKey(
		[]byte(password),
		salt,
		params.iterations,
		params.memory,
		params.parallelism,
		params.keyLen,
	)

	// Constant-time comparison to prevent timing attacks
	if subtle.ConstantTimeCompare(hash, otherHash) == 1 {
		return true, nil
	}
	return false, nil
}

// ErrInvalidHashFormat is returned when an encoded hash cannot be parsed.
var ErrInvalidHashFormat = errors.New("argon2id: invalid encoded hash format")

func decodeHash(encodedHash string) (*argon2Params, []byte, []byte, error) {
	parts := strings.Split(encodedHash, "$")
	// Expected format: ["", "argon2id", "v=19", "m=65536,t=3,p=2", "<salt>", "<hash>"]
	if len(parts) != 6 {
		return nil, nil, nil, ErrInvalidHashFormat
	}
	if parts[1] != "argon2id" {
		return nil, nil, nil, ErrInvalidHashFormat
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil {
		return nil, nil, nil, ErrInvalidHashFormat
	}
	if version != argon2.Version {
		return nil, nil, nil, fmt.Errorf("argon2id: incompatible version %d", version)
	}

	var p argon2Params
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &p.memory, &p.iterations, &p.parallelism); err != nil {
		return nil, nil, nil, ErrInvalidHashFormat
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return nil, nil, nil, fmt.Errorf("argon2id: invalid salt: %w", err)
	}
	p.saltLen = uint32(len(salt))

	hash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return nil, nil, nil, fmt.Errorf("argon2id: invalid hash: %w", err)
	}
	p.keyLen = uint32(len(hash))

	return &p, salt, hash, nil
}
