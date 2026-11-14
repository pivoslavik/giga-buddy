package users

import (
	"context"
	"fmt"
	"github.com/georgysavva/scany/v2/pgxscan"
	usermodel "github.com/pivoslavik/giga-buddy/backend/internal/utils/models/user"
)

func (q *Queries) GetUserByUsername(ctx context.Context, username string) (usermodel.User, error) {
	var user usermodel.User
	err := pgxscan.Get(ctx, q.pool, &user,
		`
		SELECT id, username, password_hash, email, role, display_name
		FROM users 
		WHERE username = $1 
		`,
		username,
	)
	if err != nil {
		return usermodel.User{}, fmt.Errorf("GetUserByUsername: %w", err)
	}
	return user, nil
}

func (q *Queries) GetUserByUserID(ctx context.Context, userID usermodel.UserID) (usermodel.User, error) {
	var user usermodel.User
	err := pgxscan.Get(ctx, q.pool, &user,
		`
		SELECT id, username, password_hash, email, role, display_name
		FROM users 
		WHERE id = $1 
		`,
		userID,
	)
	if err != nil {
		return usermodel.User{}, fmt.Errorf("GetUserByUserID: %w", err)
	}
	return user, nil
}

