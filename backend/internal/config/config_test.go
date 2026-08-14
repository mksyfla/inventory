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
	os.Unsetenv("REDIS_ADDR")
	os.Unsetenv("JWT_SECRET")

	cfg, err := Load()
	assert.NoError(t, err)
	assert.Equal(t, "development", cfg.AppEnv)
	assert.Equal(t, "8080", cfg.Port)
	assert.Equal(t, "host=localhost user=user password=password dbname=dbname sslmode=disable", cfg.DBConnString)
	assert.Equal(t, 10, cfg.DBPoolMax)
	assert.Equal(t, "localhost:6379", cfg.RedisAddr)
	assert.Equal(t, "super-secret-key", cfg.JWTSecret)
}

func TestLoad_CustomEnv(t *testing.T) {
	os.Setenv("APP_ENV", "staging")
	os.Setenv("PORT", "9090")
	os.Setenv("DB_CONN_STRING", "postgres://user:pass@localhost:5432/db")
	os.Setenv("DB_POOL_MAX", "25")
	os.Setenv("REDIS_ADDR", "localhost:6380")
	os.Setenv("JWT_SECRET", "custom-jwt-secret")

	defer func() {
		os.Unsetenv("APP_ENV")
		os.Unsetenv("PORT")
		os.Unsetenv("DB_CONN_STRING")
		os.Unsetenv("DB_POOL_MAX")
		os.Unsetenv("REDIS_ADDR")
		os.Unsetenv("JWT_SECRET")
	}()

	cfg, err := Load()
	assert.NoError(t, err)
	assert.Equal(t, "staging", cfg.AppEnv)
	assert.Equal(t, "9090", cfg.Port)
	assert.Equal(t, "postgres://user:pass@localhost:5432/db", cfg.DBConnString)
	assert.Equal(t, 25, cfg.DBPoolMax)
	assert.Equal(t, "localhost:6380", cfg.RedisAddr)
	assert.Equal(t, "custom-jwt-secret", cfg.JWTSecret)
}

func TestLoad_ProductionValidation(t *testing.T) {
	os.Setenv("APP_ENV", "production")
	// getEnv falls back to a non-empty default, so an empty value must be set
	// explicitly to trigger the production validation.
	os.Setenv("DB_CONN_STRING", "")

	defer func() {
		os.Unsetenv("APP_ENV")
		os.Unsetenv("DB_CONN_STRING")
	}()

	_, err := Load()
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "DB_CONN_STRING is required in production env")
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
	assert.Contains(t, err.Error(), "JWT_SECRET must be at least 32 characters")
}

func TestLoad_ProductionLongSecret(t *testing.T) {
	os.Setenv("APP_ENV", "production")
	os.Setenv("DB_CONN_STRING", "host=db")
	os.Setenv("JWT_SECRET", "0123456789abcdef0123456789abcdef") // 32 chars

	defer func() {
		os.Unsetenv("APP_ENV")
		os.Unsetenv("DB_CONN_STRING")
		os.Unsetenv("JWT_SECRET")
	}()

	_, err := Load()
	assert.NoError(t, err)
}
