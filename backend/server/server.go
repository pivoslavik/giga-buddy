package server

import (
	"github.com/gin-gonic/gin"
	"github.com/pivoslavik/giga-buddy/server/health"
)

func Run() error {
	router := gin.Default()

	// public routes
	router.GET("/health", health.HandleHealth)

	return router.Run(":8080")
}
