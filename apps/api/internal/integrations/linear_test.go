package integrations

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestLinearListSelectableResourcesReturnsTeamsAndProjects(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		query, _ := payload["query"].(string)
		if !strings.Contains(query, "teams") {
			t.Fatalf("expected teams query, got %s", query)
		}

		writeLinearJSON(t, w, map[string]any{
			"data": map[string]any{
				"teams": map[string]any{
					"nodes": []map[string]any{
						{
							"id":   "team-1",
							"name": "Dev OS",
							"key":  "DEV",
							"projects": map[string]any{
								"nodes": []map[string]any{
									{"id": "project-1", "name": "Developer OS Integrations MVP"},
								},
							},
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

	resources, err := connector.ListSelectableResources(context.Background(), domain.GatewayContext{}, &domain.ProviderToken{AccessToken: "token"})
	if err != nil {
		t.Fatal(err)
	}

	if len(resources) != 2 {
		t.Fatalf("expected team and project resources, got %d", len(resources))
	}
	if resources[0].Type != "team" || resources[0].ID != "team-1" {
		t.Fatalf("unexpected team resource: %#v", resources[0])
	}
	if resources[1].Type != "project" || resources[1].ID != "project-1" {
		t.Fatalf("unexpected project resource: %#v", resources[1])
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

func TestLinearSyncSelectedFiltersBySelectedProject(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeLinearJSON(t, w, map[string]any{
			"data": map[string]any{
				"issues": map[string]any{
					"nodes": []map[string]any{
						{
							"id":            "issue-1",
							"identifier":    "DEV-42",
							"title":         "Selected project issue",
							"url":           "https://linear.app/dev-os/issue/DEV-42/selected",
							"priority":      2,
							"priorityLabel": "High",
							"createdAt":     "2026-07-29T12:00:00Z",
							"updatedAt":     "2026-07-29T12:30:00Z",
							"completedAt":   nil,
							"canceledAt":    nil,
							"assignee":      map[string]any{"name": "Guilherme"},
							"state":         map[string]any{"name": "In Progress", "type": "started"},
							"team":          map[string]any{"id": "team-1", "name": "Dev-os", "key": "DEV"},
							"project":       map[string]any{"id": "project-1", "name": "Developer OS Integrations MVP"},
							"cycle":         nil,
							"comments":      map[string]any{"nodes": []map[string]any{}},
						},
						{
							"id":            "issue-2",
							"identifier":    "OPS-1",
							"title":         "Unselected project issue",
							"url":           "https://linear.app/dev-os/issue/OPS-1/unselected",
							"priority":      3,
							"priorityLabel": "Medium",
							"createdAt":     "2026-07-29T11:00:00Z",
							"updatedAt":     "2026-07-29T13:00:00Z",
							"completedAt":   nil,
							"canceledAt":    nil,
							"assignee":      nil,
							"state":         map[string]any{"name": "Todo", "type": "unstarted"},
							"team":          map[string]any{"id": "team-2", "name": "Ops", "key": "OPS"},
							"project":       map[string]any{"id": "project-2", "name": "Ops"},
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

	selection := domain.ResourceSelection{
		Service: domain.ServiceLinear,
		Resources: []domain.SelectableResource{
			{ID: "project-1", Type: "project", Name: "Developer OS Integrations MVP", Metadata: map[string]any{"projectId": "project-1"}},
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
		t.Fatalf("expected one selected issue event, got %d", result.EventsCreated)
	}
	if result.Events[0].Title != "DEV-42 Selected project issue" {
		t.Fatalf("unexpected event title %q", result.Events[0].Title)
	}
}

func writeLinearJSON(t *testing.T, w http.ResponseWriter, payload any) {
	t.Helper()
	w.Header().Set("content-type", "application/json")
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		t.Fatal(err)
	}
}
