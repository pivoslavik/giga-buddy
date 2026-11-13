package apperrors

import "errors"

var (
	ErrAmountRequired     = errors.New("amount query parameter is required")
	ErrInvalidAmountType  = errors.New("amount query parameter must be a positive integer value")
	ErrCategoriesRequired = errors.New("categories query parameter is required")
	ErrInvalidCategory    = errors.New("invalid category")
)
