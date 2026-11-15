package tests

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/pivoslavik/giga-buddy/backend/internal/server/chat"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models/message"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/models/user"
)

func chatRouter(f *fixture, mlURL string, identity any, limit int) *gin.Engine {
	router := gin.New()
	api := router.Group("/api")
	api.Use(func(c *gin.Context) {
		if identity != nil {
			c.Set("userID", identity)
		}
	})
	handler := chat.NewHandler(f.db, limit, mlURL)
	handler.RegisterRoutes(api)
	return router
}

func TestGetChat(t *testing.T) {
	f := newFixture(t)
	router := chatRouter(f, "", f.id, 10)
	rec := request(router, http.MethodGet, "/api/chat", "")
	equal(t, rec.Code, http.StatusOK)
	equal(t, strings.TrimSpace(rec.Body.String()), `{"messages":[]}`)
	for _, msg := range []message.Message{
		{UserID: f.id, Text: "hello", Role: message.UserMessageRole},
		{UserID: f.id, Text: "answer", Role: message.AssistantMessageRole},
	} {
		_, err := f.db.Messages.AddMessageToMessages(context.Background(), msg, 10)
		must(t, err)
	}
	rec = request(router, http.MethodGet, "/api/chat", "")
	equal(t, rec.Code, http.StatusOK)
	got := decode[struct {
		Messages []message.Message `json:"messages"`
	}](t, rec)
	equal(t, len(got.Messages), 2)
	texts := map[message.MessageRole]string{}
	for _, msg := range got.Messages {
		equal(t, msg.UserID, f.id)
		if msg.ID <= 0 || msg.CreatedAt.IsZero() {
			t.Fatalf("missing message metadata: %#v", msg)
		}
		texts[msg.Role] = msg.Text
	}
	equal(t, texts[message.UserMessageRole], "hello")
	equal(t, texts[message.AssistantMessageRole], "answer")
	f.exec(t, "DROP TABLE messages")
	rec = request(router, http.MethodGet, "/api/chat", "")
	equal(t, rec.Code, http.StatusInternalServerError)
}

func TestChatIdentityAndRequestErrors(t *testing.T) {
	f := newFixture(t)
	for _, identity := range []any{nil, int64(1)} {
		router := chatRouter(f, "", identity, 10)
		equal(t, request(router, http.MethodGet, "/api/chat", "").Code, http.StatusUnauthorized)
		equal(t, request(router, http.MethodPost, "/api/chat", `{"message":"hi"}`).Code, http.StatusInternalServerError)
	}
	router := chatRouter(f, "", f.id, 10)
	for _, body := range []string{"", "{", `{}`, `{"message":""}`, `{"message":42}`} {
		rec := request(router, http.MethodPost, "/api/chat", body)
		equal(t, rec.Code, http.StatusBadRequest)
		if _, ok := decode[map[string]any](t, rec)["error"]; !ok {
			t.Fatal("missing error response")
		}
	}
	equal(t, f.count(t, "messages"), 0)
	rec := request(chatRouter(f, "", user.UserID(-1), 10), http.MethodPost, "/api/chat", `{"message":"hi"}`)
	equal(t, rec.Code, http.StatusInternalServerError)
	equal(t, f.count(t, "messages"), 0)
}

func TestChatMLStream(t *testing.T) {
	const delta = "event: delta\ndata: {\"chunk\":\"Hello\"}\n\n"
	const done = "event: done\ndata: {\"response\":\"Hello, Alice!\"}\n\n"
	const mlError = "event: error\ndata: {\"detail\":\"model unavailable\"}\n\n"
	const invalidError = "event: error\ndata: {\"detail\":\"Invalid ML response\"}\n\n"
	cases := []struct {
		name, stream, wantBody     string
		upstreamStatus, wantStatus int
		wantAssistant              bool
		failAssistant              bool
		brokenBody                 bool
	}{
		{name: "deltas then done", stream: delta + done, wantBody: delta + done, wantAssistant: true},
		{name: "done only", stream: done, wantBody: done, wantAssistant: true},
		{name: "ML error event", stream: mlError, wantBody: mlError},
		{name: "invalid SSE line", stream: "invalid line\n", wantBody: invalidError},
		{name: "stream ends without done", stream: delta, wantBody: delta},
		{name: "empty stream"},
		{name: "incomplete final event", stream: strings.TrimSuffix(done, "\n\n")},
		{name: "malformed done JSON", stream: "event: done\ndata: not-json\n\n", wantBody: "event: done\ndata: not-json\n\n"},
		{name: "empty model response", stream: "event: done\ndata: {\"response\":\"   \"}\n\n", wantBody: "event: done\ndata: {\"response\":\"   \"}\n\n"},
		{name: "missing model response", stream: "event: done\ndata: {}\n\n", wantBody: "event: done\ndata: {}\n\n"},
		{name: "upstream unavailable", upstreamStatus: 503, wantStatus: 502},
		{name: "oversized SSE line", stream: "data: " + strings.Repeat("x", 1024*1024+1) + "\n"},
		{name: "assistant storage error", stream: done, wantBody: done, failAssistant: true},
		{name: "truncated response body", stream: delta, wantBody: delta, brokenBody: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newFixture(t)
			if tc.failAssistant {
				f.exec(t, `CREATE FUNCTION reject_assistant() RETURNS trigger LANGUAGE plpgsql AS $$
					BEGIN IF NEW.role = 'assistant' THEN RAISE EXCEPTION 'assistant storage unavailable'; END IF; RETURN NEW; END $$;
					CREATE TRIGGER reject_assistant BEFORE INSERT ON messages FOR EACH ROW EXECUTE FUNCTION reject_assistant()`)
			}
			var calls atomic.Int32
			ml := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				if r.Method != http.MethodPost || r.URL.Path != "/analyze" || r.Header.Get("Content-Type") != "application/json" {
					t.Errorf("invalid ML request: %s %s, %s", r.Method, r.URL.Path, r.Header.Get("Content-Type"))
				}
				var payload struct {
					UserID    user.UserID       `json:"user_id"`
					MessageID message.MessageID `json:"message_id"`
					Stream    bool              `json:"stream"`
				}
				if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
					t.Error(err)
				}
				if payload.UserID != f.id || payload.MessageID <= 0 || !payload.Stream {
					t.Errorf("invalid ML payload: %#v", payload)
				}
				var stored string
				err := f.pool.QueryRow(r.Context(), "SELECT text FROM messages WHERE id=$1 AND user_id=$2", payload.MessageID, f.id).Scan(&stored)
				if err != nil || stored != "question" {
					t.Errorf("user message not persisted before ML call: %q, %v", stored, err)
				}
				if tc.brokenBody {
					conn, _, err := w.(http.Hijacker).Hijack()
					if err != nil {
						t.Error(err)
						return
					}
					defer conn.Close()
					fmt.Fprintf(conn, "HTTP/1.1 200 OK\r\nContent-Length: %d\r\n\r\n%s", len(tc.stream)+100, tc.stream)
					return
				}
				status := tc.upstreamStatus
				if status == 0 {
					status = http.StatusOK
				}
				w.WriteHeader(status)
				fmt.Fprint(w, tc.stream)
			}))
			defer ml.Close()
			rec := request(chatRouter(f, ml.URL, f.id, 10), http.MethodPost, "/api/chat", `{"message":"question"}`)
			status := tc.wantStatus
			if status == 0 {
				status = http.StatusOK
			}
			equal(t, rec.Code, status)
			equal(t, calls.Load(), int32(1))
			equal(t, rec.Body.String(), tc.wantBody)
			equal(t, rec.Header().Get("Content-Type"), "text/event-stream")
			equal(t, rec.Header().Get("Cache-Control"), "no-cache")
			equal(t, rec.Header().Get("X-Accel-Buffering"), "no")
			messages, err := f.db.Messages.GetMessagesByUserID(context.Background(), f.id)
			must(t, err)
			wantCount := 1
			if tc.wantAssistant {
				wantCount++
			}
			equal(t, len(messages), wantCount)
			for _, msg := range messages {
				if msg.Role == message.AssistantMessageRole {
					equal(t, msg.Text, "Hello, Alice!")
				}
			}
		})
	}
}

func TestChatMLRequestErrors(t *testing.T) {
	closedServer := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	closedServer.Close()
	for _, mlURL := range []string{"://invalid", closedServer.URL} {
		t.Run(mlURL, func(t *testing.T) {
			f := newFixture(t)
			rec := request(chatRouter(f, mlURL, f.id, 10), http.MethodPost, "/api/chat", `{"message":"question"}`)
			equal(t, rec.Code, http.StatusInternalServerError)
			equal(t, f.count(t, "messages"), 1)
		})
	}
}

type disconnectedWriter struct {
	*httptest.ResponseRecorder
	writes int
}

func (w *disconnectedWriter) Write([]byte) (int, error) {
	w.writes++
	return 0, errors.New("client disconnected")
}

func TestChatClientDisconnect(t *testing.T) {
	for _, tc := range []struct {
		name, stream string
		saved        int
	}{
		{"delta", "event: delta\ndata: x\n\n", 1},
		{"error", "event: error\ndata: failure\n\n", 1},
		{"invalid", "invalid\n", 1},
		{"done", "event: done\ndata: {\"response\":\"answer\"}\n\n", 2},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newFixture(t)
			ml := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { fmt.Fprint(w, tc.stream) }))
			defer ml.Close()
			writer := &disconnectedWriter{ResponseRecorder: httptest.NewRecorder()}
			req := httptest.NewRequest(http.MethodPost, "/api/chat", strings.NewReader(`{"message":"question"}`))
			req.Header.Set("Content-Type", "application/json")
			chatRouter(f, ml.URL, f.id, 10).ServeHTTP(writer, req)
			equal(t, writer.writes, 1)
			equal(t, f.count(t, "messages"), tc.saved)
		})
	}
}
