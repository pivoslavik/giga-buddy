package tests

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/pivoslavik/giga-buddy/backend/internal/db"
	documenthandler "github.com/pivoslavik/giga-buddy/backend/internal/server/document"
	"github.com/pivoslavik/giga-buddy/backend/internal/server/middleware"
	"github.com/pivoslavik/giga-buddy/backend/internal/tokens/access"
	"github.com/pivoslavik/giga-buddy/backend/internal/utils/apperrors"
	documentmodel "github.com/pivoslavik/giga-buddy/backend/internal/utils/models/document"
)

var documentCategories = []string{
	"start_work", "development", "work_processes", "team_values", "contacts", "ai_answers", "company",
}

func TestDocumentCategories(t *testing.T) {
	for _, category := range documentCategories {
		t.Run(category, func(t *testing.T) {
			must(t, documentmodel.CheckDocumentCategory(category))
		})
	}
	for _, category := range []string{"", "unknown", "Company", " company", "company ", "company,contacts"} {
		t.Run("invalid "+category, func(t *testing.T) {
			wantError(t, documentmodel.CheckDocumentCategory(category), "invalid document category")
		})
	}
}

func seedDocuments(t *testing.T, f *fixture) []documentmodel.Document {
	t.Helper()
	documents := make([]documentmodel.Document, 0, len(documentCategories))
	for i, category := range documentCategories {
		doc := documentmodel.Document{
			Title: fmt.Sprintf("Документ %d", i), Description: fmt.Sprintf("Описание %d", i),
			Text: "# Заголовок\n\n**Markdown** и `код`", Category: documentmodel.DocumentCategory(category),
		}
		must(t, f.pool.QueryRow(context.Background(), `INSERT INTO documents
			(title, description, text, category, google_document_id, source_modified_at)
			VALUES ($1, $2, $3, $4, $5, now()) RETURNING id`,
			doc.Title, doc.Description, doc.Text, doc.Category, fmt.Sprintf("drive-%d", i)).Scan(&doc.ID))
		documents = append(documents, doc)
	}
	return documents
}

func shortDocument(doc documentmodel.Document) documentmodel.ShortDocument {
	return documentmodel.ShortDocument{ID: doc.ID, Title: doc.Title, Description: doc.Description, Category: doc.Category}
}

func TestDocumentQueries(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	empty, err := f.db.Documents.GetShortDocumentsWithAmountByCategory(ctx, 10, documentCategories)
	must(t, err)
	if empty == nil || len(empty) != 0 {
		t.Fatalf("expected non-nil empty documents, got %#v", empty)
	}
	documents := seedDocuments(t, f)
	// Also verify that the application database constructor wires up Documents.
	database, err := db.NewDatabaseConnection(f.url)
	must(t, err)
	for _, doc := range documents {
		got, err := database.Documents.GetDocumentByID(ctx, doc.ID)
		must(t, err)
		equal(t, got, doc)
	}
	for _, tc := range []struct {
		name       string
		amount     int
		categories []string
		count      int
	}{
		{"all categories", 100, documentCategories, 7},
		{"single category", 100, []string{"company"}, 1},
		{"multiple categories", 100, []string{"company", "contacts"}, 2},
		{"limit", 2, documentCategories, 2},
		{"zero limit", 0, documentCategories, 0},
		{"no categories", 100, nil, 0},
		{"empty categories", 100, []string{}, 0},
		{"duplicate category", 100, []string{"company", "company"}, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := f.db.Documents.GetShortDocumentsWithAmountByCategory(ctx, tc.amount, tc.categories)
			must(t, err)
			equal(t, len(got), tc.count)
			seen := make(map[documentmodel.DocumentID]bool)
			for _, doc := range got {
				if seen[doc.ID] {
					t.Fatalf("duplicate document: %d", doc.ID)
				}
				seen[doc.ID] = true
				allowed := false
				for _, category := range tc.categories {
					allowed = allowed || string(doc.Category) == category
				}
				if !allowed {
					t.Fatalf("unrequested category: %q", doc.Category)
				}
				var expected documentmodel.ShortDocument
				for _, seeded := range documents {
					if seeded.ID == doc.ID {
						expected = shortDocument(seeded)
					}
				}
				equal(t, doc, expected)
			}
		})
	}
	_, err = f.db.Documents.GetDocumentByID(ctx, -1)
	if !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("expected ErrNoRows, got %v", err)
	}
	_, err = f.db.Documents.GetShortDocumentsWithAmountByCategory(ctx, -1, documentCategories)
	wantError(t, err, "GetShortDocumentsWithAmountByCategory")
	_, err = f.db.Documents.GetShortDocumentsWithAmountByCategory(ctx, 10, []string{"invalid"})
	wantError(t, err, "GetShortDocumentsWithAmountByCategory")
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	_, err = f.db.Documents.GetShortDocumentsWithAmountByCategory(cancelled, 10, documentCategories)
	wantError(t, err, "GetShortDocumentsWithAmountByCategory")
	_, err = f.db.Documents.GetDocumentByID(cancelled, documents[0].ID)
	wantError(t, err, "GetDocumentByID")
}

func documentRouter(f *fixture) *gin.Engine {
	router := gin.New()
	api := router.Group("/api", middleware.CheckAccessToken(secret))
	handler := documenthandler.NewHandler(f.db)
	handler.RegisterRoutes(api)
	return router
}

func documentCookie(t *testing.T, f *fixture) *http.Cookie {
	t.Helper()
	token, err := access.CreateAccessToken(f.id, secret)
	must(t, err)
	return &http.Cookie{Name: "access_token", Value: token}
}

func TestDocumentsRequireAuthentication(t *testing.T) {
	f := newFixture(t)
	router := documentRouter(f)
	for _, path := range []string{"/api/documents?amount=10&category=company", "/api/documents/1"} {
		for _, cookies := range [][]*http.Cookie{nil, {{Name: "access_token", Value: "invalid"}}} {
			rec := request(router, http.MethodGet, path, "", cookies...)
			equal(t, rec.Code, http.StatusUnauthorized)
			equal(t, decode[map[string]string](t, rec)["error"], apperrors.ErrInvalidAccessToken)
		}
	}
}

func TestDocumentsValidation(t *testing.T) {
	f := newFixture(t)
	router, cookie := documentRouter(f), documentCookie(t, f)
	for _, tc := range []struct {
		name, path, message string
	}{
		{"missing amount", "/api/documents?category=company", apperrors.ErrAmountRequired.Error()},
		{"empty amount", "/api/documents?amount=&category=company", apperrors.ErrInvalidAmountType.Error()},
		{"invalid amount", "/api/documents?amount=abc&category=company", apperrors.ErrInvalidAmountType.Error()},
		{"negative amount", "/api/documents?amount=-1&category=company", apperrors.ErrInvalidAmountType.Error()},
		{"fractional amount", "/api/documents?amount=1.5&category=company", apperrors.ErrInvalidAmountType.Error()},
		{"overflowing amount", "/api/documents?amount=999999999999999999999&category=company", apperrors.ErrInvalidAmountType.Error()},
		{"missing categories", "/api/documents?amount=10", apperrors.ErrCategoriesRequired.Error()},
		{"invalid category", "/api/documents?amount=10&category=unknown", "invalid category: unknown"},
		{"empty category", "/api/documents?amount=10&category=", "invalid category: "},
		{"invalid second category", "/api/documents?amount=10&category=company&category=unknown", "invalid category: unknown"},
		{"invalid ID", "/api/documents/abc", apperrors.ErrInvalidID.Error()},
		{"overflowing ID", "/api/documents/999999999999999999999", apperrors.ErrInvalidID.Error()},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := request(router, http.MethodGet, tc.path, "", cookie)
			equal(t, rec.Code, http.StatusBadRequest)
			equal(t, decode[map[string]string](t, rec)["error"], tc.message)
		})
	}
}

func TestDocumentsHTTP(t *testing.T) {
	f := newFixture(t)
	router, cookie := documentRouter(f), documentCookie(t, f)
	listPath := "/api/documents?amount=100&category=company"
	rec := request(router, http.MethodGet, listPath, "", cookie)
	equal(t, rec.Code, http.StatusOK)
	equal(t, rec.Body.String(), "[]")
	documents := seedDocuments(t, f)
	for _, tc := range []struct {
		name, query string
		count       int
	}{
		{"single category", "amount=100&category=company", 1},
		{"multiple categories", "amount=100&category=company&category=contacts", 2},
		{"limit", "amount=1&category=company&category=contacts", 1},
		{"zero limit", "amount=0&category=company", 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := request(router, http.MethodGet, "/api/documents?"+tc.query, "", cookie)
			equal(t, rec.Code, http.StatusOK)
			got := decode[[]map[string]any](t, rec)
			if got == nil {
				t.Fatal("expected JSON array, got null")
			}
			equal(t, len(got), tc.count)
			categories, err := url.ParseQuery(tc.query)
			must(t, err)
			for _, doc := range got {
				equal(t, len(doc), 4)
				id, ok := doc["id"].(float64)
				if !ok {
					t.Fatalf("invalid document ID: %#v", doc["id"])
				}
				var expected documentmodel.ShortDocument
				for _, seeded := range documents {
					if float64(seeded.ID) == id {
						expected = shortDocument(seeded)
					}
				}
				equal(t, doc["title"], any(expected.Title))
				equal(t, doc["description"], any(expected.Description))
				equal(t, doc["category"], any(string(expected.Category)))
				allowed := false
				for _, category := range categories["category"] {
					allowed = allowed || category == string(expected.Category)
				}
				if !allowed {
					t.Fatalf("unrequested category: %q", expected.Category)
				}
			}
		})
	}
	for _, doc := range documents {
		rec := request(router, http.MethodGet, fmt.Sprintf("/api/documents/%d", doc.ID), "", cookie)
		equal(t, rec.Code, http.StatusOK)
		got := decode[map[string]string](t, rec)
		equal(t, len(got), 3)
		equal(t, got["title"], doc.Title)
		equal(t, got["text"], doc.Text)
		equal(t, got["category"], string(doc.Category))
	}
	for _, id := range []string{"0", "-1", "9223372036854775807"} {
		rec := request(router, http.MethodGet, "/api/documents/"+id, "", cookie)
		equal(t, rec.Code, http.StatusNotFound)
		equal(t, rec.Body.Len(), 0)
	}
	// A removed document must disappear from both API responses.
	deleted := documents[len(documents)-1]
	f.exec(t, "DELETE FROM documents WHERE id=$1", deleted.ID)
	rec = request(router, http.MethodGet, fmt.Sprintf("/api/documents/%d", deleted.ID), "", cookie)
	equal(t, rec.Code, http.StatusNotFound)
	rec = request(router, http.MethodGet, listPath, "", cookie)
	equal(t, rec.Code, http.StatusOK)
	equal(t, rec.Body.String(), "[]")
}

func TestDocumentsDatabaseFailure(t *testing.T) {
	f := newFixture(t)
	router, cookie := documentRouter(f), documentCookie(t, f)
	f.exec(t, "DROP TABLE documents")
	for _, path := range []string{"/api/documents?amount=10&category=company", "/api/documents/1"} {
		rec := request(router, http.MethodGet, path, "", cookie)
		equal(t, rec.Code, http.StatusInternalServerError)
		equal(t, rec.Body.Len(), 0)
	}
}
