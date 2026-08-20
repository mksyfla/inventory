package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	AppEnv       string
	Port         string
	DBConnString string
	DBPoolMax    int
	DBPoolMin    int
	RedisAddr    string
	JWTSecret    string
	AESKey       string
}

func Load() (*Config, error) {
	appEnv := getEnv("APP_ENV", "development")
	port := getEnv("PORT", "8080")
	dbConn := getEnv("DB_CONN_STRING", "host=localhost user=user password=password dbname=dbname sslmode=disable")
	redisAddr := getEnv("REDIS_ADDR", "localhost:6379")
	jwtSecret := getEnv("JWT_SECRET", "super-secret-key-must-be-very-long-32bytes")
	aesKey := getEnv("AES_ENCRYPTION_KEY", "this-is-a-very-secret-32byte-key")

	dbPoolMaxStr := getEnv("DB_POOL_MAX", "10")
	dbPoolMax, err := strconv.Atoi(dbPoolMaxStr)
	if err != nil {
		return nil, fmt.Errorf("invalid DB_POOL_MAX: %w", err)
	}

	dbPoolMinStr := getEnv("DB_POOL_MIN", "2")
	dbPoolMin, err := strconv.Atoi(dbPoolMinStr)
	if err != nil {
		return nil, fmt.Errorf("invalid DB_POOL_MIN: %w", err)
	}

	if appEnv == "production" {
		if rawConn, exists := os.LookupEnv("DB_CONN_STRING"); !exists || rawConn == "" {
			return nil, fmt.Errorf("DB_CONN_STRING environment variable is required in production env")
		}
		if rawSecret, exists := os.LookupEnv("JWT_SECRET"); !exists || len(rawSecret) < 32 || rawSecret == "super-secret-key" || rawSecret == "super-secret-key-must-be-very-long-32bytes" {
			return nil, fmt.Errorf("JWT_SECRET must be explicitly set and at least 32 characters in production env")
		}
		if rawAES, exists := os.LookupEnv("AES_ENCRYPTION_KEY"); !exists || len(rawAES) < 32 || rawAES == "this-is-a-very-secret-32byte-key" {
			return nil, fmt.Errorf("AES_ENCRYPTION_KEY must be explicitly set and at least 32 bytes in production env")
		}
	}

	return &Config{
		AppEnv:       appEnv,
		Port:         port,
		DBConnString: dbConn,
		DBPoolMax:    dbPoolMax,
		DBPoolMin:    dbPoolMin,
		RedisAddr:    redisAddr,
		JWTSecret:    jwtSecret,
		AESKey:       aesKey,
	}, nil
}

func getEnv(key, defaultVal string) string {
	if val, exists := os.LookupEnv(key); exists {
		return val
	}
	return defaultVal
}
