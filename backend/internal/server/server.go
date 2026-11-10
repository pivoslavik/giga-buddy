package server

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gin-gonic/gin"
	"github.com/pivoslavik/giga-buddy/internal/auth"
	"github.com/pivoslavik/giga-buddy/internal/login"
	"github.com/pivoslavik/giga-buddy/internal/server/health"
	"github.com/pivoslavik/giga-buddy/internal/users"
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

	// setting up database
	ctx := context.Background()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL environment variable is not set")
	}

	poolCfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		log.Fatalf("parse db dsn: %v", err)
	}

	poolCfg.MaxConns = 20
	poolCfg.MinConns = 2
	poolCfg.MaxConnLifetime = time.Hour
	poolCfg.MaxConnIdleTime = 15 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		log.Fatalf("create pgx pool: %v", err)
	}
	defer pool.Close()

	// api routes
	api := router.Group("/api")

	// auth
	authCfg := auth.Config{
		JWTSecret:         []byte(os.Getenv("JWT_SECRET")),
		AccessTokenTTL:    15 * time.Minute,
		RefreshTokenTTL:   7 * 24 * time.Hour,
		CookieDomain:      os.Getenv("COOKIE_DOMAIN"),
		CookieSecure:      os.Getenv("COOKIE_SECURE") == "true",
		AccessCookieName:  "access_token",
		RefreshCookieName: "refresh_token",
	}
	authStore := auth.NewPgxSessionStore(pool)
	authSvc := auth.NewService(authCfg, authStore)

	// auth routes registration + middleware
	authMiddleware := auth.AuthRequired(authCfg, authSvc)
	auth.RegisterRoutes(api, authCfg, authSvc, authMiddleware)

	// users
	usersStore := users.NewPgxStore(pool)

	// login
	login.RegisterRoutes(api, usersStore, authSvc, authCfg)

	// start a worker to delete expired refresh sessions over time
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go authSvc.RunCleanup(ctx, time.Hour)

	return router.Run(":8080")
}
