package messages

import (
	"context"
	"fmt"
	"github.com/georgysavva/scany/v2/pgxscan"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models/message"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models/user"
)

func (q *Queries) GetMessagesByUserID(ctx context.Context, userID user.UserID) ([]message.Message, error) {
	messages := make([]message.Message, 0)
	err := pgxscan.Select(ctx, q.pool, &messages,
		`
		SELECT id,user_id,text,role,created_at
		FROM messages
		WHERE user_id = $1
		`,
		userID,
	)
	if err != nil {
		return make([]message.Message, 0), fmt.Errorf("GetMessagesByUserID: %w", err)
	}
	return messages, nil
}
