package tests

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/pivoslavik/giga-buddy/backend/internal/db"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models/message"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models/refreshsession"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models/user"
)

func TestDatabaseConnection(t *testing.T) {
	_, err := db.NewDatabaseConnection("postgres://%invalid")
	wantError(t, err, "NewDatabaseConnection: getConfiguredPool:")
	f := newFixture(t)
	database, err := db.NewDatabaseConnection(f.url)
	must(t, err)
	got, err := database.Users.GetUserByUserID(context.Background(), f.id)
	must(t, err)
	equal(t, got.Username, "alice")
}

func TestUserQueries(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	byName, err := f.db.Users.GetUserByUsername(ctx, "alice")
	must(t, err)
	byID, err := f.db.Users.GetUserByUserID(ctx, f.id)
	must(t, err)
	equal(t, byID, byName)
	equal(t, byID.ID, f.id)
	equal(t, byID.PasswordHash, f.hash)
	equal(t, byID.Email, "alice@example.test")
	equal(t, byID.Role, user.InternUserRole)
	equal(t, byID.DisplayName, "Alice")
	_, err = f.db.Users.GetUserByUsername(ctx, "missing")
	if !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("expected wrapped ErrNoRows, got %v", err)
	}
	_, err = f.db.Users.GetUserByUserID(ctx, -1)
	if !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("expected wrapped ErrNoRows, got %v", err)
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	_, err = f.db.Users.GetUserByUsername(cancelled, "alice")
	wantError(t, err, "GetUserByUsername")
	_, err = f.db.Users.GetUserByUserID(cancelled, f.id)
	wantError(t, err, "GetUserByUserID")
}

func TestMessageRetentionAndUserIsolation(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	empty, err := f.db.Messages.GetMessagesByUserID(ctx, f.id)
	must(t, err)
	if empty == nil || len(empty) != 0 {
		t.Fatalf("expected non-nil empty slice, got %#v", empty)
	}
	f.exec(t, `INSERT INTO users (username,password_hash,email,role,display_name)
		VALUES ('bob',$1,'bob@example.test','admin','Bob')`, f.hash)
	var other user.UserID
	must(t, f.pool.QueryRow(ctx, "SELECT id FROM users WHERE username='bob'").Scan(&other))
	_, err = f.db.Messages.AddMessageToMessages(ctx, message.Message{UserID: other, Text: "other user's message", Role: message.UserMessageRole}, 2)
	must(t, err)
	var keep []message.MessageID
	for _, text := range []string{"first", "second", "third"} {
		id, err := f.db.Messages.AddMessageToMessages(ctx, message.Message{UserID: f.id, Text: text, Role: message.UserMessageRole}, 2)
		must(t, err)
		keep = append(keep, id)
		// Equal timestamps exercise the id tie-breaker in the retention query.
		f.exec(t, "UPDATE messages SET created_at='2020-01-01' WHERE user_id=$1", f.id)
	}
	got, err := f.db.Messages.GetMessagesByUserID(ctx, f.id)
	must(t, err)
	equal(t, len(got), 2)
	seen := map[message.MessageID]string{}
	for _, msg := range got {
		equal(t, msg.UserID, f.id)
		equal(t, msg.Role, message.UserMessageRole)
		if msg.CreatedAt.IsZero() {
			t.Fatal("message creation time missing")
		}
		seen[msg.ID] = msg.Text
	}
	equal(t, seen[keep[1]], "second")
	equal(t, seen[keep[2]], "third")
	otherMessages, err := f.db.Messages.GetMessagesByUserID(ctx, other)
	must(t, err)
	equal(t, len(otherMessages), 1)
	equal(t, otherMessages[0].Text, "other user's message")
	_, err = f.db.Messages.AddMessageToMessages(ctx, message.Message{UserID: f.id, Text: "not retained", Role: message.AssistantMessageRole}, 0)
	must(t, err)
	got, err = f.db.Messages.GetMessagesByUserID(ctx, f.id)
	must(t, err)
	equal(t, len(got), 0)
}

func TestMessageTransactionRollback(t *testing.T) {
	for _, tc := range []struct {
		name, setup string
		userID      user.UserID
		limit       int
		errorText   string
	}{
		{name: "insert error", userID: -1, limit: 2, errorText: "foreign key"},
		{name: "retention error", limit: -1, errorText: "deleteMessagesExceedingLimit"},
		{name: "commit error", setup: "ALTER TABLE messages ALTER CONSTRAINT messages_user_id_fkey DEFERRABLE INITIALLY DEFERRED", userID: -1, limit: 2, errorText: "foreign key"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newFixture(t)
			if tc.setup != "" {
				f.exec(t, tc.setup)
			}
			id := tc.userID
			if id == 0 {
				id = f.id
			}
			messageID, err := f.db.Messages.AddMessageToMessages(context.Background(), message.Message{UserID: id, Text: "must roll back", Role: message.UserMessageRole}, tc.limit)
			wantError(t, err, tc.errorText)
			equal(t, messageID, message.MessageID(0))
			equal(t, f.count(t, "messages"), 0)
		})
	}
	t.Run("cancelled begin and select", func(t *testing.T) {
		f := newFixture(t)
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		_, err := f.db.Messages.AddMessageToMessages(ctx, message.Message{UserID: f.id}, 2)
		wantError(t, err, "AddMessageToMessages")
		got, err := f.db.Messages.GetMessagesByUserID(ctx, f.id)
		wantError(t, err, "GetMessagesByUserID")
		if got == nil || len(got) != 0 {
			t.Fatalf("expected non-nil empty slice on failure, got %#v", got)
		}
	})
}

func TestRefreshSessionLifecycle(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	session := refreshsession.RefreshSession{
		UserID: f.id, TokenHash: "hash-1", UserAgent: "backend-test", IP: "127.0.0.1",
		ExpiresAt: time.Now().Add(time.Hour).Truncate(time.Microsecond),
	}
	id, created, err := f.db.RefreshSessions.CreateRefreshSession(ctx, session)
	must(t, err)
	if id <= 0 || created.IsZero() {
		t.Fatalf("missing generated fields: %d, %v", id, created)
	}
	got, err := f.db.RefreshSessions.GetRefreshSessionByTokenHash(ctx, session.TokenHash)
	must(t, err)
	equal(t, got.ID, id)
	equal(t, got.UserID, session.UserID)
	equal(t, got.TokenHash, session.TokenHash)
	equal(t, got.UserAgent, session.UserAgent)
	equal(t, got.IP, session.IP)
	if !got.ExpiresAt.Equal(session.ExpiresAt) || !got.CreatedAt.Equal(created) {
		t.Fatalf("session timestamps differ: %#v", got)
	}
	_, _, err = f.db.RefreshSessions.CreateRefreshSession(ctx, session)
	wantError(t, err, "CreateRefreshSession")
	equal(t, f.count(t, "auth_refresh_sessions"), 1)
	must(t, f.db.RefreshSessions.DeleteRefreshSessionByTokenHash(ctx, session.TokenHash))
	must(t, f.db.RefreshSessions.DeleteRefreshSessionByTokenHash(ctx, session.TokenHash))
	_, err = f.db.RefreshSessions.GetRefreshSessionByTokenHash(ctx, session.TokenHash)
	if !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("deleted session still exists: %v", err)
	}
	for i, hash := range []string{"expired", "active"} {
		session.TokenHash = hash
		if i == 0 {
			session.ExpiresAt = time.Now().Add(-time.Hour)
		} else {
			session.ExpiresAt = time.Now().Add(time.Hour)
		}
		_, _, err = f.db.RefreshSessions.CreateRefreshSession(ctx, session)
		must(t, err)
	}
	must(t, f.db.RefreshSessions.DeleteExpiredRefreshSessions(ctx))
	equal(t, f.count(t, "auth_refresh_sessions"), 1)
	_, err = f.db.RefreshSessions.GetRefreshSessionByTokenHash(ctx, "active")
	must(t, err)
	must(t, f.db.RefreshSessions.DeleteRefreshSessionByUserID(ctx, f.id+1))
	equal(t, f.count(t, "auth_refresh_sessions"), 1)
	must(t, f.db.RefreshSessions.DeleteRefreshSessionByUserID(ctx, f.id))
	equal(t, f.count(t, "auth_refresh_sessions"), 0)
}

func TestRefreshSessionQueryErrors(t *testing.T) {
	f := newFixture(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, _, err := f.db.RefreshSessions.CreateRefreshSession(ctx, refreshsession.RefreshSession{UserID: f.id})
	wantError(t, err, "CreateRefreshSession")
	_, err = f.db.RefreshSessions.GetRefreshSessionByTokenHash(ctx, "hash")
	wantError(t, err, "GetRefreshSessionByTokenHash")
	wantError(t, f.db.RefreshSessions.DeleteRefreshSessionByTokenHash(ctx, "hash"), "DeleteRefreshSessionByTokenHash")
	wantError(t, f.db.RefreshSessions.DeleteRefreshSessionByUserID(ctx, f.id), "DeleteRefreshSessionByUserID")
	wantError(t, f.db.RefreshSessions.DeleteExpiredRefreshSessions(ctx), "DeleteExpiredRefreshSessions")
}
