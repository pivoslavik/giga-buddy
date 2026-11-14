package user

import (
	"github.com/gin-gonic/gin"
	"github.com/pivoslavik/giga-buddy/backend/internal/db"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models"
	"log"
	"net/http"
)

func HandleUser(database *db.Database) func(c *gin.Context) {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		value, ok := c.Get("userID")
		if !ok {
			c.Status(http.StatusInternalServerError)
			log.Printf("HandleUser: no userID set")
			return
		}
		userID, ok := value.(models.UserID)
		if !ok {
			c.Status(http.StatusInternalServerError)
			log.Printf("HandleUser: could't convert UserID value to UserID type: %T", value)
			return
		}

		user, err := database.Users.GetUserByUserID(ctx, userID)
		if err != nil {
			c.Status(http.StatusInternalServerError)
			log.Printf("HandleUser: %v", err)
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"id":           user.ID,
			"username":     user.Username,
			"email":        user.Email,
			"role":         user.Role,
			"display_name": user.DisplayName,
		})
	}
}
