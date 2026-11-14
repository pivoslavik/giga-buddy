package messages

import (
	"github.com/jackc/pgx/v5/pgxpool"
)

type Queries struct {
	pool *pgxpool.Pool
}

func newQueries(pool *pgxpool.Pool) Queries {
	return Queries{
		pool: pool,
	}
}
