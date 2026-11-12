package auth

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/apperrors"
	"golang.org/x/crypto/bcrypt"

	"log"
)

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func (h *Handler) handleLogin(c *gin.Context) {
	ctx := c.Request.Context()
	var request LoginRequest

	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": apperrors.ErrInvalidRequestBody,
		})
		return
	}

	userDB, err := h.database.Users.GetUserByUsername(ctx, request.Username)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": apperrors.ErrInvalidLoginCredentials,
		})
	}

	if err := bcrypt.CompareHashAndPassword([]byte(userDB.PasswordHash), []byte(request.Password)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": apperrors.ErrInvalidLoginCredentials,
		})
	}

	if err := setAccessToken(c, userDB.ID, h.jwtSecret); err != nil {
		c.Status(http.StatusInternalServerError)
		log.Printf("handleLogin: %v\n", err)
		return
	}
	if err := setRefreshToken(c, h.database, userDB.ID); err != nil {
		c.Status(http.StatusInternalServerError)
		log.Printf("handleLogin: %v\n", err)
		return
	}
}
