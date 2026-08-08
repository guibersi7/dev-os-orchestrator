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
		info:       NewJiraConnector().Info(),
		client:     http.DefaultClient,
		baseURL:    "https://jira.test",
		apiBaseURL: "https://api.atlassian.test",
		cloudID:    "cloud-1",
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
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/oauth/token/accessible-resources" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		writeJiraJSON(t, w, []map[string]any{})
	}))
	defer server.Close()

	connector := &JiraConnector{
		info:       NewJiraConnector().Info(),
		client:     server.Client(),
		apiBaseURL: server.URL,
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
		if r.URL.Path != "/ex/jira/cloud-1/rest/api/3/project/search" {
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
		info:       NewJiraConnector().Info(),
		client:     server.Client(),
		baseURL:    "https://jira.test",
		apiBaseURL: server.URL,
		cloudID:    "cloud-1",
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

func TestJiraListSelectableResourcesPaginatesProjects(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.URL.Path != "/ex/jira/cloud-1/rest/api/3/project/search" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}

		switch r.URL.Query().Get("startAt") {
		case "0":
			writeJiraJSON(t, w, map[string]any{
				"startAt":    0,
				"maxResults": 100,
				"total":      2,
				"isLast":     false,
				"values":     []map[string]any{{"id": "10000", "key": "ENG", "name": "Engineering"}},
			})
		case "1":
			writeJiraJSON(t, w, map[string]any{
				"startAt":    1,
				"maxResults": 100,
				"total":      2,
				"isLast":     true,
				"values":     []map[string]any{{"id": "10001", "key": "OPS", "name": "Operations"}},
			})
		default:
			t.Fatalf("unexpected startAt %q", r.URL.Query().Get("startAt"))
		}
	}))
	defer server.Close()

	connector := &JiraConnector{
		info:       NewJiraConnector().Info(),
		client:     server.Client(),
		baseURL:    "https://jira.test",
		apiBaseURL: server.URL,
		cloudID:    "cloud-1",
	}

	resources, err := connector.ListSelectableResources(context.Background(), domain.GatewayContext{}, &domain.ProviderToken{AccessToken: "token"})
	if err != nil {
		t.Fatal(err)
	}

	if requests != 2 {
		t.Fatalf("expected 2 project page requests, got %d", requests)
	}
	if len(resources) != 2 {
		t.Fatalf("expected 2 resources, got %d", len(resources))
	}
}

func TestJiraSyncFetchesAndNormalizesTickets(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("expected POST, got %s", r.Method)
		}
		if r.URL.Path != "/ex/jira/cloud-1/rest/api/3/search" {
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
		baseURL:     "https://jira.test",
		apiBaseURL:  server.URL,
		cloudID:     "cloud-1",
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

func TestJiraSyncPaginatesIssues(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}

		if requests == 1 {
			if payload["startAt"] != float64(0) {
				t.Fatalf("expected first startAt 0, got %#v", payload["startAt"])
			}
			writeJiraJSON(t, w, map[string]any{
				"startAt":    0,
				"maxResults": 50,
				"total":      2,
				"isLast":     false,
				"issues": []map[string]any{
					{
						"id":   "10001",
						"key":  "ENG-12",
						"self": "https://jira.test/rest/api/3/issue/10001",
						"fields": map[string]any{
							"summary":        "First page ticket",
							"updated":        "2026-07-29T12:30:00.000+0000",
							"created":        "2026-07-29T12:00:00.000+0000",
							"resolutiondate": nil,
							"labels":         []string{},
							"status":         map[string]any{"name": "Todo", "statusCategory": map[string]any{"key": "new", "name": "To Do"}},
							"project":        map[string]any{"key": "ENG", "name": "Engineering"},
							"priority":       map[string]any{"name": "Medium"},
							"issuetype":      map[string]any{"name": "Task"},
							"assignee":       nil,
							"comment":        map[string]any{"total": 0, "comments": []map[string]any{}},
						},
					},
				},
			})
			return
		}

		if payload["startAt"] != float64(1) {
			t.Fatalf("expected second startAt 1, got %#v", payload["startAt"])
		}
		writeJiraJSON(t, w, map[string]any{
			"startAt":    1,
			"maxResults": 50,
			"total":      2,
			"isLast":     true,
			"issues": []map[string]any{
				{
					"id":   "10002",
					"key":  "ENG-13",
					"self": "https://jira.test/rest/api/3/issue/10002",
					"fields": map[string]any{
						"summary":        "Second page ticket",
						"updated":        "2026-07-29T13:30:00.000+0000",
						"created":        "2026-07-29T13:00:00.000+0000",
						"resolutiondate": nil,
						"labels":         []string{},
						"status":         map[string]any{"name": "Todo", "statusCategory": map[string]any{"key": "new", "name": "To Do"}},
						"project":        map[string]any{"key": "ENG", "name": "Engineering"},
						"priority":       map[string]any{"name": "Medium"},
						"issuetype":      map[string]any{"name": "Task"},
						"assignee":       nil,
						"comment":        map[string]any{"total": 0, "comments": []map[string]any{}},
					},
				},
			},
		})
	}))
	defer server.Close()

	connector := &JiraConnector{
		info:        NewJiraConnector().Info(),
		client:      server.Client(),
		baseURL:     "https://jira.test",
		apiBaseURL:  server.URL,
		cloudID:     "cloud-1",
		projectKeys: []string{"ENG"},
	}

	result, err := connector.Sync(context.Background(), domain.GatewayContext{}, &domain.ProviderToken{AccessToken: "token"})
	if err != nil {
		t.Fatal(err)
	}

	if requests != 2 {
		t.Fatalf("expected 2 issue page requests, got %d", requests)
	}
	if result.EventsCreated != 2 {
		t.Fatalf("expected 2 events, got %d", result.EventsCreated)
	}
}

func TestJiraSyncIncludesProviderErrorBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		if _, err := w.Write([]byte(`{"errorMessages":["The value 'updated' does not exist for the field 'updated'."],"errors":{}}`)); err != nil {
			t.Fatal(err)
		}
	}))
	defer server.Close()

	connector := &JiraConnector{
		info:       NewJiraConnector().Info(),
		client:     server.Client(),
		baseURL:    "https://jira.test",
		apiBaseURL: server.URL,
		cloudID:    "cloud-1",
	}

	_, err := connector.Sync(context.Background(), domain.GatewayContext{}, &domain.ProviderToken{AccessToken: "token"})
	if err == nil {
		t.Fatal("expected Jira API error")
	}
	if !strings.Contains(err.Error(), "errorMessages") {
		t.Fatalf("expected provider error body, got %q", err.Error())
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
		baseURL:     "https://jira.test",
		apiBaseURL:  server.URL,
		cloudID:     "cloud-1",
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
