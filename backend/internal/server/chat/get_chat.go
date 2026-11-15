package chat

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/server"
)

func (h *Handler) handleGetChat(c *gin.Context) {
	userID, err := server.GetUserIDFromContext(c)
	if err != nil {
		c.Status(http.StatusUnauthorized)
		return
	}
	messages, err := h.database.Messages.GetMessagesByUserID(c.Request.Context(), userID)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		log.Printf("handleGetChat: %v\n", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"messages": messages,
	})

}
