package health

import (
	"github.com/gin-gonic/gin"
	"net/http"
)

func HandleHealth(c *gin.Context) {
	c.Status(http.StatusOK)
}
