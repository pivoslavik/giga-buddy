package access

import (
	"fmt"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models"
)

const accessTokenDuration = 15 * time.Minute

func CreateAccessToken(userID models.UserID, secret []byte) (string, error) {
	now := time.Now()
	claims := jwt.RegisteredClaims{
		Subject:   strconv.FormatInt(int64(userID), 10),
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(accessTokenDuration)),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(secret)
	if err != nil {
		return "", fmt.Errorf("CreateAccessToken: %w", err)
	}
	return tokenString, nil
}

func ParseAccessToken(tokenString string, secret []byte) (models.UserID, error) {
	var claims jwt.RegisteredClaims

	token, err := jwt.ParseWithClaims(
		tokenString,
		&claims,
		func(token *jwt.Token) (any, error) {
			return secret, nil
		},
		jwt.WithValidMethods([]string{"HS256"}),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return 0, fmt.Errorf("ParseAccessToken: %w", err)
	}

	if !token.Valid {
		return 0, fmt.Errorf("ParseAccessToken: invalid token")
	}

	userID, err := strconv.ParseInt(claims.Subject, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("ParseAccessToken: invalid subject: %w", err)
	}
	if userID <= 0 {
		return 0, fmt.Errorf("ParseAccessToken: invalid user ID")
	}

	return models.UserID(userID), nil
}
