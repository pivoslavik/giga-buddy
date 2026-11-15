package tests

import (
	"strings"
	"testing"

	"github.com/pivoslavik/giga-buddy/backend/internal/config"
)

func TestServerConfig(t *testing.T) {
	valid := map[string]string{
		"DATABASE_URL": "postgres://localhost/test", "JWT_SECRET": "test-secret",
		"MESSAGES_PER_USER": "25", "ML_URL": "http://localhost:9000",
	}
	cases := []struct{ name, key, value, errorText string }{
		{name: "valid"},
		{"missing database", "DATABASE_URL", "", "DATABASE_URL"},
		{"missing secret", "JWT_SECRET", "", "JWT_SECRET"},
		{"missing limit", "MESSAGES_PER_USER", "", "MESSAGES_PER_USER"},
		{"invalid limit", "MESSAGES_PER_USER", "abc", "invalid MESSAGES_PER_USER"},
		{"overflowing limit", "MESSAGES_PER_USER", strings.Repeat("9", 30), "invalid MESSAGES_PER_USER"},
		{"missing ML URL", "ML_URL", "", "ML_URL"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// Prevent a developer's .env from supplying deliberately missing values.
			t.Chdir(t.TempDir())
			for key, value := range valid {
				t.Setenv(key, value)
			}
			if tc.key != "" {
				t.Setenv(tc.key, tc.value)
			}
			cfg, err := config.GetServerConfig()
			if tc.errorText != "" {
				wantError(t, err, tc.errorText)
				return
			}
			must(t, err)
			equal(t, cfg.DatabaseURL, valid["DATABASE_URL"])
			equal(t, string(cfg.JWTSecret), valid["JWT_SECRET"])
			equal(t, cfg.MessagesPerUser, 25)
			equal(t, cfg.MLURL, valid["ML_URL"])
		})
	}
}
