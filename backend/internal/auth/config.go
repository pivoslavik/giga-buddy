package auth

import "time"

// Config - auth config
type Config struct {
	JWTSecret         []byte
	AccessTokenTTL    time.Duration
	RefreshTokenTTL   time.Duration
	CookieDomain      string
	CookieSecure      bool
	AccessCookieName  string
	RefreshCookieName string
}
