package server

import(
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models/user"
)

func GetUserIDFromContext(c *gin.Context) (user.UserID,error){
	value, ok := c.Get("userID")
		if !ok {
			return 0,fmt.Errorf("GetUserIDFromContext: userID is missing from context")
		}
		userID, ok := value.(user.UserID)
		if !ok {
			return 0,fmt.Errorf("GetUserIDFromContext: unexpected userID type: %T", value)
		}
		return userID,nil
}
