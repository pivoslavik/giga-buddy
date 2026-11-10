package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log/slog"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Service struct {
	cfg      Config
	sessions SessionStore
}

func NewService(cfg Config, sessions SessionStore) *Service {
	return &Service{cfg: cfg, sessions: sessions}
}

// Issue - issues a pair of tokens and commits a new refresh session
func (s *Service) Issue(ctx context.Context, userID int64, userAgent, ip string) (*TokenPair, error) {
	now := time.Now()
	accessExp := now.Add(s.cfg.AccessTokenTTL)
	refreshExp := now.Add(s.cfg.RefreshTokenTTL)

	access, err := s.signAccess(userID, accessExp)
	if err != nil {
		return nil, err
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return nil, err
	}
	refresh := hex.EncodeToString(raw)

	sess := &RefreshSession{
		UserID:    userID,
		TokenHash: hashToken(refresh),
		UserAgent: userAgent,
		IP:        ip,
		ExpiresAt: refreshExp,
	}
	if err := s.sessions.Create(ctx, sess); err != nil {
		return nil, err
	}

	return &TokenPair{
		AccessToken:      access,
		RefreshToken:     refresh,
		AccessExpiresAt:  accessExp,
		RefreshExpiresAt: refreshExp,
	}, nil
}

// Refresh - validates the refresh token, rotates the session and returns a pair of new tokens
func (s *Service) Refresh(ctx context.Context, refreshToken, userAgent, ip string) (*TokenPair, int64, error) {
	hash := hashToken(refreshToken)
	sess, err := s.sessions.GetByHash(ctx, hash)
	if err != nil {
		return nil, 0, ErrInvalidToken
	}
	if time.Now().After(sess.ExpiresAt) {
		_ = s.sessions.DeleteByHash(ctx, hash)
		return nil, 0, ErrTokenExpired
	}
	if err := s.sessions.DeleteByHash(ctx, hash); err != nil {
		return nil, 0, err
	}
	pair, err := s.Issue(ctx, sess.UserID, userAgent, ip)
	if err != nil {
		return nil, 0, err
	}
	return pair, sess.UserID, nil
}

// Logout - performs a logout from current session
func (s *Service) Logout(ctx context.Context, refreshToken string) error {
	return s.sessions.DeleteByHash(ctx, hashToken(refreshToken))
}

// RevokeAll - revokes all refresh sessions of specified user
func (s *Service) RevokeAll(ctx context.Context, userID int64) error {
	return s.sessions.DeleteByUserID(ctx, userID)
}

// CleanupExpired - deletes expired refresh sessions
func (s *Service) CleanupExpired(ctx context.Context) error {
	return s.sessions.DeleteExpired(ctx)
}

// ParseAccess - checks access token and returns user id if valid
func (s *Service) ParseAccess(tokenStr string) (int64, error) {
	claims := jwt.MapClaims{}
	tok, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return s.cfg.JWTSecret, nil
	})
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return 0, ErrTokenExpired
		}
		return 0, ErrInvalidToken
	}
	if !tok.Valid {
		return 0, ErrInvalidToken
	}
	sub, ok := claims["sub"].(float64)
	if !ok {
		return 0, ErrInvalidToken
	}
	return int64(sub), nil
}

// Fills access jwt token with necessary data
func (s *Service) signAccess(userID int64, exp time.Time) (string, error) {
	claims := jwt.MapClaims{
		"sub": userID,
		"exp": exp.Unix(),
		"iat": time.Now().Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.cfg.JWTSecret)
}

// Returns the hash of refresh token string
func hashToken(t string) string {
	h := sha256.Sum256([]byte(t))
	return hex.EncodeToString(h[:])
}

// RunCleanup - performs a cleanup of expired refresh sessions over time
func (s *Service) RunCleanup(ctx context.Context, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			c, cancel := context.WithTimeout(ctx, 10*time.Second)
			if err := s.CleanupExpired(c); err != nil {
				slog.Error("auth: cleanup expired sessions", "err", err)
			}
			cancel()
		}
	}
}
