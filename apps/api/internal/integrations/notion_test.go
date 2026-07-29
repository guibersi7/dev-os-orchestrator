package integrations

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/developer-os/api/internal/domain"
)

func TestNotionSyncReportsNeedsAuthWithoutToken(t *testing.T) {
	connector := &NotionConnector{
		info:          NewNotionConnector().Info(),
		client:        http.DefaultClient,
		apiBaseURL:    "https://notion.test/v1",
		notionVersion: "2026-03-11",
	}

	result, err := connector.Sync(context.Background(), domain.GatewayContext{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "needs_auth" {
		t.Fatalf("expected needs_auth, got %q", result.Status)
	}
}

func TestNotionSyncFetchesPagesAndPersistsPrivateDocumentChunks(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("authorization") != "Bearer token" {
			t.Fatalf("expected bearer token, got %q", r.Header.Get("authorization"))
		}
		if r.Header.Get("notion-version") != "2026-03-11" {
			t.Fatalf("expected notion version header, got %q", r.Header.Get("notion-version"))
		}

		switch r.URL.Path {
		case "/search":
			writeNotionJSON(t, w, map[string]any{
				"results": []map[string]any{
					{
						"id":               "page-1",
						"url":              "https://notion.so/page-1",
						"created_time":     "2026-07-29T12:00:00Z",
						"last_edited_time": "2026-07-29T12:30:00Z",
						"last_edited_by":   map[string]any{"id": "user-1"},
						"properties": map[string]any{
							"Name": map[string]any{
								"type": "title",
								"title": []map[string]any{
									{"plain_text": "Auth Architecture Decision"},
								},
							},
						},
					},
				},
			})
		case "/blocks/page-1/children":
			writeNotionJSON(t, w, map[string]any{
				"results": []map[string]any{
					{
						"id":               "block-1",
						"type":             "paragraph",
						"last_edited_time": "2026-07-29T12:20:00Z",
						"paragraph": map[string]any{
							"rich_text": []map[string]any{
								{"plain_text": "Decision: keep provider tokens server-side and reference DEV-20."},
							},
						},
					},
					{
						"id":               "block-2",
						"type":             "heading_2",
						"last_edited_time": "2026-07-29T12:21:00Z",
						"heading_2": map[string]any{
							"rich_text": []map[string]any{
								{"plain_text": "Architecture"},
							},
						},
					},
				},
			})
		case "/comments":
			if r.URL.Query().Get("block_id") != "page-1" {
				t.Fatalf("unexpected block id %s", r.URL.Query().Get("block_id"))
			}
			writeNotionJSON(t, w, map[string]any{
				"results": []map[string]any{
					{
						"id":           "comment-1",
						"created_time": "2026-07-29T12:25:00Z",
						"rich_text": []map[string]any{
							{"plain_text": "Agreed in https://github.com/owner/repo/pull/42"},
						},
						"created_by": map[string]any{"id": "user-2"},
					},
				},
			})
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	connector := &NotionConnector{
		info:          NewNotionConnector().Info(),
		client:        server.Client(),
		apiBaseURL:    server.URL,
		notionVersion: "2026-03-11",
	}

	result, err := connector.Sync(context.Background(), domain.GatewayContext{}, &domain.ProviderToken{AccessToken: "token"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "connected" {
		t.Fatalf("expected connected, got %q", result.Status)
	}
	if result.EventsCreated != 1 {
		t.Fatalf("expected 1 event, got %d", result.EventsCreated)
	}
	if len(result.DocumentChunks) != 1 {
		t.Fatalf("expected 1 document chunk, got %d", len(result.DocumentChunks))
	}
	if result.Events[0].Type != "notion.decision.logged" {
		t.Fatalf("expected decision event, got %q", result.Events[0].Type)
	}
	if _, ok := result.Events[0].Raw["documentChunk"]; ok {
		t.Fatal("event raw payload exposed private document chunk content")
	}
	if result.DocumentChunks[0].Content == "" {
		t.Fatal("expected private document chunk content")
	}
}

func writeNotionJSON(t *testing.T, w http.ResponseWriter, payload any) {
	t.Helper()
	w.Header().Set("content-type", "application/json")
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		t.Fatal(err)
	}
}
