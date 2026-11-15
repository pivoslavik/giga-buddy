package tests

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/pivoslavik/giga-buddy/backend/internal/tokens/access"
	"github.com/pivoslavik/giga-buddy/backend/internal/tokens/refresh"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models/user"
	serverutils "github.com/pivoslavik/giga-buddy/backend/internal/utils/server"
)

var secret = []byte("backend-test-secret")

func signedToken(t *testing.T, method jwt.SigningMethod, subject string, expiry *jwt.NumericDate) string {
	t.Helper()
	token, err := jwt.NewWithClaims(method, jwt.RegisteredClaims{Subject: subject, ExpiresAt: expiry}).SignedString(secret)
	must(t, err)
	return token
}

func TestAccessTokenRoundTrip(t *testing.T) {
	before := time.Now().Truncate(time.Second)
	token, err := access.CreateAccessToken(42, secret)
	must(t, err)
	id, err := access.ParseAccessToken(token, secret)
	must(t, err)
	equal(t, id, user.UserID(42))
	claims := &jwt.RegisteredClaims{}
	_, err = jwt.ParseWithClaims(token, claims, func(*jwt.Token) (any, error) { return secret, nil })
	must(t, err)
	equal(t, claims.Subject, "42")
	if claims.IssuedAt.Before(before) || claims.IssuedAt.After(time.Now()) {
		t.Fatalf("unexpected issue time: %v", claims.IssuedAt)
	}
	equal(t, claims.ExpiresAt.Sub(claims.IssuedAt.Time), 15*time.Minute)
}

func TestAccessTokenRejectsInvalidTokens(t *testing.T) {
	future := jwt.NewNumericDate(time.Now().Add(time.Hour))
	cases := []struct {
		name, token string
		key         []byte
	}{
		{"malformed", "not-a-jwt", secret},
		{"wrong secret", signedToken(t, jwt.SigningMethodHS256, "42", future), []byte("wrong")},
		{"wrong algorithm", signedToken(t, jwt.SigningMethodHS384, "42", future), secret},
		{"expired", signedToken(t, jwt.SigningMethodHS256, "42", jwt.NewNumericDate(time.Now().Add(-time.Hour))), secret},
		{"missing expiration", signedToken(t, jwt.SigningMethodHS256, "42", nil), secret},
		{"missing subject", signedToken(t, jwt.SigningMethodHS256, "", future), secret},
		{"non-numeric subject", signedToken(t, jwt.SigningMethodHS256, "alice", future), secret},
		{"overflowing subject", signedToken(t, jwt.SigningMethodHS256, "999999999999999999999", future), secret},
		{"zero ID", signedToken(t, jwt.SigningMethodHS256, "0", future), secret},
		{"negative ID", signedToken(t, jwt.SigningMethodHS256, "-1", future), secret},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			id, err := access.ParseAccessToken(tc.token, tc.key)
			wantError(t, err, "ParseAccessToken")
			equal(t, id, user.UserID(0))
		})
	}
}

func TestRefreshTokens(t *testing.T) {
	seen := make(map[string]bool)
	for range 32 {
		token, err := refresh.CreateRefreshToken()
		must(t, err)
		data, err := base64.RawURLEncoding.DecodeString(token)
		must(t, err)
		equal(t, len(data), 32)
		if seen[token] {
			t.Fatal("generated duplicate refresh token")
		}
		seen[token] = true
		sum := sha256.Sum256([]byte(token))
		equal(t, refresh.HashRefreshToken(token), hex.EncodeToString(sum[:]))
	}
	equal(t, refresh.HashRefreshToken(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
}

func TestUserRoles(t *testing.T) {
	for _, role := range []string{"admin", "intern"} {
		must(t, user.CheckUserRole(role))
	}
	for _, role := range []string{"", "Admin", "user", " admin"} {
		wantError(t, user.CheckUserRole(role), "invalid user role")
	}
}

func TestUserIDFromContext(t *testing.T) {
	for _, tc := range []struct {
		name      string
		value     any
		errorText string
	}{
		{"missing", nil, "missing"}, {"wrong type", int64(42), "unexpected userID type"},
		{"valid", user.UserID(42), ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
			if tc.value != nil {
				ctx.Set("userID", tc.value)
			}
			id, err := serverutils.GetUserIDFromContext(ctx)
			if tc.errorText != "" {
				wantError(t, err, tc.errorText)
				equal(t, id, user.UserID(0))
			} else {
				must(t, err)
				equal(t, id, user.UserID(42))
			}
		})
	}
}
