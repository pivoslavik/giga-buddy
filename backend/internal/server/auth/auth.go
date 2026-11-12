package auth

import (
	"github.com/gin-gonic/gin"
	"github.com/pivoslavik/giga-buddy/backend/internal/db"
)

const cookieSecure = false // change for https

type Handler struct {
	database  *db.Database
	jwtSecret []byte
}

func NewHandler(database *db.Database) Handler {
	return Handler{
		database: database,
	}
}

func (h *Handler) RegisterRoutes(apiGroup *gin.RouterGroup) {
	authGroup := apiGroup.Group("/auth")

	authGroup.POST("/login", h.handleLogin)
	authGroup.POST("/refresh", h.handleRefresh)
}
