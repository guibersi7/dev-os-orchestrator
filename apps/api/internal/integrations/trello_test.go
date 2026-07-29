package integrations

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/developer-os/api/internal/domain"
)

func TestTrelloSyncReportsSetupStates(t *testing.T) {
	authMissing := &TrelloConnector{
		info:     NewTrelloConnector().Info(),
		client:   http.DefaultClient,
		apiKey:   "key",
		boardIDs: []string{"board"},
	}
	result, err := authMissing.Sync(context.Background(), domain.GatewayContext{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "needs_auth" {
		t.Fatalf("expected needs_auth, got %q", result.Status)
	}

	keyMissing := &TrelloConnector{
		info:     NewTrelloConnector().Info(),
		client:   http.DefaultClient,
		boardIDs: []string{"board"},
	}
	result, err = keyMissing.Sync(context.Background(), domain.GatewayContext{}, &domain.ProviderToken{AccessToken: "token"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "needs_api_key" {
		t.Fatalf("expected needs_api_key, got %q", result.Status)
	}

	boardMissing := &TrelloConnector{
		info:   NewTrelloConnector().Info(),
		client: http.DefaultClient,
		apiKey: "key",
	}
	result, err = boardMissing.Sync(context.Background(), domain.GatewayContext{}, &domain.ProviderToken{AccessToken: "token"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "needs_board_selection" {
		t.Fatalf("expected needs_board_selection, got %q", result.Status)
	}
}

func TestTrelloSyncFetchesAndNormalizesCards(t *testing.T) {
	past := time.Now().UTC().Add(-24 * time.Hour).Format(time.RFC3339)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("key") != "key" || r.URL.Query().Get("token") != "token" {
			t.Fatalf("expected key/token query auth, got %s", r.URL.RawQuery)
		}

		switch r.URL.Path {
		case "/boards/board":
			writeTrelloJSON(t, w, map[string]any{"id": "board", "name": "Launch", "url": "https://trello.com/b/board"})
		case "/boards/board/lists":
			writeTrelloJSON(t, w, []map[string]any{
				{"id": "list-1", "name": "Blocked"},
				{"id": "list-2", "name": "Todo"},
				{"id": "list-3", "name": "Done"},
			})
		case "/boards/board/cards":
			writeTrelloJSON(t, w, []map[string]any{
				{
					"id":               "card-1",
					"name":             "Payment launch",
					"url":              "https://trello.com/c/card-1",
					"idList":           "list-1",
					"dateLastActivity": "2026-07-29T12:00:00Z",
					"due":              nil,
					"dueComplete":      false,
					"closed":           false,
					"labels":           []map[string]any{{"name": "blocked", "color": "red"}},
					"idMembers":        []string{"member-1"},
					"checklists":       []map[string]any{},
				},
				{
					"id":               "card-2",
					"name":             "Support checklist",
					"url":              "https://trello.com/c/card-2",
					"idList":           "list-3",
					"dateLastActivity": "2026-07-29T13:00:00Z",
					"due":              nil,
					"dueComplete":      false,
					"closed":           false,
					"labels":           []map[string]any{},
					"idMembers":        []string{},
					"checklists": []map[string]any{
						{
							"id":   "checklist-1",
							"name": "Launch",
							"checkItems": []map[string]any{
								{"id": "item-1", "name": "Docs", "state": "complete"},
							},
						},
					},
				},
				{
					"id":               "card-3",
					"name":             "Missed due date",
					"url":              "https://trello.com/c/card-3",
					"idList":           "list-2",
					"dateLastActivity": "2026-07-29T14:00:00Z",
					"due":              past,
					"dueComplete":      false,
					"closed":           false,
					"labels":           []map[string]any{},
					"idMembers":        []string{},
					"checklists":       []map[string]any{},
				},
			})
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	connector := &TrelloConnector{
		info:       NewTrelloConnector().Info(),
		client:     server.Client(),
		apiBaseURL: server.URL,
		apiKey:     "key",
		boardIDs:   []string{"board"},
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
	for _, eventType := range []string{"trello.card.blocked", "trello.checklist.completed", "trello.due_date.missed"} {
		if !eventTypes[eventType] {
			t.Fatalf("expected event type %q in %#v", eventType, eventTypes)
		}
	}
}

func writeTrelloJSON(t *testing.T, w http.ResponseWriter, payload any) {
	t.Helper()
	w.Header().Set("content-type", "application/json")
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		t.Fatal(err)
	}
}
