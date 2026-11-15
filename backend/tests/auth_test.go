package tests

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pivoslavik/giga-buddy/backend/internal/server/auth"
	"github.com/pivoslavik/giga-buddy/backend/internal/tokens/access"
	"github.com/pivoslavik/giga-buddy/backend/internal/tokens/refresh"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models/refreshsession"
)

func authRouter(f *fixture) *gin.Engine {
	router := gin.New()
	handler := auth.NewHandler(f.db, secret)
	handler.RegisterRoutes(router.Group("/api"))
	return router
}

func cookieNamed(t *testing.T, rec *httptest.ResponseRecorder, name string) *http.Cookie {
	t.Helper()
	for _, cookie := range rec.Result().Cookies() {
		if cookie.Name == name {
			return cookie
		}
	}
	t.Fatalf("cookie %s missing", name)
	return nil
}

func checkCookie(t *testing.T, cookie *http.Cookie, path string, maxAge int) {
	t.Helper()
	equal(t, cookie.Path, path)
	equal(t, cookie.MaxAge, maxAge)
	equal(t, cookie.HttpOnly, true)
	equal(t, cookie.SameSite, http.SameSiteLaxMode)
	if maxAge > 0 && cookie.Value == "" {
		t.Fatal("empty authentication cookie")
	}
}

func createSession(t *testing.T, f *fixture, token string, expires time.Time) {
	t.Helper()
	_, _, err := f.db.RefreshSessions.CreateRefreshSession(context.Background(), refreshsession.RefreshSession{
		UserID: f.id, TokenHash: refresh.HashRefreshToken(token), ExpiresAt: expires,
	})
	must(t, err)
}

func TestLoginSuccess(t *testing.T) {
	f := newFixture(t)
	router := authRouter(f)
	start := time.Now()
	rec := request(router, http.MethodPost, "/api/auth/login", `{"username":"alice","password":"correct-password"}`)
	equal(t, rec.Code, http.StatusOK)
	equal(t, len(rec.Result().Cookies()), 2)
	accessCookie := cookieNamed(t, rec, "access_token")
	checkCookie(t, accessCookie, "/api", 900)
	id, err := access.ParseAccessToken(accessCookie.Value, secret)
	must(t, err)
	equal(t, id, f.id)
	refreshCookie := cookieNamed(t, rec, "refresh_token")
	checkCookie(t, refreshCookie, "/api/auth", 7*24*60*60)
	session, err := f.db.RefreshSessions.GetRefreshSessionByTokenHash(context.Background(), refresh.HashRefreshToken(refreshCookie.Value))
	must(t, err)
	equal(t, session.UserID, f.id)
	if session.ExpiresAt.Before(start.Add(7*24*time.Hour)) || session.ExpiresAt.After(time.Now().Add(7*24*time.Hour)) {
		t.Fatalf("unexpected refresh expiry: %v", session.ExpiresAt)
	}
	if session.TokenHash == refreshCookie.Value {
		t.Fatal("raw refresh token was persisted")
	}
	equal(t, f.count(t, "auth_refresh_sessions"), 1)
}

func TestLoginRejectsMalformedRequests(t *testing.T) {
	f := newFixture(t)
	router := authRouter(f)
	for _, body := range []string{"", "{", `{}`, `{"username":"alice"}`, `{"password":"secret"}`, `{"username":42,"password":"secret"}`} {
		t.Run(body, func(t *testing.T) {
			rec := request(router, http.MethodPost, "/api/auth/login", body)
			equal(t, rec.Code, http.StatusBadRequest)
			if _, ok := decode[map[string]any](t, rec)["error"]; !ok {
				t.Fatal("missing error response")
			}
			equal(t, len(rec.Result().Cookies()), 0)
		})
	}
	equal(t, f.count(t, "auth_refresh_sessions"), 0)
}

// These checks regress the early-return bug fixed independently of the test suite.
func TestLoginRejectsInvalidCredentialsWithoutIssuingTokens(t *testing.T) {
	for _, body := range []string{
		`{"username":"alice","password":"wrong-password"}`,
		`{"username":"missing","password":"correct-password"}`,
	} {
		t.Run(body, func(t *testing.T) {
			f := newFixture(t)
			rec := request(authRouter(f), http.MethodPost, "/api/auth/login", body)
			equal(t, rec.Code, http.StatusBadRequest)
			decode[map[string]any](t, rec)
			equal(t, len(rec.Result().Cookies()), 0)
			equal(t, f.count(t, "auth_refresh_sessions"), 0)
		})
	}
	t.Run("database lookup error", func(t *testing.T) {
		f := newFixture(t)
		f.exec(t, "ALTER TABLE users RENAME TO unavailable_users")
		rec := request(authRouter(f), http.MethodPost, "/api/auth/login", `{"username":"alice","password":"correct-password"}`)
		equal(t, rec.Code, http.StatusBadRequest)
		equal(t, len(rec.Result().Cookies()), 0)
	})
}

func TestLoginRefreshSessionStorageFailure(t *testing.T) {
	f := newFixture(t)
	f.exec(t, "DROP TABLE auth_refresh_sessions")
	rec := request(authRouter(f), http.MethodPost, "/api/auth/login", `{"username":"alice","password":"correct-password"}`)
	equal(t, rec.Code, http.StatusInternalServerError)
	for _, cookie := range rec.Result().Cookies() {
		if cookie.Name == "refresh_token" {
			t.Fatal("refresh cookie issued without persisting its session")
		}
	}
}

func TestRefreshAccessToken(t *testing.T) {
	f := newFixture(t)
	createSession(t, f, "valid-refresh", time.Now().Add(time.Hour))
	router := authRouter(f)
	for _, cookie := range []*http.Cookie{nil, {Name: "refresh_token", Value: "unknown"}} {
		var cookies []*http.Cookie
		if cookie != nil {
			cookies = append(cookies, cookie)
		}
		rec := request(router, http.MethodPost, "/api/auth/refresh", "", cookies...)
		equal(t, rec.Code, http.StatusUnauthorized)
		equal(t, len(rec.Result().Cookies()), 0)
	}
	rec := request(router, http.MethodPost, "/api/auth/refresh", "", &http.Cookie{Name: "refresh_token", Value: "valid-refresh"})
	equal(t, rec.Code, http.StatusOK)
	equal(t, len(rec.Result().Cookies()), 1)
	cookie := cookieNamed(t, rec, "access_token")
	checkCookie(t, cookie, "/api", 900)
	id, err := access.ParseAccessToken(cookie.Value, secret)
	must(t, err)
	equal(t, id, f.id)
	equal(t, f.count(t, "auth_refresh_sessions"), 1)
}

func TestLogout(t *testing.T) {
	f := newFixture(t)
	createSession(t, f, "logout-token", time.Now().Add(time.Hour))
	createSession(t, f, "other-session", time.Now().Add(time.Hour))
	router := authRouter(f)
	rec := request(router, http.MethodPost, "/api/auth/logout", "")
	equal(t, rec.Code, http.StatusUnauthorized)
	equal(t, f.count(t, "auth_refresh_sessions"), 2)
	cookie := &http.Cookie{Name: "refresh_token", Value: "logout-token"}
	for range 2 {
		rec = request(router, http.MethodPost, "/api/auth/logout", "", cookie)
		equal(t, rec.Code, http.StatusNoContent)
		equal(t, rec.Body.Len(), 0)
		equal(t, len(rec.Result().Cookies()), 2)
		checkCookie(t, cookieNamed(t, rec, "access_token"), "/api", -1)
		checkCookie(t, cookieNamed(t, rec, "refresh_token"), "/api/auth", -1)
		equal(t, f.count(t, "auth_refresh_sessions"), 1)
	}
	_, err := f.db.RefreshSessions.GetRefreshSessionByTokenHash(context.Background(), refresh.HashRefreshToken("other-session"))
	must(t, err)
}

func TestLogoutAndRefreshDatabaseFailure(t *testing.T) {
	f := newFixture(t)
	f.exec(t, "DROP TABLE auth_refresh_sessions")
	for _, path := range []string{"/api/auth/logout", "/api/auth/refresh"} {
		rec := request(authRouter(f), http.MethodPost, path, "", &http.Cookie{Name: "refresh_token", Value: "some-token"})
		equal(t, rec.Code, http.StatusUnauthorized)
		equal(t, len(rec.Result().Cookies()), 0)
	}
}
