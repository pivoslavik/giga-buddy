package tests

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pivoslavik/giga-buddy/backend/internal/db"
	"github.com/pivoslavik/giga-buddy/backend/internal/db/messages"
	refreshsessions "github.com/pivoslavik/giga-buddy/backend/internal/db/refresh_sessions"
	"github.com/pivoslavik/giga-buddy/backend/internal/db/users"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models/user"
	"golang.org/x/crypto/bcrypt"
)

var schemaCounter atomic.Uint64

func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)
	os.Exit(m.Run())
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func equal[T comparable](t *testing.T, got, want T) {
	t.Helper()
	if got != want {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func contains(t *testing.T, got, want string) {
	t.Helper()
	if !strings.Contains(got, want) {
		t.Fatalf("%q does not contain %q", got, want)
	}
}

func wantError(t *testing.T, err error, text string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected error containing %q", text)
	}
	contains(t, err.Error(), text)
}

type fixture struct {
	pool *pgxpool.Pool
	db   *db.Database
	url  string
	id   user.UserID
	hash string
}

// Every fixture owns a schema. No application tables or data outside it are touched.
func newFixture(t *testing.T) *fixture {
	t.Helper()
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Fatal("TEST_DATABASE_URL must point to a disposable PostgreSQL database; see tests/README.md")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, databaseURL)
	must(t, err)
	t.Cleanup(admin.Close)
	must(t, admin.Ping(ctx))
	schema := fmt.Sprintf("backend_test_%d_%d", os.Getpid(), schemaCounter.Add(1))
	quoted := pgx.Identifier{schema}.Sanitize()
	_, err = admin.Exec(ctx, "CREATE SCHEMA "+quoted)
	must(t, err)
	t.Cleanup(func() {
		_, err := admin.Exec(ctx, "DROP SCHEMA "+quoted+" CASCADE")
		if err != nil {
			t.Errorf("remove test schema: %v", err)
		}
	})
	u, err := url.Parse(databaseURL)
	must(t, err)
	query := u.Query()
	query.Set("search_path", schema)
	u.RawQuery = query.Encode()
	pool, err := pgxpool.New(ctx, u.String())
	must(t, err)
	t.Cleanup(pool.Close)
	for _, migration := range []string{
		"000002_create_users.up.sql", "000003_create_messages.up.sql",
		"000006_create_auth_refresh_sessions.up.sql", "000007_add_user_role_enum.up.sql",
		"000008_messages_add_created_at.up.sql",
	} {
		sql, err := os.ReadFile(filepath.Join("..", "..", "infra", "postgres", migration))
		must(t, err)
		_, err = pool.Exec(ctx, string(sql))
		must(t, err)
	}
	f := &fixture{pool: pool, url: u.String(), db: &db.Database{
		Users: users.NewQueries(pool), RefreshSessions: refreshsessions.NewQueries(pool),
		Messages: messages.NewQueries(pool),
	}}
	hash, err := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.MinCost)
	must(t, err)
	f.hash = string(hash)
	err = pool.QueryRow(ctx, `INSERT INTO users (username,password_hash,email,role,display_name)
		VALUES ('alice',$1,'alice@example.test','intern','Alice') RETURNING id`, f.hash).Scan(&f.id)
	must(t, err)
	return f
}

func (f *fixture) exec(t *testing.T, sql string, args ...any) {
	t.Helper()
	_, err := f.pool.Exec(context.Background(), sql, args...)
	must(t, err)
}

func (f *fixture) count(t *testing.T, table string) int {
	t.Helper()
	var n int
	err := f.pool.QueryRow(context.Background(), "SELECT count(*) FROM "+pgx.Identifier{table}.Sanitize()).Scan(&n)
	must(t, err)
	return n
}

func request(handler http.Handler, method, path, body string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var result T
	must(t, json.Unmarshal(rec.Body.Bytes(), &result))
	return result
}
