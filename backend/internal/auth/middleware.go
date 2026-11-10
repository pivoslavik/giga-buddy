package auth

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

const UserIDKey = "auth.userID"

// AuthRequired - returns middleware for access token validation
func AuthRequired(cfg Config, svc *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		if access, err := c.Cookie(cfg.AccessCookieName); err == nil && access != "" {
			if userID, perr := svc.ParseAccess(access); perr == nil {
				c.Set(UserIDKey, userID)
				c.Next()
				return
			}
		}

		refresh, rerr := c.Cookie(cfg.RefreshCookieName)
		if rerr != nil || refresh == "" {
			ClearAuthCookies(c, cfg)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		pair, userID, rerr := svc.Refresh(c.Request.Context(), refresh,
			c.GetHeader("User-Agent"), c.ClientIP())
		if rerr != nil {
			ClearAuthCookies(c, cfg)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "session expired"})
			return
		}
		SetAuthCookies(c, cfg, pair)
		c.Set(UserIDKey, userID)
		c.Next()
	}
}

// UserID - retrieves current user id from context
func UserID(c *gin.Context) (int64, bool) {
	v, ok := c.Get(UserIDKey)
	if !ok {
		return 0, false
	}
	id, ok := v.(int64)
	return id, ok
}
