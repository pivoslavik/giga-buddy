package login

import (
	"github.com/gin-gonic/gin"

	"github.com/pivoslavik/giga-buddy/internal/auth"
	"github.com/pivoslavik/giga-buddy/internal/users"
)

// RegisterRoutes - registers login routes
func RegisterRoutes(rg *gin.RouterGroup, usersStore users.Store, authSvc *auth.Service, authCfg auth.Config) {
	h := NewHandler(usersStore, authSvc, authCfg)
	rg.POST("/login", h.Login)
}
