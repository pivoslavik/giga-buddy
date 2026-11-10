package server

import (
	"github.com/gin-gonic/gin"
	"github.com/pivoslavik/giga-buddy/internal/server/health"
)

func Run() error {
	// setting up router
	router := gin.New()
	router.Use(gin.LoggerWithConfig(gin.LoggerConfig{
		SkipPaths: []string{"/health"},
	}))
	router.Use(gin.Recovery())

	// public routes
	router.GET("/health", health.HandleHealth)

	return router.Run(":8080")
}
