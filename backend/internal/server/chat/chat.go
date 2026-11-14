package chat

import (
	"github.com/gin-gonic/gin"
	"github.com/pivoslavik/giga-buddy/backend/internal/db"
)

type Handler struct {
	database        *db.Database
	messagesPerUser int
	mlURL           string
}

func NewHandler(database *db.Database, messagesPerUser int, mlURL string) Handler {
	return Handler{
		database:        database,
		messagesPerUser: messagesPerUser,
		mlURL:           mlURL,
	}
}

func (h *Handler) RegisterRoutes(protectedAPI *gin.RouterGroup) {
	protectedAPI.POST("/chat", h.handlePostChat)
	// TODO: add get chat handler
}
