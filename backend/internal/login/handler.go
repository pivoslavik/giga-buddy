package login

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"

	"github.com/pivoslavik/giga-buddy/internal/auth"
	"github.com/pivoslavik/giga-buddy/internal/users"
)

type Handler struct {
	users   users.Store
	authSvc *auth.Service
	authCfg auth.Config
}

func NewHandler(usersStore users.Store, authSvc *auth.Service, authCfg auth.Config) *Handler {
	return &Handler{users: usersStore, authSvc: authSvc, authCfg: authCfg}
}

// Login request data
type loginRequest struct {
	Username string `json:"username" binding:"required,max=255"`
	Password string `json:"password" binding:"required"`
}

// Login - logs user in
func (h *Handler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	username := strings.TrimSpace(req.Username)

	u, err := h.users.GetByUsername(c.Request.Context(), username)
	if err != nil {
		if errors.Is(err, users.ErrNotFound) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	pair, err := h.authSvc.Issue(
		c.Request.Context(),
		u.ID,
		c.GetHeader("User-Agent"),
		c.ClientIP(),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	auth.SetAuthCookies(c, h.authCfg, pair)
	c.JSON(http.StatusOK, gin.H{
		"user": gin.H{
			"id":       u.ID,
			"username": u.Username,
			"email":    u.Email,
		},
	})
}
