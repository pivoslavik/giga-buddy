package auth

import (
	"github.com/gin-gonic/gin"
)

// RegisterRoutes - registers auth routes to provided router group
func RegisterRoutes(rg *gin.RouterGroup, cfg Config, svc *Service, authMW gin.HandlerFunc) {
	h := NewHandler(cfg, svc)

	g := rg.Group("/auth")
	g.POST("/refresh", h.Refresh)
	g.POST("/logout", h.Logout)

	protected := g.Group("")
	protected.Use(authMW)
	protected.GET("/me", h.Me)
}
