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

func TestNotionListSelectableResourcesReturnsWorkspaceObjects(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/search" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		writeNotionJSON(t, w, map[string]any{
			"results": []map[string]any{
				{
					"object":           "page",
					"id":               "page-1",
					"url":              "https://notion.so/page-1",
					"created_time":     "2026-07-29T12:00:00Z",
					"last_edited_time": "2026-07-29T12:30:00Z",
					"properties": map[string]any{
						"Name": map[string]any{
							"type":  "title",
							"title": []map[string]any{{"plain_text": "Architecture Spec"}},
						},
					},
				},
			},
		})
	}))
	defer server.Close()

	connector := &NotionConnector{
		info:          NewNotionConnector().Info(),
		client:        server.Client(),
		apiBaseURL:    server.URL,
		notionVersion: "2026-03-11",
	}

	resources, err := connector.ListSelectableResources(context.Background(), domain.GatewayContext{}, &domain.ProviderToken{AccessToken: "token"})
	if err != nil {
		t.Fatal(err)
	}
	if len(resources) != 1 {
		t.Fatalf("expected one resource, got %d", len(resources))
	}
	if resources[0].ID != "page-1" || resources[0].Type != "page" || resources[0].Name != "Architecture Spec" {
		t.Fatalf("unexpected Notion resource: %#v", resources[0])
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

func TestNotionSyncSelectedUsesOnlySelectedPages(t *testing.T) {
	fetchedBlocks := map[string]bool{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/search":
			writeNotionJSON(t, w, map[string]any{
				"results": []map[string]any{
					{
						"object":           "page",
						"id":               "page-1",
						"url":              "https://notion.so/page-1",
						"created_time":     "2026-07-29T12:00:00Z",
						"last_edited_time": "2026-07-29T12:30:00Z",
						"properties": map[string]any{
							"Name": map[string]any{
								"type":  "title",
								"title": []map[string]any{{"plain_text": "Selected ADR"}},
							},
						},
					},
					{
						"object":           "page",
						"id":               "page-2",
						"url":              "https://notion.so/page-2",
						"created_time":     "2026-07-29T12:00:00Z",
						"last_edited_time": "2026-07-29T12:30:00Z",
						"properties": map[string]any{
							"Name": map[string]any{
								"type":  "title",
								"title": []map[string]any{{"plain_text": "Unselected"}},
							},
						},
					},
				},
			})
		case "/blocks/page-1/children":
			fetchedBlocks["page-1"] = true
			writeNotionJSON(t, w, map[string]any{
				"results": []map[string]any{
					{
						"id":               "block-1",
						"type":             "paragraph",
						"last_edited_time": "2026-07-29T12:20:00Z",
						"paragraph": map[string]any{
							"rich_text": []map[string]any{{"plain_text": "Decision: selected Notion page only."}},
						},
					},
				},
			})
		case "/blocks/page-2/children":
			fetchedBlocks["page-2"] = true
			t.Fatal("unselected page blocks should not be fetched")
		case "/comments":
			writeNotionJSON(t, w, map[string]any{"results": []map[string]any{}})
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

	selection := domain.ResourceSelection{
		Service: domain.ServiceNotion,
		Resources: []domain.SelectableResource{
			{ID: "page-1", Type: "page", Name: "Selected ADR", Metadata: map[string]any{"pageId": "page-1"}},
		},
	}
	result, err := connector.SyncSelected(context.Background(), domain.GatewayContext{}, &domain.ProviderToken{AccessToken: "token"}, selection)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "connected" {
		t.Fatalf("expected connected, got %q", result.Status)
	}
	if result.EventsCreated != 1 {
		t.Fatalf("expected one selected page event, got %d", result.EventsCreated)
	}
	if !fetchedBlocks["page-1"] || fetchedBlocks["page-2"] {
		t.Fatalf("unexpected fetched block set: %#v", fetchedBlocks)
	}
}

func writeNotionJSON(t *testing.T, w http.ResponseWriter, payload any) {
	t.Helper()
	w.Header().Set("content-type", "application/json")
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		t.Fatal(err)
	}
}
