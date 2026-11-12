package auth

import (
	"github.com/gin-gonic/gin"
	"github.com/pivoslavik/giga-buddy/backend/internal/tokens/refresh"
	"log"
	"net/http"
)

func (h *Handler) handleRefresh(c *gin.Context) {
	ctx := c.Request.Context()
	refreshToken, err := c.Cookie("refresh_token")
	if err != nil {
		c.Status(http.StatusUnauthorized)
		return
	}

	tokenHash := refresh.HashRefreshToken(refreshToken)
	session, err := h.database.RefreshSessions.GetRefreshSessionByTokenHash(ctx, tokenHash)
	if err != nil {
		c.Status(http.StatusUnauthorized)
		return
	}

	if err := setAccessToken(c, session.UserID, h.jwtSecret); err != nil {
		c.Status(http.StatusInternalServerError)
		log.Printf("handleRefresh: %v", err)
		return
	}
}
