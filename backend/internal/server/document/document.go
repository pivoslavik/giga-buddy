package document

import (
	"github.com/gin-gonic/gin"
	"github.com/pivoslavik/giga-buddy/backend/internal/db"
)

type Handler struct {
	database        *db.Database
}

func NewHandler(database *db.Database) Handler {
	return Handler{
		database:        database,
	}
}

func (h *Handler) RegisterRoutes(protectedAPI *gin.RouterGroup) {
	protectedAPI.GET("/documents", h.handleGetDocumentsList)
	protectedAPI.GET("/documents/:id", h.handleGetDocumentDetailed)
}