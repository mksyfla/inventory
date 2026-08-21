package config

import (
	"os"
	"strings"
	"testing"
)

// The repo-root .env normally satisfies Load(); these tests run from an empty
// temp dir (no .env anywhere above) and clear inherited secrets so the
// C-06 guard rails are what actually decide the outcome.
func cleanSecrets(t *testing.T) {
	t.Helper()
	t.Chdir(t.TempDir())
	for _, k := range []string{"DB_CONN_STRING", "JWT_SECRET", "AES_ENCRYPTION_KEY", "APP_ENV"} {
		old, had := os.LookupEnv(k)
		_ = os.Unsetenv(k)
		t.Cleanup(func() {
			if had {
				_ = os.Setenv(k, old)
			} else {
				_ = os.Unsetenv(k)
			}
		})
	}
}

func TestLoadFailsWhenSecretsMissing(t *testing.T) {
	cleanSecrets(t)
	if _, err := Load(); err == nil {
		t.Fatal("expected Load to fail when DB_CONN_STRING/JWT_SECRET/AES_ENCRYPTION_KEY are missing")
	}
}

func TestLoadRejectsKnownJWTDefault(t *testing.T) {
	cleanSecrets(t)
	t.Setenv("DB_CONN_STRING", "postgres://u:p@localhost:5432/db")
	t.Setenv("JWT_SECRET", "super-secret-key")
	t.Setenv("AES_ENCRYPTION_KEY", "this-is-a-very-secret-32byte-key")
	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "JWT_SECRET") {
		t.Fatalf("expected JWT known-default rejection, got: %v", err)
	}
}

func TestLoadRejectsShortJWT(t *testing.T) {
	cleanSecrets(t)
	t.Setenv("DB_CONN_STRING", "postgres://u:p@localhost:5432/db")
	t.Setenv("JWT_SECRET", "too-short")
	t.Setenv("AES_ENCRYPTION_KEY", "this-is-a-very-secret-32byte-key")
	if _, err := Load(); err == nil {
		t.Fatal("expected short JWT secret to fail entropy check")
	}
}

func TestLoadRejectsKnownAESDefaultInProduction(t *testing.T) {
	cleanSecrets(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("DB_CONN_STRING", "postgres://u:p@db:5432/db")
	t.Setenv("JWT_SECRET", "strong-jwt-secret-with-more-than-thirty-two-bytes")
	t.Setenv("AES_ENCRYPTION_KEY", "this-is-a-very-secret-32byte-key")
	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "AES_ENCRYPTION_KEY") {
		t.Fatalf("expected AES known-default rejection in production, got: %v", err)
	}
}

func TestLoadAcceptsStrongSecretsAndDecodesAES(t *testing.T) {
	cleanSecrets(t)
	t.Setenv("DB_CONN_STRING", "postgres://u:p@localhost:5432/db")
	t.Setenv("JWT_SECRET", "base64-48-byte-secret-AAAAAAAAAAAAAAAAAAAAAAAAAA==")
	// base64 of a 32-byte key
	t.Setenv("AES_ENCRYPTION_KEY", "Vq6p6AuwVIKsYeheeN5HDtS1/sidwXG29lZ7CSbFYP0=")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if len(cfg.AESKey) != 32 {
		t.Fatalf("AES key should decode to 32 bytes, got %d", len(cfg.AESKey))
	}
	if cfg.JWTSecret == "" {
		t.Fatal("JWT secret must be populated")
	}
}
