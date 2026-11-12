package apperrors

import (
	"errors"
)

var (
	ErrInvalidLoginCredentials = errors.New("invalid login credentials")
	ErrInvalidRequestBody      = errors.New("invalid request body")
	ErrInvalidToken            = errors.New("invalid token")
	ErrTokenExpired            = errors.New("token expired")
	ErrNotFound                = errors.New("not found")
)
