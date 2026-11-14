package message

import (
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models/user"
	"time"
)

type MessageRole string
type MessageID int64

const (
	UserMessageRole      MessageRole = "user"
	AssistantMessageRole MessageRole = "assistant"
)

type Message struct {
	ID        MessageID   `json:"id"`
	UserID    user.UserID `json:"user_id"`
	Text      string      `json:"content"` // content for contracts with frontend
	Role      MessageRole `json:"role"`
	CreatedAt time.Time   `json:"created_at"`
}
