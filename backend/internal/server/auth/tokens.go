package auth

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pivoslavik/giga-buddy/backend/internal/db"
	"github.com/pivoslavik/giga-buddy/backend/internal/tokens/access"
	"github.com/pivoslavik/giga-buddy/backend/internal/tokens/refresh"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models/refreshsession"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models/user"
)

func setRefreshToken(c *gin.Context, database *db.Database, userID user.UserID) error {
	refreshToken, err := refresh.CreateRefreshToken()
	if err != nil {
		return fmt.Errorf("setRefreshToken: %w", err)
	}

	refreshDuration := 24 * time.Hour * 7
	refreshSession := refreshsession.RefreshSession{
		UserID:    userID,
		TokenHash: refresh.HashRefreshToken(refreshToken),
		UserAgent: c.Request.UserAgent(),
		IP:        c.ClientIP(),
		ExpiresAt: time.Now().Add(refreshDuration),
	}

	if _, _, err := database.RefreshSessions.CreateRefreshSession(c.Request.Context(), refreshSession); err != nil {
		return fmt.Errorf("setRefreshToken: %w", err)
	}

	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(
		"refresh_token",
		refreshToken,
		int(refreshDuration.Seconds()),
		"/api/auth",
		"",
		cookieSecure,
		true,
	)
	return nil
}

func setAccessToken(c *gin.Context, userID user.UserID, jwtSecret []byte) error {
	accessToken, err := access.CreateAccessToken(userID, jwtSecret)
	if err != nil {
		return fmt.Errorf("setAccessToken: %w", err)
	}

	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(
		"access_token",
		accessToken,
		int((15 * time.Minute).Seconds()),
		"/api",
		"",
		cookieSecure,
		true,
	)
	return nil
}

func clearTokens(c *gin.Context) {
	c.SetSameSite(http.SameSiteLaxMode)

	c.SetCookie(
		"access_token",
		"",
		-1,
		"/api",
		"",
		cookieSecure,
		true,
	)

	c.SetCookie(
		"refresh_token",
		"",
		-1,
		"/api/auth",
		"",
		cookieSecure,
		true,
	)
}
