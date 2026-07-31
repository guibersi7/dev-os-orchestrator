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

func TestJiraSyncReportsNeedsAuthWithoutToken(t *testing.T) {
	connector := &JiraConnector{
		info:    NewJiraConnector().Info(),
		client:  http.DefaultClient,
		baseURL: "https://jira.test",
	}

	result, err := connector.Sync(context.Background(), domain.GatewayContext{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "needs_auth" {
		t.Fatalf("expected needs_auth, got %q", result.Status)
	}
}

func TestJiraSyncReportsMissingSiteConfig(t *testing.T) {
	connector := &JiraConnector{
		info:   NewJiraConnector().Info(),
		client: http.DefaultClient,
	}

	result, err := connector.Sync(context.Background(), domain.GatewayContext{}, &domain.ProviderToken{AccessToken: "token"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "needs_site_config" {
		t.Fatalf("expected needs_site_config, got %q", result.Status)
	}
}

func TestJiraListSelectableResourcesReturnsProjects(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("expected GET, got %s", r.Method)
		}
		if r.URL.Path != "/rest/api/3/project/search" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}

		writeJiraJSON(t, w, map[string]any{
			"values": []map[string]any{
				{"id": "10000", "key": "ENG", "name": "Engineering"},
				{"id": "10001", "key": "OPS", "name": "Operations"},
			},
		})
	}))
	defer server.Close()

	connector := &JiraConnector{
		info:    NewJiraConnector().Info(),
		client:  server.Client(),
		baseURL: server.URL,
	}

	resources, err := connector.ListSelectableResources(context.Background(), domain.GatewayContext{}, &domain.ProviderToken{AccessToken: "token"})
	if err != nil {
		t.Fatal(err)
	}

	if len(resources) != 2 {
		t.Fatalf("expected 2 project resources, got %d", len(resources))
	}
	if resources[0].ID != "ENG" || resources[0].Type != "project" {
		t.Fatalf("unexpected project resource: %#v", resources[0])
	}
}

func TestJiraSyncFetchesAndNormalizesTickets(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("expected POST, got %s", r.Method)
		}
		if r.URL.Path != "/rest/api/3/search/jql" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if r.Header.Get("authorization") != "Bearer token" {
			t.Fatalf("expected bearer token, got %q", r.Header.Get("authorization"))
		}

		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if payload["jql"] == "" {
			t.Fatal("expected jql")
		}

		writeJiraJSON(t, w, map[string]any{
			"issues": []map[string]any{
				{
					"id":   "10001",
					"key":  "ENG-12",
					"self": "https://jira.test/rest/api/3/issue/10001",
					"fields": map[string]any{
						"summary":        "Release ticket is blocked",
						"updated":        "2026-07-29T12:30:00.000+0000",
						"created":        "2026-07-29T12:00:00.000+0000",
						"resolutiondate": nil,
						"labels":         []string{"blocked"},
						"status": map[string]any{
							"name":           "Blocked",
							"statusCategory": map[string]any{"key": "indeterminate", "name": "In Progress"},
						},
						"project":   map[string]any{"key": "ENG", "name": "Engineering"},
						"priority":  map[string]any{"name": "High"},
						"issuetype": map[string]any{"name": "Task"},
						"assignee":  map[string]any{"displayName": "Guilherme"},
						"comment": map[string]any{
							"total": 1,
							"comments": []map[string]any{
								{
									"id":      "comment-1",
									"body":    "Blocked by https://github.com/owner/repo/pull/42",
									"updated": "2026-07-29T12:10:00.000+0000",
									"author":  map[string]any{"displayName": "Guilherme"},
								},
							},
						},
					},
				},
				{
					"id":   "10002",
					"key":  "ENG-13",
					"self": "https://jira.test/rest/api/3/issue/10002",
					"fields": map[string]any{
						"summary":        "Done ticket",
						"updated":        "2026-07-29T13:00:00.000+0000",
						"created":        "2026-07-29T11:00:00.000+0000",
						"resolutiondate": "2026-07-29T13:05:00.000+0000",
						"labels":         []string{},
						"status": map[string]any{
							"name":           "Done",
							"statusCategory": map[string]any{"key": "done", "name": "Done"},
						},
						"project":   map[string]any{"key": "ENG", "name": "Engineering"},
						"priority":  map[string]any{"name": "Medium"},
						"issuetype": map[string]any{"name": "Story"},
						"assignee":  nil,
						"comment":   map[string]any{"total": 0, "comments": []map[string]any{}},
					},
				},
			},
		})
	}))
	defer server.Close()

	connector := &JiraConnector{
		info:        NewJiraConnector().Info(),
		client:      server.Client(),
		baseURL:     server.URL,
		projectKeys: []string{"ENG"},
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
	for _, eventType := range []string{"jira.ticket.blocked", "jira.ticket.completed"} {
		if !eventTypes[eventType] {
			t.Fatalf("expected event type %q in %#v", eventType, eventTypes)
		}
	}
}

func TestJiraSyncSelectedUsesSelectedProjectJQL(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		jql, _ := payload["jql"].(string)
		if !strings.Contains(jql, `project in ("ENG")`) {
			t.Fatalf("expected selected project JQL, got %s", jql)
		}
		if strings.Contains(jql, "OPS") {
			t.Fatalf("unexpected unselected project in JQL: %s", jql)
		}

		writeJiraJSON(t, w, map[string]any{
			"issues": []map[string]any{
				{
					"id":   "10001",
					"key":  "ENG-12",
					"self": "https://jira.test/rest/api/3/issue/10001",
					"fields": map[string]any{
						"summary":        "Selected release ticket",
						"updated":        "2026-07-29T12:30:00.000+0000",
						"created":        "2026-07-29T12:00:00.000+0000",
						"resolutiondate": nil,
						"labels":         []string{"blocked"},
						"status": map[string]any{
							"name":           "Blocked",
							"statusCategory": map[string]any{"key": "indeterminate", "name": "In Progress"},
						},
						"project":   map[string]any{"id": "10000", "key": "ENG", "name": "Engineering"},
						"priority":  map[string]any{"name": "High"},
						"issuetype": map[string]any{"name": "Task"},
						"assignee":  nil,
						"comment":   map[string]any{"total": 0, "comments": []map[string]any{}},
					},
				},
			},
		})
	}))
	defer server.Close()

	connector := &JiraConnector{
		info:        NewJiraConnector().Info(),
		client:      server.Client(),
		baseURL:     server.URL,
		projectKeys: []string{"OPS"},
	}

	selection := domain.ResourceSelection{
		Service: domain.ServiceJira,
		Resources: []domain.SelectableResource{
			{ID: "ENG", Type: "project", Name: "Engineering", Metadata: map[string]any{"projectKey": "ENG"}},
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
		t.Fatalf("expected one selected Jira event, got %d", result.EventsCreated)
	}
}

func writeJiraJSON(t *testing.T, w http.ResponseWriter, payload any) {
	t.Helper()
	w.Header().Set("content-type", "application/json")
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		t.Fatal(err)
	}
}
