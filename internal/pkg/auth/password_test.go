package auth

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHashPassword(t *testing.T) {
	hash, err := HashPassword("securePassword123!")
	require.NoError(t, err)
	assert.NotEmpty(t, hash)

	// Verify format: $argon2id$v=19$m=...,t=3,p=2$<salt>$<hash>
	assert.True(t, strings.HasPrefix(hash, "$argon2id$"))
	parts := strings.Split(hash, "$")
	assert.Equal(t, 6, len(parts))
	assert.Equal(t, "argon2id", parts[1])
}

func TestHashPassword_UniquePerCall(t *testing.T) {
	// Each call must generate a unique hash due to random salt
	hash1, err1 := HashPassword("samePassword")
	hash2, err2 := HashPassword("samePassword")
	require.NoError(t, err1)
	require.NoError(t, err2)
	assert.NotEqual(t, hash1, hash2, "two hashes of the same password must differ due to random salt")
}

func TestVerifyPassword_Correct(t *testing.T) {
	password := "MySuper$ecret!42"
	hash, err := HashPassword(password)
	require.NoError(t, err)

	match, err := VerifyPassword(password, hash)
	require.NoError(t, err)
	assert.True(t, match, "correct password must verify successfully")
}

func TestVerifyPassword_Wrong(t *testing.T) {
	hash, err := HashPassword("CorrectPassword")
	require.NoError(t, err)

	match, err := VerifyPassword("WrongPassword", hash)
	require.NoError(t, err)
	assert.False(t, match, "wrong password must not verify")
}

func TestVerifyPassword_InvalidHash(t *testing.T) {
	_, err := VerifyPassword("anyPassword", "not-a-valid-hash")
	assert.Error(t, err)
	assert.ErrorIs(t, err, ErrInvalidHashFormat)
}

func TestVerifyPassword_Argon2Params(t *testing.T) {
	// Verify the encoded hash uses FSD-specified parameters (memory=64MB, iterations=3, parallelism=2)
	hash, err := HashPassword("testpass")
	require.NoError(t, err)

	// Parse and verify params
	params, _, _, err := decodeHash(hash)
	require.NoError(t, err)
	assert.Equal(t, uint32(64*1024), params.memory, "memory should be 64MB (65536 KB)")
	assert.Equal(t, uint32(3), params.iterations, "iterations should be 3")
	assert.Equal(t, uint8(2), params.parallelism, "parallelism should be 2")
}
