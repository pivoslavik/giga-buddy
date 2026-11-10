package auth

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// SetAuthCookies - puts access and refresh tokens into http-only cookies
func SetAuthCookies(c *gin.Context, cfg Config, pair *TokenPair) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(cfg.AccessCookieName, pair.AccessToken,
		int(time.Until(pair.AccessExpiresAt).Seconds()),
		"/", cfg.CookieDomain, cfg.CookieSecure, true)
	c.SetCookie(cfg.RefreshCookieName, pair.RefreshToken,
		int(time.Until(pair.RefreshExpiresAt).Seconds()),
		"/api", cfg.CookieDomain, cfg.CookieSecure, true)
}

// ClearAuthCookies - removes access and refresh tokens from http-only cookies
func ClearAuthCookies(c *gin.Context, cfg Config) {
	c.SetCookie(cfg.AccessCookieName, "", -1, "/", cfg.CookieDomain, cfg.CookieSecure, true)
	c.SetCookie(cfg.RefreshCookieName, "", -1, "/api", cfg.CookieDomain, cfg.CookieSecure, true)
}
