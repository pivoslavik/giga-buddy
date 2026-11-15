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
	protectedAPI.GET("/document", h.handleGetDocumentsList)
	protectedAPI.GET("/document/:id", h.handleGetDocumentDetailed)
}