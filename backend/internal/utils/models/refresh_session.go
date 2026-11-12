package models

import (
	"time"
)

type RefreshSessionID int64

type RefreshSession struct {
	ID        RefreshSessionID `db:"id"`
	UserID    UserID           `db:"user_id"`
	TokenHash string           `db:"token_hash"`
	UserAgent string           `db:"user_agent"`
	IP        string           `db:"ip"`
	ExpiresAt time.Time        `db:"expires_at"`
	CreatedAt time.Time        `db:"created_at"`
}
