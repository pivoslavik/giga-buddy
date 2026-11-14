package chat

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/golang-migrate/migrate/v4/database"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/apperrors"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models/message"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/server"
)

type postChatRequest struct {
	Message string `json:"message" binding:"required"`
}

func (h *Handler) handlePostChat(c *gin.Context){
	ctx := c.Request.Context()
	userID,err := server.GetUserIDFromContext(c)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		log.Printf("handlePostChat: %v\n",err)
		return
	}

	var request postChatRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest,gin.H{
			"error":apperrors.ErrInvalidRequestBody,
		})
	}
	
	userMessage := message.Message{
		UserID: userID,
		Text: request.Message,
		Role: message.UserMessageRole,
	}
	if err := h.database.Messages.AddMessageToMessages(ctx,userMessage,h.messagesPerUser); err != nil {
		c.Status(http.StatusInternalServerError)
		log.Printf("handlePostChat: %v",err)
		return
	}

	
}
