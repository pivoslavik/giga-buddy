package document

import (
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/georgysavva/scany/v2/pgxscan"
	"github.com/gin-gonic/gin"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/apperrors"
	documentmodel "github.com/pivoslavik/giga-buddy/backend/internal/utils/models/document"
)

func (h *Handler) handleGetDocumentsList(c *gin.Context) {
	ctx := c.Request.Context()

	value, exists := c.GetQuery("amount")
	if !exists {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": apperrors.ErrAmountRequired,
		})
		return
	}

	amount, err := strconv.Atoi(value)
	if err != nil || amount < 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": apperrors.ErrInvalidAmountType,
		})
		return
	}

	values := c.QueryArray("category")
	if len(values) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": apperrors.ErrCategoriesRequired,
		})
		return
	}

	categories := make([]string, len(values))

	for i, category := range values {
		if err := documentmodel.CheckDocumentCategory(category); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Errorf("%w: %s", apperrors.ErrInvalidCategory, category),
			})
			return
		}
		categories[i] = category
	}

	documents, err := h.database.Documents.GetShortDocumentsWithAmountByCategory(ctx, amount, categories)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		log.Printf("HandleDocumentsList: %v\n", err)
		return
	}

	c.JSON(http.StatusOK, documents)
}

func (h *Handler) handleGetDocumentDetailed(c *gin.Context) {
	ctx := c.Request.Context()

	value := c.Param("id")
	intValue, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": apperrors.ErrInvalidID,
		})
		return
	}

	documentID := documentmodel.DocumentID(intValue)
	document, err := h.database.Documents.GetDocumentByID(ctx, documentID)
	if err != nil {
		if pgxscan.NotFound(err) {
			c.Status(http.StatusNotFound)
			return
		}
		c.Status(http.StatusInternalServerError)
		log.Printf("handleGetDocumentDetailed: %v\n", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"title":    document.Title,
		"text":     document.Text,
		"category": string(document.Category),
	})
}
