package auth

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/pivoslavik/giga-buddy/backend/internal/tokens/refresh"
)

func (h *Handler) handleLogout(c *gin.Context) {
	ctx := c.Request.Context()
	refreshToken, err := c.Cookie("refresh_token")
	if err != nil {
		c.Status(http.StatusUnauthorized)
		return
	}

	tokenHash := refresh.HashRefreshToken(refreshToken)
	if err := h.database.RefreshSessions.DeleteRefreshSessionByTokenHash(ctx, tokenHash); err != nil {
		c.Status(http.StatusUnauthorized)
		return
	}

	clearTokens(c)

	c.Status(http.StatusNoContent)
}
