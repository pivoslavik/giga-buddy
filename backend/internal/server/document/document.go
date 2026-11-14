package document

import (
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/pivoslavik/giga-buddy/backend/internal/db"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/apperrors"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models"
)

func HandleDocumentsList(db *db.Database) func(c *gin.Context) {
	return func(c *gin.Context) {
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

		categories := make([]models.DocumentCategory, len(values))

		for i, category := range values {
			if err := models.CheckDocumentCategory(category); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"error": fmt.Errorf("%w: %s", apperrors.ErrInvalidCategory, category),
				})
				return
			}
			categories[i] = models.DocumentCategory(category)
		}

		documents, err := db.Documents.GetShortDocumentsWithAmountByCategory(ctx, amount, categories)
		if err != nil {
			c.Status(http.StatusInternalServerError)
			log.Printf("HandleDocumentsList: %v\n", err)
			return
		}

		c.JSON(http.StatusOK, documents)
	}
}
