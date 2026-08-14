package crypto

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEncryptDecrypt(t *testing.T) {
	key := []byte("this-is-a-very-secret-32byte-key") // 32 bytes
	plaintext := "Alice Cooper, +62-812-3456-7890"

	ciphertext, err := Encrypt(plaintext, key)
	require.NoError(t, err)
	assert.NotEmpty(t, ciphertext)
	assert.NotEqual(t, plaintext, ciphertext)

	decrypted, err := Decrypt(ciphertext, key)
	require.NoError(t, err)
	assert.Equal(t, plaintext, decrypted)
}

func TestDecrypt_InvalidKey(t *testing.T) {
	key1 := []byte("this-is-a-very-secret-32byte-key")
	key2 := []byte("another-very-secret-32byte-key-2")
	plaintext := "Secret Data"

	ciphertext, err := Encrypt(plaintext, key1)
	require.NoError(t, err)

	_, err = Decrypt(ciphertext, key2)
	assert.Error(t, err, "decryption with wrong key must fail")
}

func TestDecrypt_Garbage(t *testing.T) {
	key := []byte("this-is-a-very-secret-32byte-key")
	_, err := Decrypt("invalid-base-64-garbage!", key)
	assert.Error(t, err)
}
