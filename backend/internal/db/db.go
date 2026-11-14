package db

import (
	"fmt"

	"github.com/pivoslavik/giga-buddy/backend/internal/db/messages"
	refreshsessions "github.com/pivoslavik/giga-buddy/backend/internal/db/refresh_sessions"
	"github.com/pivoslavik/giga-buddy/backend/internal/db/users"
)

// database is a collection of queries to different tables
type Database struct {
	Users           users.Queries
	RefreshSessions refreshsessions.Queries
	Messages        messages.Queries
}

func NewDatabaseConnection(databaseURL string) (Database, error) {
	pool, err := getConfiguredPool(databaseURL)
	if err != nil {
		return Database{}, fmt.Errorf("NewDatabaseConnection: %w", err)
	}
	users := users.NewQueries(pool)
	refreshSessions := refreshsessions.NewQueries(pool)
	return Database{
		Users:           users,
		RefreshSessions: refreshSessions,
	}, nil
}
