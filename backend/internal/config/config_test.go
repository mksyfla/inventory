package config

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestLoad_Defaults(t *testing.T) {
	// Clean environment variables first to test defaults
	os.Unsetenv("APP_ENV")
	os.Unsetenv("PORT")
	os.Unsetenv("DB_CONN_STRING")
	os.Unsetenv("DB_POOL_MAX")
	os.Unsetenv("DB_POOL_MIN")
	os.Unsetenv("REDIS_ADDR")
	os.Unsetenv("JWT_SECRET")
	os.Unsetenv("AES_ENCRYPTION_KEY")

	cfg, err := Load()
	assert.NoError(t, err)
	assert.Equal(t, "development", cfg.AppEnv)
	assert.Equal(t, "8080", cfg.Port)
	assert.Equal(t, "host=localhost user=user password=password dbname=dbname sslmode=disable", cfg.DBConnString)
	assert.Equal(t, 10, cfg.DBPoolMax)
	assert.Equal(t, 2, cfg.DBPoolMin)
	assert.Equal(t, "localhost:6379", cfg.RedisAddr)
	assert.NotEmpty(t, cfg.JWTSecret)
	assert.NotEmpty(t, cfg.AESKey)
}

func TestLoad_CustomEnv(t *testing.T) {
	os.Setenv("APP_ENV", "staging")
	os.Setenv("PORT", "9090")
	os.Setenv("DB_CONN_STRING", "postgres://user:pass@localhost:5432/db")
	os.Setenv("DB_POOL_MAX", "25")
	os.Setenv("DB_POOL_MIN", "5")
	os.Setenv("REDIS_ADDR", "localhost:6380")
	os.Setenv("JWT_SECRET", "custom-jwt-secret-long-enough-32bytes")
	os.Setenv("AES_ENCRYPTION_KEY", "custom-aes-secret-key-32byteslong")

	defer func() {
		os.Unsetenv("APP_ENV")
		os.Unsetenv("PORT")
		os.Unsetenv("DB_CONN_STRING")
		os.Unsetenv("DB_POOL_MAX")
		os.Unsetenv("DB_POOL_MIN")
		os.Unsetenv("REDIS_ADDR")
		os.Unsetenv("JWT_SECRET")
		os.Unsetenv("AES_ENCRYPTION_KEY")
	}()

	cfg, err := Load()
	assert.NoError(t, err)
	assert.Equal(t, "staging", cfg.AppEnv)
	assert.Equal(t, "9090", cfg.Port)
	assert.Equal(t, "postgres://user:pass@localhost:5432/db", cfg.DBConnString)
	assert.Equal(t, 25, cfg.DBPoolMax)
	assert.Equal(t, 5, cfg.DBPoolMin)
	assert.Equal(t, "localhost:6380", cfg.RedisAddr)
	assert.Equal(t, "custom-jwt-secret-long-enough-32bytes", cfg.JWTSecret)
	assert.Equal(t, "custom-aes-secret-key-32byteslong", cfg.AESKey)
}

func TestLoad_ProductionValidation(t *testing.T) {
	os.Setenv("APP_ENV", "production")
	os.Unsetenv("DB_CONN_STRING")

	defer func() {
		os.Unsetenv("APP_ENV")
		os.Unsetenv("DB_CONN_STRING")
	}()

	_, err := Load()
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "DB_CONN_STRING environment variable is required")
}

func TestLoad_InvalidPoolMax(t *testing.T) {
	os.Setenv("DB_POOL_MAX", "not-a-number")
	defer os.Unsetenv("DB_POOL_MAX")

	_, err := Load()
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "invalid DB_POOL_MAX")
}

func TestLoad_ProductionShortSecret(t *testing.T) {
	os.Setenv("APP_ENV", "production")
	os.Setenv("DB_CONN_STRING", "host=db")
	os.Setenv("JWT_SECRET", "too-short")

	defer func() {
		os.Unsetenv("APP_ENV")
		os.Unsetenv("DB_CONN_STRING")
		os.Unsetenv("JWT_SECRET")
	}()

	_, err := Load()
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "JWT_SECRET must be explicitly set and at least 32 characters")
}

func TestLoad_ProductionLongSecret(t *testing.T) {
	os.Setenv("APP_ENV", "production")
	os.Setenv("DB_CONN_STRING", "host=db")
	os.Setenv("JWT_SECRET", "0123456789abcdef0123456789abcdef") // 32 chars
	os.Setenv("AES_ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef")

	defer func() {
		os.Unsetenv("APP_ENV")
		os.Unsetenv("DB_CONN_STRING")
		os.Unsetenv("JWT_SECRET")
		os.Unsetenv("AES_ENCRYPTION_KEY")
	}()

	_, err := Load()
	assert.NoError(t, err)
}
