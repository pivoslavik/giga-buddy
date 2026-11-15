package tests

import (
	"errors"
	"net"
	"net/http"
	"syscall"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/pivoslavik/giga-buddy/backend/internal/config"
	appserver "github.com/pivoslavik/giga-buddy/backend/internal/server"
	"github.com/pivoslavik/giga-buddy/backend/internal/server/health"
	"github.com/pivoslavik/giga-buddy/backend/internal/server/middleware"
	userhandler "github.com/pivoslavik/giga-buddy/backend/internal/server/user"
	"github.com/pivoslavik/giga-buddy/backend/internal/tokens/access"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/apperrors"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models/user"
)

func TestHealth(t *testing.T) {
	router := gin.New()
	router.GET("/health", health.HandleHealth)
	rec := request(router, http.MethodGet, "/health", "")
	equal(t, rec.Code, http.StatusOK)
	equal(t, rec.Body.Len(), 0)
}

func TestAccessMiddleware(t *testing.T) {
	token, err := access.CreateAccessToken(42, secret)
	must(t, err)
	for _, tc := range []struct {
		name, token string
		allowed     bool
	}{
		{"missing cookie", "", false}, {"bad token", "invalid", false}, {"valid", token, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			reached := false
			router := gin.New()
			router.Use(middleware.CheckAccessToken(secret))
			router.GET("/protected", func(c *gin.Context) {
				reached = true
				equal(t, c.MustGet("userID").(user.UserID), user.UserID(42))
				c.Status(http.StatusNoContent)
			})
			var cookies []*http.Cookie
			if tc.token != "" {
				cookies = append(cookies, &http.Cookie{Name: "access_token", Value: tc.token})
			}
			rec := request(router, http.MethodGet, "/protected", "", cookies...)
			equal(t, reached, tc.allowed)
			if tc.allowed {
				equal(t, rec.Code, http.StatusNoContent)
			} else {
				equal(t, rec.Code, http.StatusUnauthorized)
				equal(t, decode[map[string]string](t, rec)["error"], apperrors.ErrInvalidAccessToken)
			}
		})
	}
}

func TestCurrentUser(t *testing.T) {
	f := newFixture(t)
	for _, tc := range []struct {
		name     string
		identity any
		status   int
	}{
		{"missing identity", nil, 500}, {"wrong identity type", int64(1), 500},
		{"unknown user", user.UserID(-1), 500}, {"valid", f.id, 200},
	} {
		t.Run(tc.name, func(t *testing.T) {
			router := gin.New()
			router.Use(func(c *gin.Context) {
				if tc.identity != nil {
					c.Set("userID", tc.identity)
				}
			})
			router.GET("/api/user", userhandler.HandleUser(f.db))
			rec := request(router, http.MethodGet, "/api/user", "")
			equal(t, rec.Code, tc.status)
			if tc.status == 200 {
				got := decode[map[string]any](t, rec)
				equal(t, len(got), 5)
				equal(t, got["id"], any(float64(f.id)))
				equal(t, got["username"], any("alice"))
				equal(t, got["email"], any("alice@example.test"))
				equal(t, got["role"], any("intern"))
				equal(t, got["display_name"], any("Alice"))
				if _, ok := got["password_hash"]; ok {
					t.Fatal("password hash exposed")
				}
			}
		})
	}
}

func TestServerStartupErrors(t *testing.T) {
	wantError(t, appserver.Run(config.ServerConfig{DatabaseURL: "postgres://%invalid"}), "Run: NewDatabaseConnection")
	f := newFixture(t)
	// Occupying the production port exercises startup and route registration while
	// ensuring Run returns without leaving an HTTP server running in the tests.
	listener, err := net.Listen("tcp", ":8080")
	if err == nil {
		defer listener.Close()
	} else if !errors.Is(err, syscall.EADDRINUSE) {
		t.Fatalf("reserve server port: %v", err)
	}
	err = appserver.Run(config.ServerConfig{DatabaseURL: f.url, JWTSecret: secret, MessagesPerUser: 5, MLURL: "http://127.0.0.1:1"})
	wantError(t, err, "address already in use")
}
