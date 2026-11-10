package users

// User - user DB model
type User struct {
	ID           int64
	Username     string
	PasswordHash string
	Email        string
	Role         string
	DisplayName  string
}
