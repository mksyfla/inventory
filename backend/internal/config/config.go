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
	RedisAddr    string
	JWTSecret    string
}

func Load() (*Config, error) {
	appEnv := getEnv("APP_ENV", "development")
	port := getEnv("PORT", "8080")
	dbConn := getEnv("DB_CONN_STRING", "host=localhost user=user password=password dbname=dbname sslmode=disable")
	redisAddr := getEnv("REDIS_ADDR", "localhost:6379")
	jwtSecret := getEnv("JWT_SECRET", "super-secret-key")

	dbPoolMaxStr := getEnv("DB_POOL_MAX", "10")
	dbPoolMax, err := strconv.Atoi(dbPoolMaxStr)
	if err != nil {
		return nil, fmt.Errorf("invalid DB_POOL_MAX: %w", err)
	}

	if appEnv == "production" && dbConn == "" {
		return nil, fmt.Errorf("DB_CONN_STRING is required in production env")
	}

	if appEnv == "production" && len(jwtSecret) < 32 {
		return nil, fmt.Errorf("JWT_SECRET must be at least 32 characters in production env")
	}

	return &Config{
		AppEnv:       appEnv,
		Port:         port,
		DBConnString: dbConn,
		DBPoolMax:    dbPoolMax,
		RedisAddr:    redisAddr,
		JWTSecret:    jwtSecret,
	}, nil
}

func getEnv(key, defaultVal string) string {
	if val, exists := os.LookupEnv(key); exists {
		return val
	}
	return defaultVal
}
