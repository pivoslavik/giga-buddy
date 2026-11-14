package documents

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

func (q *Queries) GetShortDocumentsWithAmountByCategory(ctx context.Context, amount int, categories []models.DocumentCategory) ([]models.ShortDocument, error) {
	documents := make([]models.ShortDocument, 0)
	err := pgxscan.Select(ctx, q.pool, &documents,
		`
			SELECT id, title, description, category
			FROM documents
		WHERE category = ANY($1::document_category[])
			LIMIT $2
		`,
		categories, amount,
	)
	if err != nil {
		return nil, fmt.Errorf("GetShortDocumentsWithAmountByCategory: %w", err)
	}
	return documents, nil
}
