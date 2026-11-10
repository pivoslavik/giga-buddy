package users

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("user not found")

// Store - interface for DB user model
type Store interface {
	GetByUsername(ctx context.Context, username string) (*User, error)
}

// PgxStore - pgx DB model
type PgxStore struct {
	pool *pgxpool.Pool
}

func NewPgxStore(pool *pgxpool.Pool) *PgxStore {
	return &PgxStore{pool: pool}
}

// GetByUsername - gets user by its username
func (s *PgxStore) GetByUsername(ctx context.Context, username string) (*User, error) {
	const q = `SELECT id, username, email, password FROM users WHERE username = $1`
	u := &User{}
	err := s.pool.QueryRow(ctx, q, username).Scan(
		&u.ID, &u.Username, &u.Email, &u.PasswordHash,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return u, err
}
