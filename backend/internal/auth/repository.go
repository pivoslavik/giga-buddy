package auth

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SessionStore - main interface for DB session
type SessionStore interface {
	Create(ctx context.Context, s *RefreshSession) error
	GetByHash(ctx context.Context, hash string) (*RefreshSession, error)
	DeleteByHash(ctx context.Context, hash string) error
	DeleteByUserID(ctx context.Context, userID int64) error
	DeleteExpired(ctx context.Context) error
}

// PgxSessionStore - auth DB pool
type PgxSessionStore struct {
	pool *pgxpool.Pool
}

func NewPgxSessionStore(pool *pgxpool.Pool) *PgxSessionStore {
	return &PgxSessionStore{pool: pool}
}

// Create - creates a new refresh session
func (r *PgxSessionStore) Create(ctx context.Context, s *RefreshSession) error {
	const q = `INSERT INTO auth_refresh_sessions (user_id, token_hash, user_agent, ip, expires_at)
               VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`
	return r.pool.QueryRow(ctx, q, s.UserID, s.TokenHash, s.UserAgent, s.IP, s.ExpiresAt).
		Scan(&s.ID, &s.CreatedAt)
}

// GetByHash - gets refresh session by refresh token hash
func (r *PgxSessionStore) GetByHash(ctx context.Context, hash string) (*RefreshSession, error) {
	const q = `SELECT id, user_id, token_hash, user_agent, ip, expires_at, created_at
               FROM auth_refresh_sessions WHERE token_hash = $1`
	s := &RefreshSession{}
	err := r.pool.QueryRow(ctx, q, hash).Scan(
		&s.ID, &s.UserID, &s.TokenHash, &s.UserAgent, &s.IP, &s.ExpiresAt, &s.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return s, err
}

// DeleteByHash - deletes refresh session by refresh token hash
func (r *PgxSessionStore) DeleteByHash(ctx context.Context, hash string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM auth_refresh_sessions WHERE token_hash = $1`, hash)
	return err
}

// DeleteByUserID - deletes refresh session by user id
func (r *PgxSessionStore) DeleteByUserID(ctx context.Context, userID int64) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM auth_refresh_sessions WHERE user_id = $1`, userID)
	return err
}

// DeleteExpired - deletes expired refresh sessions
func (r *PgxSessionStore) DeleteExpired(ctx context.Context) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM auth_refresh_sessions WHERE expires_at < $1`, time.Now())
	return err
}
