package models

import "fmt"

type UserID int64

type UserRole string

const (
	Admin  UserRole = "admin"
	Intern UserRole = "intern"
)

func CheckUserRole(role string) error {
	if role != string(Admin) && role != string(Intern) {
		return fmt.Errorf("CheckUserRole: invalid user role: %s", role)
	}
	return nil
}

// User struct describes a row from users table
type User struct {
	ID           UserID   `db:"id"`
	Username     string   `db:"username"`
	PasswordHash string   `db:"password_hash"`
	Email        string   `db:"email"`
	Role         UserRole `db:"role"`
	DisplayName  string   `db:"display_name"`
}
