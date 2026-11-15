package documents

import (
	"context"
	"fmt"

	"github.com/georgysavva/scany/v2/pgxscan"
	documentmodel "github.com/pivoslavik/giga-buddy/backend/internal/utils/models/document"
)

func (q *Queries) GetShortDocumentsWithAmountByCategory(ctx context.Context, amount int, categories []string) ([]documentmodel.ShortDocument, error) {
	documents := make([]documentmodel.ShortDocument, 0)

	err := pgxscan.Select(ctx, q.pool, &documents,
		`
			SELECT id, title, description, category
			FROM documents
			WHERE category IN (
				SELECT unnest($1::text[])::document_category
			)
			LIMIT $2
		`,
		categories, amount,
	)
	if err != nil {
		return nil, fmt.Errorf("GetShortDocumentsWithAmountByCategory: %w", err)
	}
	return documents, nil
}

func (q *Queries) GetDocumentByID(ctx context.Context, documentID documentmodel.DocumentID) (documentmodel.Document, error) {
	var document documentmodel.Document

	err := pgxscan.Get(ctx, q.pool, &document,
		`
			SELECT id, title, description, text, category
			FROM documents
			WHERE id = $1
		`,
		documentID,
	)
	if err != nil {
		if pgxscan.NotFound(err) {
			return documentmodel.Document{}, err
		}
		return documentmodel.Document{}, fmt.Errorf("GetDocumentByID: %w", err)
	}
	return document, nil
}
