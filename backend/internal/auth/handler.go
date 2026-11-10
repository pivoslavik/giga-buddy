package auth

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	cfg Config
	svc *Service
}

func NewHandler(cfg Config, svc *Service) *Handler {
	return &Handler{cfg: cfg, svc: svc}
}

// Refresh - handles access token refresh
func (h *Handler) Refresh(c *gin.Context) {
	refresh, err := c.Cookie(h.cfg.RefreshCookieName)
	if err != nil || refresh == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "no refresh token"})
		return
	}
	pair, _, err := h.svc.Refresh(c.Request.Context(), refresh,
		c.GetHeader("User-Agent"), c.ClientIP())
	if err != nil {
		ClearAuthCookies(c, h.cfg)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired refresh token"})
		return
	}
	SetAuthCookies(c, h.cfg, pair)
	c.JSON(http.StatusOK, gin.H{
		"access_expires_at":  pair.AccessExpiresAt,
		"refresh_expires_at": pair.RefreshExpiresAt,
	})
}

// Logout - handles logout
func (h *Handler) Logout(c *gin.Context) {
	if refresh, err := c.Cookie(h.cfg.RefreshCookieName); err == nil {
		_ = h.svc.Logout(c.Request.Context(), refresh)
	}
	ClearAuthCookies(c, h.cfg)
	c.Status(http.StatusNoContent)
}

// Me - returns current user id
func (h *Handler) Me(c *gin.Context) {
	id, ok := UserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user_id": id})
}
