package message 

import(
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models/user"
	"time"
)

type MessageRole string
type MessageID int64

const (
	UserMessageRole MessageRole = "user"
	AssistantMessageRole MessageRole = "assistant"
)

type Message struct {
	ID MessageID
	UserID user.UserID 
	Text string
	Role MessageRole
	CreatedAt time.Time
}
