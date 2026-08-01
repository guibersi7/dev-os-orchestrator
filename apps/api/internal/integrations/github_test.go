package integrations

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"

	"github.com/developer-os/api/internal/domain"
)

func TestGitHubSyncReportsNeedsAuthWithoutToken(t *testing.T) {
	connector := &GitHubConnector{
		info:         NewGitHubConnector().Info(),
		client:       http.DefaultClient,
		apiBaseURL:   "https://api.github.test",
		repositories: []string{"owner/repo"},
	}

	result, err := connector.Sync(context.Background(), domain.GatewayContext{}, nil)
	if err != nil {
		t.Fatal(err)
	}

	if result.Status != "needs_auth" {
		t.Fatalf("expected needs_auth, got %q", result.Status)
	}
}

func TestGitHubSyncDiscoversAuthenticatedUserRepositories(t *testing.T) {
	now := time.Date(2026, 7, 29, 12, 0, 0, 0, time.UTC)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/user/installations":
			writeJSON(t, w, map[string]any{
				"total_count": 1,
				"installations": []map[string]any{
					{"id": 42},
				},
			})
		case "/user/installations/42/repositories":
			writeJSON(t, w, map[string]any{
				"total_count": 2,
				"repositories": []map[string]any{
					{"full_name": "owner/repo", "archived": false},
					{"full_name": "owner/archived", "archived": true},
				},
			})
		case "/repos/owner/repo/pulls":
			writeJSON(t, w, []map[string]any{})
		case "/repos/owner/repo/issues":
			writeJSON(t, w, []map[string]any{
				{
					"id":         11,
					"number":     7,
					"state":      "open",
					"title":      "Wire repository selection",
					"html_url":   "https://github.com/owner/repo/issues/7",
					"user":       map[string]any{"login": "guilherme"},
					"updated_at": now.Format(time.RFC3339),
					"assignees":  []map[string]any{{"login": "guilherme"}},
				},
			})
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	connector := &GitHubConnector{
		info:       NewGitHubConnector().Info(),
		client:     server.Client(),
		apiBaseURL: server.URL,
		maxPages:   1,
	}

	result, err := connector.Sync(context.Background(), domain.GatewayContext{}, &domain.ProviderToken{AccessToken: "token"})
	if err != nil {
		t.Fatal(err)
	}

	if result.Status != "connected" {
		t.Fatalf("expected connected, got %q", result.Status)
	}
	if result.EventsCreated != 1 {
		t.Fatalf("expected 1 event from discovered repo, got %d", result.EventsCreated)
	}
}

func TestGitHubSyncFetchesAndNormalizesRepositoryEvents(t *testing.T) {
	now := time.Date(2026, 7, 29, 12, 0, 0, 0, time.UTC)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("authorization") != "Bearer token" {
			t.Fatalf("expected bearer token, got %q", r.Header.Get("authorization"))
		}

		switch r.URL.Path {
		case "/repos/owner/repo/pulls":
			writeJSON(t, w, []map[string]any{
				{
					"id":                  10,
					"number":              42,
					"state":               "open",
					"title":               "Add gateway auth",
					"html_url":            "https://github.com/owner/repo/pull/42",
					"user":                map[string]any{"login": "guilherme"},
					"created_at":          now.Add(-24 * time.Hour).Format(time.RFC3339),
					"updated_at":          now.Format(time.RFC3339),
					"requested_reviewers": []map[string]any{{"login": "reviewer"}},
					"head":                map[string]any{"sha": "abc123"},
				},
			})
		case "/repos/owner/repo/pulls/42/reviews":
			writeJSON(t, w, []map[string]any{
				{
					"id":           50,
					"state":        "COMMENTED",
					"user":         map[string]any{"login": "reviewer"},
					"submitted_at": now.Add(-20 * time.Hour).Format(time.RFC3339),
				},
			})
		case "/repos/owner/repo/pulls/42/comments":
			writeJSON(t, w, []map[string]any{
				{
					"id":         51,
					"user":       map[string]any{"login": "reviewer"},
					"created_at": now.Add(-19 * time.Hour).Format(time.RFC3339),
				},
			})
		case "/repos/owner/repo/commits/abc123/check-runs":
			writeJSON(t, w, map[string]any{
				"check_runs": []map[string]any{
					{
						"id":           99,
						"name":         "test",
						"html_url":     "https://github.com/owner/repo/actions/runs/99",
						"status":       "completed",
						"conclusion":   "failure",
						"completed_at": now.Add(5 * time.Minute).Format(time.RFC3339),
					},
				},
			})
		case "/repos/owner/repo/issues":
			writeJSON(t, w, []map[string]any{
				{
					"id":         11,
					"number":     7,
					"state":      "open",
					"title":      "Wire repository selection",
					"html_url":   "https://github.com/owner/repo/issues/7",
					"user":       map[string]any{"login": "guilherme"},
					"updated_at": now.Add(10 * time.Minute).Format(time.RFC3339),
					"assignees":  []map[string]any{{"login": "guilherme"}},
				},
			})
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	connector := &GitHubConnector{
		info:         NewGitHubConnector().Info(),
		client:       server.Client(),
		apiBaseURL:   server.URL,
		repositories: []string{"owner/repo"},
		maxPages:     1,
	}

	result, err := connector.Sync(context.Background(), domain.GatewayContext{}, &domain.ProviderToken{AccessToken: "token"})
	if err != nil {
		t.Fatal(err)
	}

	if result.Status != "connected" {
		t.Fatalf("expected connected, got %q", result.Status)
	}

	if result.EventsCreated != 3 {
		t.Fatalf("expected 3 events, got %d", result.EventsCreated)
	}

	eventTypes := map[string]bool{}
	for _, event := range result.Events {
		eventTypes[event.Type] = true
	}

	for _, eventType := range []string{"review.requested", "check.failed", "issue.assigned"} {
		if !eventTypes[eventType] {
			t.Fatalf("expected event type %q in %#v", eventType, eventTypes)
		}
	}

	prEvent := result.Events[0]
	metrics, ok := prEvent.Raw["metrics"].(map[string]any)
	if !ok {
		t.Fatalf("expected PR metrics in raw payload, got %#v", prEvent.Raw)
	}
	if metrics["reviewCount"] != 1 || metrics["reviewCommentCount"] != 1 || metrics["reviewerCount"] != 1 {
		t.Fatalf("expected review metrics, got %#v", metrics)
	}

	if result.NextCursor == nil {
		t.Fatal("expected next cursor")
	}
}

func TestGitHubFetchRepositoriesFlattensInstallations(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/user/installations":
			writeJSON(t, w, map[string]any{
				"total_count": 2,
				"installations": []map[string]any{
					{"id": 1},
					{"id": 2},
				},
			})
		case "/user/installations/1/repositories":
			writeJSON(t, w, map[string]any{
				"total_count": 2,
				"repositories": []map[string]any{
					{"full_name": "acme/api", "archived": false},
					{"full_name": "acme/legacy", "archived": true},
				},
			})
		case "/user/installations/2/repositories":
			writeJSON(t, w, map[string]any{
				"total_count": 2,
				"repositories": []map[string]any{
					{"full_name": "acme/api", "archived": false},
					{"full_name": "personal/site", "archived": false},
				},
			})
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	connector := &GitHubConnector{
		info:       NewGitHubConnector().Info(),
		client:     server.Client(),
		apiBaseURL: server.URL,
		maxPages:   1,
	}

	repositories, err := connector.fetchRepositories(context.Background(), "token")
	if err != nil {
		t.Fatal(err)
	}

	want := []string{"acme/api", "personal/site"}
	if !reflect.DeepEqual(repositories, want) {
		t.Fatalf("expected %v, got %v", want, repositories)
	}
}

func writeJSON(t *testing.T, w http.ResponseWriter, payload any) {
	t.Helper()
	w.Header().Set("content-type", "application/json")
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		t.Fatal(err)
	}
}
