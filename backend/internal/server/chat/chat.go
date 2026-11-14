package chat

import (
	"github.com/pivoslavik/giga-buddy/backend/internal/db"
	"github.com/gin-gonic/gin"
)

type Handler struct {
	database *db.Database
	messagesPerUser int
}

func NewHandler(database *db.Database, messagesPerUser int) Handler {
	return Handler{
		database:database,
		messagesPerUser: messagesPerUser,
	}
}

func (h *Handler) RegisterRoutes(protectedAPI *gin.RouterGroup) {
	protectedAPI.GET("/chat",h.handleGetChat)
	protectedAPI.POST("/chat",h.handlePostChat)
}
