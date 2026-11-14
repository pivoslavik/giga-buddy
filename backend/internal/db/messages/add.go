package messages

import(
	"fmt"
	"context"
	"github.com/jackc/pgx/v5"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models/message"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models/user"
)

func deleteMessagesExceedingLimit(ctx context.Context,tx pgx.Tx,userID user.UserID,messagePerUser int) error{
	_,err := tx.Exec(ctx,
		`
		DELETE FROM messages
		WHERE user_id = $1
		AND id IN (
			SELECT id FROM messages
			WHERE user_id = $1
			ORDER BY created_at DESC, id DESC
			OFFSET $2
		)
		`,
		userID,messagePerUser,
	)
	if err != nil {
		return fmt.Errorf("deleteMessagesExceedingLimit: %w",err)
	}
	return nil
}

func (q *Queries) AddMessageToMessages(ctx context.Context,message message.Message, messagesPerUser int) error{
	tx,err := q.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("AddMessageToMessages: %w",err)
	}
	defer tx.Rollback(ctx)

	_,err = tx.Exec(ctx,
		`
		INSERT INTO messages (user_id,text,role)
		VALUES ($1,$2,$3)
		`,
		message.UserID,message.Text,message.Role,
	)
	if err != nil {
		return fmt.Errorf("AddMessageToMessages: %w",err)
	}

	if err := deleteMessagesExceedingLimit(ctx,tx,message.UserID,messagesPerUser); err != nil {
		return fmt.Errorf("AddMessageToMessages: %w",err)
	}
	
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("AddMessageToMessages: %w",err)
	}
	return nil
}
