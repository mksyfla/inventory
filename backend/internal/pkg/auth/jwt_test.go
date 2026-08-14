package auth

import (
	"fmt"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testJWTSecret = "test-jwt-secret-for-unit-tests-only"

func TestGenerateTokenPair(t *testing.T) {
	pair, err := GenerateTokenPair(42, "john.doe", []string{"warehouse_staff"}, []string{"JKT01", "SUB02"}, testJWTSecret)
	require.NoError(t, err)
	assert.NotEmpty(t, pair.AccessToken)
	assert.NotEmpty(t, pair.RefreshToken)
	assert.NotEmpty(t, pair.RefreshJTI)
	assert.NotEqual(t, pair.AccessToken, pair.RefreshToken)
}

func TestParseAccessToken_Valid(t *testing.T) {
	pair, err := GenerateTokenPair(99, "alice", []string{"manager"}, []string{"WH01"}, testJWTSecret)
	require.NoError(t, err)

	claims, err := ParseAccessToken(pair.AccessToken, testJWTSecret)
	require.NoError(t, err)
	assert.Equal(t, int64(99), claims.UserID)
	assert.Equal(t, "alice", claims.Username)
	assert.Equal(t, []string{"manager"}, claims.Roles)
	assert.Equal(t, []string{"WH01"}, claims.Warehouses)
	assert.Equal(t, fmt.Sprintf("%d", 99), claims.Subject)
}

func TestParseAccessToken_WrongSecret(t *testing.T) {
	pair, err := GenerateTokenPair(1, "bob", []string{"staff"}, []string{"WH01"}, testJWTSecret)
	require.NoError(t, err)

	_, err = ParseAccessToken(pair.AccessToken, "wrong-secret")
	assert.Error(t, err, "parsing with wrong secret must fail")
}

func TestParseAccessToken_Expired(t *testing.T) {
	// Manually create an already-expired token
	claims := TokenClaims{
		UserID:   1,
		Username: "expired-user",
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "1",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)),
		},
	}
	tokenStr, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testJWTSecret))
	require.NoError(t, err)

	_, err = ParseAccessToken(tokenStr, testJWTSecret)
	assert.Error(t, err, "expired access token must fail validation")
}

func TestAccessToken_TTL(t *testing.T) {
	pair, err := GenerateTokenPair(1, "user", nil, nil, testJWTSecret)
	require.NoError(t, err)

	claims, err := ParseAccessToken(pair.AccessToken, testJWTSecret)
	require.NoError(t, err)

	ttl := claims.ExpiresAt.Time.Sub(claims.IssuedAt.Time)
	assert.InDelta(t, AccessTokenTTL.Seconds(), ttl.Seconds(), 2, "access token TTL must be ~15 minutes")
}

func TestRefreshToken_TTL(t *testing.T) {
	pair, err := GenerateTokenPair(1, "user", nil, nil, testJWTSecret)
	require.NoError(t, err)

	claims, err := ParseRefreshToken(pair.RefreshToken, testJWTSecret)
	require.NoError(t, err)

	ttl := claims.ExpiresAt.Time.Sub(claims.IssuedAt.Time)
	assert.InDelta(t, RefreshTokenTTL.Seconds(), ttl.Seconds(), 2, "refresh token TTL must be ~7 days")
}

func TestParseRefreshToken_Valid(t *testing.T) {
	pair, err := GenerateTokenPair(55, "charlie", []string{"admin"}, []string{"WH01"}, testJWTSecret)
	require.NoError(t, err)

	claims, err := ParseRefreshToken(pair.RefreshToken, testJWTSecret)
	require.NoError(t, err)
	assert.Equal(t, "55", claims.Subject)
	assert.Equal(t, pair.RefreshJTI, claims.ID)
}

func TestGenerateTokenPair_JTIUnique(t *testing.T) {
	p1, _ := GenerateTokenPair(1, "u", nil, nil, testJWTSecret)
	p2, _ := GenerateTokenPair(1, "u", nil, nil, testJWTSecret)
	assert.NotEqual(t, p1.RefreshJTI, p2.RefreshJTI, "each token pair must have unique JTI")
}
