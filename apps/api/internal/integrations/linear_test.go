package integrations

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/developer-os/api/internal/domain"
)

func TestLinearSyncReportsNeedsAuthWithoutToken(t *testing.T) {
	connector := &LinearConnector{
		info:       NewLinearConnector().Info(),
		client:     http.DefaultClient,
		apiBaseURL: "https://linear.test/graphql",
	}

	result, err := connector.Sync(context.Background(), domain.GatewayContext{}, nil)
	if err != nil {
		t.Fatal(err)
	}

	if result.Status != "needs_auth" {
		t.Fatalf("expected needs_auth, got %q", result.Status)
	}
}

func TestLinearSyncFetchesAndNormalizesIssues(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("expected POST, got %s", r.Method)
		}
		if r.Header.Get("authorization") != "Bearer token" {
			t.Fatalf("expected bearer token, got %q", r.Header.Get("authorization"))
		}

		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if payload["query"] == "" {
			t.Fatal("expected graphql query")
		}

		writeLinearJSON(t, w, map[string]any{
			"data": map[string]any{
				"issues": map[string]any{
					"nodes": []map[string]any{
						{
							"id":            "issue-1",
							"identifier":    "DEV-11",
							"title":         "Linear integration",
							"url":           "https://linear.app/dev-os/issue/DEV-11/linear-integration",
							"priority":      2,
							"priorityLabel": "High",
							"createdAt":     "2026-07-29T12:00:00Z",
							"updatedAt":     "2026-07-29T12:30:00Z",
							"completedAt":   nil,
							"canceledAt":    nil,
							"assignee":      map[string]any{"name": "Guilherme"},
							"state":         map[string]any{"name": "In Progress", "type": "started"},
							"team":          map[string]any{"name": "Dev-os", "key": "DEV"},
							"project":       map[string]any{"name": "Developer OS Integrations MVP"},
							"cycle":         map[string]any{"name": "MVP", "number": 1},
							"comments": map[string]any{
								"nodes": []map[string]any{
									{
										"id":        "comment-1",
										"body":      "Blocked by https://github.com/owner/repo/pull/42",
										"createdAt": "2026-07-29T12:10:00Z",
										"user":      map[string]any{"name": "Guilherme"},
									},
								},
							},
						},
						{
							"id":            "issue-2",
							"identifier":    "DEV-12",
							"title":         "Done issue",
							"url":           "https://linear.app/dev-os/issue/DEV-12/done-issue",
							"priority":      3,
							"priorityLabel": "Medium",
							"createdAt":     "2026-07-29T11:00:00Z",
							"updatedAt":     "2026-07-29T13:00:00Z",
							"completedAt":   "2026-07-29T13:00:00Z",
							"canceledAt":    nil,
							"assignee":      nil,
							"state":         map[string]any{"name": "Done", "type": "completed"},
							"team":          map[string]any{"name": "Dev-os", "key": "DEV"},
							"project":       nil,
							"cycle":         nil,
							"comments":      map[string]any{"nodes": []map[string]any{}},
						},
					},
				},
			},
		})
	}))
	defer server.Close()

	connector := &LinearConnector{
		info:       NewLinearConnector().Info(),
		client:     server.Client(),
		apiBaseURL: server.URL,
	}

	result, err := connector.Sync(context.Background(), domain.GatewayContext{}, &domain.ProviderToken{AccessToken: "token"})
	if err != nil {
		t.Fatal(err)
	}

	if result.Status != "connected" {
		t.Fatalf("expected connected, got %q", result.Status)
	}
	if result.EventsCreated != 2 {
		t.Fatalf("expected 2 events, got %d", result.EventsCreated)
	}

	eventTypes := map[string]bool{}
	for _, event := range result.Events {
		eventTypes[event.Type] = true
	}
	for _, eventType := range []string{"linear.issue.blocked", "linear.issue.completed"} {
		if !eventTypes[eventType] {
			t.Fatalf("expected event type %q in %#v", eventType, eventTypes)
		}
	}
}

func writeLinearJSON(t *testing.T, w http.ResponseWriter, payload any) {
	t.Helper()
	w.Header().Set("content-type", "application/json")
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		t.Fatal(err)
	}
}
