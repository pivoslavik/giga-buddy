package user 

import "fmt"

type UserID int64

type UserRole string

const (
	AdminUserRole  UserRole = "admin"
	InternUserRole UserRole = "intern"
)

func CheckUserRole(role string) error {
	if role != string(AdminUserRole) && role != string(InternUserRole) {
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
