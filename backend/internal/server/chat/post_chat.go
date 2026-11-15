package chat

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/apperrors"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models/message"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models/user"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/server"
)

type mlMessage struct {
	UserID    user.UserID       `json:"user_id" binding:"required"`
	MessageID message.MessageID `json:"message_id" binding:"required"`
	Stream    bool              `json:"stream" binding:"required"`
}

type mlPayload struct {
	event    string
	data     string
	complete bool
}

type modelResponse struct {
	Response string `json:"response" binding:"required"`
}

type postChatRequest struct {
	Message string `json:"message" binding:"required"`
}

func (h *Handler) processUserMessage(c *gin.Context, userID user.UserID) (message.MessageID, bool) {
	ctx := c.Request.Context()

	var request postChatRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": apperrors.ErrInvalidRequestBody,
		})
		return 0, false
	}

	userMessage := message.Message{
		UserID: userID,
		Text:   request.Message,
		Role:   message.UserMessageRole,
	}
	messageID, err := h.database.Messages.AddMessageToMessages(ctx, userMessage, h.messagesPerUser)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		log.Printf("handlePostChat: %v", err)
		return 0, false
	}
	return messageID, true
}

func sendMessageToML(ctx context.Context, url string, message mlMessage) (*http.Response, error) {
	data, err := json.Marshal(message)
	if err != nil {
		return nil, fmt.Errorf("sendMessageToML: %w", err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("sendMessageToML: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")

	var client http.Client
	resp, err := client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("sendMessageToML: %w", err)
	}
	return resp, nil
}

func readLine(line string, payload *mlPayload) error {
	if strings.HasPrefix(line, "event: ") {
		event := strings.TrimPrefix(line, "event: ")
		payload.event = event
		return nil
	}
	if strings.HasPrefix(line, "data: ") {
		data := strings.TrimPrefix(line, "data: ")
		payload.data = data
		return nil
	}

	if line == "" {
		payload.complete = true
		return nil
	}

	return fmt.Errorf("readLine: invalid line format")
}

func sendPayloadToFrontend(c *gin.Context, payload mlPayload) error {
	_, err := fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", payload.event, payload.data)
	if err != nil {
		return fmt.Errorf("sendPayloadToFrontend: %w", err)
	}
	c.Writer.Flush()
	return nil
}

func (h *Handler) processStream(c *gin.Context, userID user.UserID, messageID message.MessageID) (string, bool) {
	ctx := c.Request.Context()
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("X-Accel-Buffering", "no")

	message := mlMessage{
		UserID:    userID,
		MessageID: messageID,
		Stream:    true,
	}
	resp, err := sendMessageToML(ctx, h.mlURL+"/analyze", message)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		log.Printf("processStream: %v", err)
		return "", false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		c.Status(http.StatusBadGateway)
		log.Printf("processStream: ML returned %d", resp.StatusCode)
		return "", false
	}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 1024), 1024*1024)

	var payload mlPayload
	for scanner.Scan() {
		line := scanner.Text()
		if err := readLine(line, &payload); err != nil {
			log.Printf("processStream: %v", err)

			err := sendPayloadToFrontend(c, mlPayload{
				event: "error",
				data:  `{"detail":"Invalid ML response"}`,
			})
			if err != nil {
				log.Printf("processStream: %v", err)
			}
			return "", false
		}
		if !payload.complete {
			continue
		}

		if payload.event == "done" {
			if err := sendPayloadToFrontend(c, payload); err != nil {
				c.Status(http.StatusInternalServerError)
				log.Printf("processStream: %v", err)
			}
			return payload.data, true
		}
		if payload.event == "error" {
			if err := sendPayloadToFrontend(c, payload); err != nil {
				log.Printf("processStream: %v", err)
			}
			return "", false
		}
		if err := sendPayloadToFrontend(c, payload); err != nil {
			c.Status(http.StatusInternalServerError)
			log.Printf("processStream: %v", err)
			return "", false
		}
		payload = mlPayload{}
	}

	if err := scanner.Err(); err != nil {
		log.Printf("processStream: reading ML stream: %v", err)
		return "", false
	}

	log.Println("processStream: didn't receive done from ml")
	return "", false
}

func (h *Handler) processModelResponse(ctx context.Context, data string, userID user.UserID) error {
	var modelResponse modelResponse
	if err := json.NewDecoder(strings.NewReader(data)).Decode(&modelResponse); err != nil {
		return fmt.Errorf("processModelResponse: %w", err)
	}
	if strings.TrimSpace(modelResponse.Response) == "" {
		return fmt.Errorf("processModelResponse: empty response")
	}

	message := message.Message{
		UserID: userID,
		Text:   modelResponse.Response,
		Role:   message.AssistantMessageRole,
	}
	if _, err := h.database.Messages.AddMessageToMessages(ctx, message, h.messagesPerUser); err != nil {
		return fmt.Errorf("processModelResponse: %w", err)
	}
	return nil
}

func (h *Handler) handlePostChat(c *gin.Context) {
	userID, err := server.GetUserIDFromContext(c)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		log.Printf("handlePostChat: processUserMessage: %v", err)
		return
	}

	messageID, ok := h.processUserMessage(c, userID)
	if !ok {
		return
	}

	data, ok := h.processStream(c, userID, messageID)
	if !ok {
		return
	}
	if err := h.processModelResponse(c.Request.Context(), data, userID); err != nil {
		log.Printf("handlePostChat: %v", err)
		return
	}
}
