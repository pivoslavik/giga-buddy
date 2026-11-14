package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/pivoslavik/giga-buddy/backend/internal/tokens/access"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/apperrors"
	"net/http"
)

func CheckAccessToken(jwtSecret []byte) func(g *gin.Context) {
	return func(c *gin.Context) {
		token, err := c.Cookie("access_token")
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": apperrors.ErrInvalidAccessToken,
			})
			return
		}

		userID, err := access.ParseAccessToken(token, jwtSecret)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": apperrors.ErrInvalidAccessToken,
			})
			return
		}

		c.Set("userID", userID)
		c.Next()
	}
}
