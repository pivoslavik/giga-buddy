package apperrors

import (
	"errors"
)

var (
	ErrInvalidLoginCredentials = errors.New("invalid login credentials")
	ErrTokenExpired            = errors.New("token expired")
)
