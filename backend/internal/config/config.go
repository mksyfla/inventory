package config

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// knownSecrets are literal secret values that used to ship as defaults in this
// repository (C-05 / C-06). They are rejected here so a misconfigured process
// can never silently run on a constant an attacker can read from source.
var knownSecrets = map[string]bool{
	"super-secret-key":                                    true,
	"super-secret-key-must-be-very-long-32bytes":          true,
	"dev-only-jwt-secret-change-me-0123456789":            true,
	"change-me-generate-a-strong-random-value-0123456789": true, // .env.example placeholder
	"this-is-a-very-secret-32byte-key":                    true,
}

type Config struct {
	AppEnv        string
	Port          string
	DBConnString  string
	DBPoolMax     int
	DBPoolMin     int
	RedisAddr     string
	RedisUser     string
	RedisPassword string
	RedisDB       int
	RedisPoolSize int
	JWTSecret     string
	AESKey        string
}

// Load reads configuration from the process environment, filling gaps from a
// `.env` file when one is present (searched in the working directory and then
// each parent, so the backend can be run from backend/ with a repo-root .env).
//
// Secrets have no defaults. A developer hitting a clear startup error is
// better than a process silently running a known constant.
func Load() (*Config, error) {
	if err := loadDotEnv(); err != nil {
		return nil, fmt.Errorf("load .env: %w", err)
	}

	appEnv := getEnv("APP_ENV", "development")

	dbConn, err := requireEnv("DB_CONN_STRING")
	if err != nil {
		return nil, err
	}

	jwtSecret, err := requireSecret("JWT_SECRET", 32, true, appEnv)
	if err != nil {
		return nil, err
	}

	// AES-256 key. May be a raw 32-byte string or a base64-encoded 32-byte key;
	// the decoded bytes are what gets used. The legacy dev key is allowed in
	// non-production only so existing dev ciphertexts stay decryptable.
	aesKey, err := requireAESKey(appEnv)
	if err != nil {
		return nil, err
	}

	dbPoolMax, err := envInt("DB_POOL_MAX", 10)
	if err != nil {
		return nil, err
	}
	dbPoolMin, err := envInt("DB_POOL_MIN", 2)
	if err != nil {
		return nil, err
	}

	redisDB, err := envInt("REDIS_DB", 0)
	if err != nil {
		return nil, err
	}
	redisPoolSize, err := envInt("REDIS_POOL_SIZE", 0)
	if err != nil {
		return nil, err
	}

	return &Config{
		AppEnv:        appEnv,
		Port:          getEnv("PORT", "8080"),
		DBConnString:  dbConn,
		DBPoolMax:     dbPoolMax,
		DBPoolMin:     dbPoolMin,
		RedisAddr:     getEnv("REDIS_ADDR", "localhost:6379"),
		RedisUser:     getEnv("REDIS_USER", ""),
		RedisPassword: getEnv("REDIS_PASSWORD", ""),
		RedisDB:       redisDB,
		RedisPoolSize: redisPoolSize,
		JWTSecret:     jwtSecret,
		AESKey:        aesKey,
	}, nil
}

// requireEnv returns the value of key, failing if it is absent or empty.
func requireEnv(key string) (string, error) {
	v, ok := os.LookupEnv(key)
	if !ok || strings.TrimSpace(v) == "" {
		return "", fmt.Errorf("environment variable %s is required (set it or add it to .env)", key)
	}
	return v, nil
}

// requireSecret validates a secret that must be present and carry >= minBytes of
// entropy. minBytes applies to the base64-decoded value when it is valid base64,
// otherwise to the raw string length. Known constants are always rejected.
func requireSecret(key string, minBytes int, rejectKnown bool, appEnv string) (string, error) {
	raw, err := requireEnv(key)
	if err != nil {
		return "", err
	}
	if knownSecrets[raw] && (rejectKnown || appEnv == "production") {
		return "", fmt.Errorf("%s must not use a known default value", key)
	}
	if secretBytes(raw) < minBytes {
		return "", fmt.Errorf("%s must carry at least %d bytes of entropy", key, minBytes)
	}
	return raw, nil
}

// requireAESKey resolves the AES-256 key, decoding base64 if the value is valid
// base64 and using the raw bytes otherwise. It must decode to exactly 32 bytes.
func requireAESKey(appEnv string) (string, error) {
	raw, err := requireEnv("AES_ENCRYPTION_KEY")
	if err != nil {
		return "", err
	}
	if knownSecrets[raw] && appEnv == "production" {
		return "", fmt.Errorf("AES_ENCRYPTION_KEY must not use a known default value in production")
	}
	key := raw
	if dec, derr := base64.StdEncoding.DecodeString(raw); derr == nil {
		key = string(dec)
	} else if dec, derr := base64.RawStdEncoding.DecodeString(raw); derr == nil {
		key = string(dec)
	}
	if len(key) != 32 {
		return "", fmt.Errorf("AES_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256), got %d", len(key))
	}
	return key, nil
}

// secretBytes reports the entropy-bearing byte count of raw: the length of the
// base64-decoded value when raw is valid base64, otherwise len(raw).
func secretBytes(raw string) int {
	if dec, err := base64.StdEncoding.DecodeString(raw); err == nil {
		return len(dec)
	}
	if dec, err := base64.RawStdEncoding.DecodeString(raw); err == nil {
		return len(dec)
	}
	return len(raw)
}

func envInt(key string, def int) (int, error) {
	raw := getEnv(key, strconv.Itoa(def))
	v, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return 0, fmt.Errorf("invalid %s: %w", key, err)
	}
	return v, nil
}

func getEnv(key, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return defaultVal
}

// loadDotEnv reads KEY=VALUE pairs from the nearest .env file (cwd, then each
// parent directory) into the process environment. Variables already set in the
// OS environment win over the file. Missing file is not an error.
func loadDotEnv() error {
	path, err := findEnvFile()
	if err != nil {
		return err
	}
	if path == "" {
		return nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, val, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		val = strings.TrimSpace(val)
		val = strings.Trim(val, `"'`)
		if _, exists := os.LookupEnv(key); !exists {
			_ = os.Setenv(key, val)
		}
	}
	return nil
}

func findEnvFile() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		candidate := filepath.Join(dir, ".env")
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate, nil
		} else if err != nil && !errors.Is(err, os.ErrNotExist) {
			return "", err
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", nil
		}
		dir = parent
	}
}
