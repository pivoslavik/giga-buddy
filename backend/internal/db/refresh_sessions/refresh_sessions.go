package refreshsessions

import (
	"context"
	"fmt"
	"log"
	"time"

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

func (q *Queries) CreateRefreshSession(ctx context.Context, session models.RefreshSession) (models.RefreshSessionID, time.Time, error) {
	var dbID models.RefreshSessionID
	var createdAt time.Time
	err := q.pool.QueryRow(ctx,
		`
		INSERT INTO auth_refresh_sessions (user_id, token_hash, user_agent, ip, expires_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id,created_at
		`,
		session.UserID, session.TokenHash, session.UserAgent, session.IP, session.ExpiresAt,
	).Scan(&dbID, &createdAt)
	if err != nil {
		return 0, time.Time{}, fmt.Errorf("CreateRefreshSession: %w", err)
	}
	return dbID, createdAt, nil
}

func (q *Queries) GetRefreshSessionByTokenHash(ctx context.Context, hash string) (models.RefreshSession, error) {
	var session models.RefreshSession
	err := pgxscan.Get(ctx, q.pool, &session,
		`
		SELECT id, user_id, token_hash, user_agent, ip, expires_at, created_at
		FROM auth_refresh_sessions WHERE token_hash = $1
		`,
		hash,
	)
	if err != nil {
		return models.RefreshSession{}, fmt.Errorf("GetRefreshSessionByTokenHash: %w", err)
	}
	return session, nil
}

func (q *Queries) DeleteRefreshSessionByTokenHash(ctx context.Context, hash string) error {
	_, err := q.pool.Exec(ctx,
		`
		DELETE FROM auth_refresh_sessions WHERE token_hash = $1
		`,
		hash,
	)
	if err != nil {
		return fmt.Errorf("DeleteRefreshSessionByTokenHash: %w", err)
	}
	return nil
}

func (q *Queries) DeleteRefreshSessionByUserID(ctx context.Context, userID models.UserID) error {
	_, err := q.pool.Exec(ctx,
		`
		DELETE FROM auth_refresh_sessions WHERE user_id = $1
		`,
		userID,
	)
	if err != nil {
		return fmt.Errorf("DeleteRefreshSessionByUserID: %w", err)
	}
	return nil
}

func (q *Queries) DeleteExpiredRefreshSessions(ctx context.Context) error {
	_, err := q.pool.Exec(ctx,
		`
		DELETE FROM auth_refresh_sessions WHERE expires_at < $1
		`,
		time.Now(),
	)
	if err != nil {
		return fmt.Errorf("DeleteExpiredRefreshSessions: %w", err)
	}
	return nil
}

func (q *Queries) PeriodicallyDeleteExpiredRefreshSessions() {
	ticker := time.NewTicker(time.Hour)
	for range ticker.C {
		err := q.DeleteExpiredRefreshSessions(context.Background())
		if err != nil {
			log.Printf("PeriodicallyDeleteExpiredRefreshSessions: %v\n", err)
		}
	}
}
