package users

import (
	"context"
	"fmt"
	"github.com/georgysavva/scany/v2/pgxscan"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models"
)

type Queries struct {
	pool *pgxpool.Pool
}

func NewQueries(pool *pgxpool.Pool) Queries {
	return Queries{
		pool: pool,
	}
}

func (q *Queries) GetUserByUsername(ctx context.Context, username string) (models.User, error) {
	var user models.User
	err := pgxscan.Get(ctx, q.pool, &user,
		`
		SELECT id, username, password_hash, email, role, display_name
		FROM users 
		WHERE username = $1 
		`,
		username,
	)
	if err != nil {
		return models.User{}, fmt.Errorf("GetUserByUsername: %w", err)
	}
	return user, nil
}

func (q *Queries) GetUserByUserID(ctx context.Context, userID models.UserID) (models.User, error) {
	var user models.User
	err := pgxscan.Get(ctx, q.pool, &user,
		`
		SELECT id, username, password_hash, email, role, display_name
		FROM users 
		WHERE id = $1 
		`,
		userID,
	)
	if err != nil {
		return models.User{}, fmt.Errorf("GetUserByUserID: %w", err)
	}
	return user, nil
}
