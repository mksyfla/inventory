package auth

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// TokenClaims represents the JWT claims for access tokens.
type TokenClaims struct {
	UserID     int64    `json:"user_id"`
	Username   string   `json:"username"`
	Roles      []string `json:"roles"`
	Warehouses []string `json:"warehouses"` // list of warehouse codes user is authorized for
	jwt.RegisteredClaims
}

// TokenPair holds an access token and a refresh token.
type TokenPair struct {
	AccessToken  string
	RefreshToken string
	// RefreshJTI is the JTI embedded in the refresh token, used to revoke it in Redis.
	RefreshJTI string
}

const (
	AccessTokenTTL  = 15 * time.Minute
	RefreshTokenTTL = 7 * 24 * time.Hour
)

// Cookie names used for browser clients (HttpOnly, SameSite=Lax).
// The Authorization: Bearer header remains the primary mechanism per FSD §5.1.
const (
	AccessTokenCookieName  = "access_token"
	RefreshTokenCookieName = "refresh_token"
)

// GenerateTokenPair creates an access token (15 min) and a refresh token (7 days) signed with the provided secret.
func GenerateTokenPair(userID int64, username string, roles, warehouses []string, secret string) (*TokenPair, error) {
	jtiAccess := uuid.New().String()
	jtiRefresh := uuid.New().String()

	now := time.Now().UTC()

	// Build access token claims
	accessClaims := TokenClaims{
		UserID:     userID,
		Username:   username,
		Roles:      roles,
		Warehouses: warehouses,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:  fmt.Sprintf("%d", userID),
			ID:       jtiAccess,
			IssuedAt: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(AccessTokenTTL)),
		},
	}

	accessToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims).SignedString([]byte(secret))
	if err != nil {
		return nil, fmt.Errorf("jwt: failed to sign access token: %w", err)
	}

	// Build refresh token claims (minimal, just sub + jti + expiry)
	refreshClaims := jwt.RegisteredClaims{
		Subject:  fmt.Sprintf("%d", userID),
		ID:       jtiRefresh,
		IssuedAt: jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(RefreshTokenTTL)),
	}

	refreshToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims).SignedString([]byte(secret))
	if err != nil {
		return nil, fmt.Errorf("jwt: failed to sign refresh token: %w", err)
	}

	return &TokenPair{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		RefreshJTI:   jtiRefresh,
	}, nil
}

// ParseAccessToken parses and validates an access token, returning its claims.
func ParseAccessToken(tokenStr, secret string) (*TokenClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &TokenClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("jwt: unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, fmt.Errorf("jwt: invalid token: %w", err)
	}

	claims, ok := token.Claims.(*TokenClaims)
	if !ok || !token.Valid {
		return nil, errors.New("jwt: invalid token claims")
	}
	return claims, nil
}

// ParseRefreshToken parses and validates a refresh token, returning its registered claims.
func ParseRefreshToken(tokenStr, secret string) (*jwt.RegisteredClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &jwt.RegisteredClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("jwt: unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, fmt.Errorf("jwt: invalid refresh token: %w", err)
	}

	claims, ok := token.Claims.(*jwt.RegisteredClaims)
	if !ok || !token.Valid {
		return nil, errors.New("jwt: invalid refresh token claims")
	}
	return claims, nil
}
