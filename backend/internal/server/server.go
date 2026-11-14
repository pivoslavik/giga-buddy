package server

import (
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/pivoslavik/giga-buddy/backend/internal/config"
	"github.com/pivoslavik/giga-buddy/backend/internal/db"
	"github.com/pivoslavik/giga-buddy/backend/internal/server/auth"
	"github.com/pivoslavik/giga-buddy/backend/internal/server/chat"
	"github.com/pivoslavik/giga-buddy/backend/internal/server/health"
	"github.com/pivoslavik/giga-buddy/backend/internal/server/middleware"
	"github.com/pivoslavik/giga-buddy/backend/internal/server/user"
)

func Run(config config.ServerConfig) error {
	// setting up router
	router := gin.New()
	router.Use(gin.LoggerWithConfig(gin.LoggerConfig{
		SkipPaths: []string{"/health"},
	}))
	router.Use(gin.Recovery())

	// setting up database
	database, err := db.NewDatabaseConnection(config.DatabaseURL)
	if err != nil {
		return fmt.Errorf("Run: %w", err)
	}

	// PUBLIC ROUTES
	router.GET("/health", health.HandleHealth) // is used for docker healthcheck only; isn't part of the API

	publicAPI := router.Group("/api")
	authHandler := auth.NewHandler(&database, config.JWTSecret)
	authHandler.RegisterRoutes(publicAPI)

	// PROTECTED ROUTES
	protectedAPI := router.Group("/api")
	protectedAPI.Use(middleware.CheckAccessToken(config.JWTSecret))

	protectedAPI.GET("/user", user.HandleUser(&database))
	chatHandler := chat.NewHandler(&database, config.MessagesPerUser, config.MLURL)

	// background tasks
	go database.RefreshSessions.PeriodicallyDeleteExpiredRefreshSessions()

	return router.Run(":8080")
}
