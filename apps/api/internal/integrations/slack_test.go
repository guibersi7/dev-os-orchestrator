package integrations

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/developer-os/api/internal/domain"
)

func TestSlackSyncReportsNeedsAuthWithoutToken(t *testing.T) {
	connector := &SlackConnector{
		info:       NewSlackConnector().Info(),
		client:     http.DefaultClient,
		apiBaseURL: "https://slack.test/api",
		channelIDs: []string{"C123"},
	}

	result, err := connector.Sync(context.Background(), domain.GatewayContext{}, nil)
	if err != nil {
		t.Fatal(err)
	}

	if result.Status != "needs_auth" {
		t.Fatalf("expected needs_auth, got %q", result.Status)
	}
}

func TestSlackSyncReportsMissingChannelSelection(t *testing.T) {
	connector := &SlackConnector{
		info:       NewSlackConnector().Info(),
		client:     http.DefaultClient,
		apiBaseURL: "https://slack.test/api",
	}

	result, err := connector.Sync(context.Background(), domain.GatewayContext{}, &domain.ProviderToken{AccessToken: "token"})
	if err != nil {
		t.Fatal(err)
	}

	if result.Status != "needs_channel_selection" {
		t.Fatalf("expected needs_channel_selection, got %q", result.Status)
	}
}

func TestSlackSyncFetchesThreadsAndNormalizesDecisionsAndBlockers(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("authorization") != "Bearer token" {
			t.Fatalf("expected bearer token, got %q", r.Header.Get("authorization"))
		}

		switch r.URL.Path {
		case "/conversations.info":
			if r.URL.Query().Get("channel") != "C123" {
				t.Fatalf("unexpected channel %s", r.URL.Query().Get("channel"))
			}
			writeSlackJSON(t, w, map[string]any{
				"ok":      true,
				"channel": map[string]any{"id": "C123", "name": "eng"},
			})
		case "/conversations.history":
			writeSlackJSON(t, w, map[string]any{
				"ok": true,
				"messages": []map[string]any{
					{
						"user":        "U1",
						"text":        "Decision: keep the API gateway in Go",
						"ts":          "1785326400.000000",
						"thread_ts":   "1785326400.000000",
						"reply_count": 1,
					},
					{
						"user": "U2",
						"text": "Blocked waiting on GitHub OAuth app approval DEV-9",
						"ts":   "1785326500.000000",
					},
				},
			})
		case "/conversations.replies":
			if r.URL.Query().Get("ts") != "1785326400.000000" {
				t.Fatalf("unexpected thread ts %s", r.URL.Query().Get("ts"))
			}
			writeSlackJSON(t, w, map[string]any{
				"ok": true,
				"messages": []map[string]any{
					{
						"user": "U1",
						"text": "Decision: keep the API gateway in Go",
						"ts":   "1785326400.000000",
					},
					{
						"user": "U3",
						"text": "Agreed, link this to https://github.com/owner/repo/pull/42",
						"ts":   "1785326410.000000",
					},
				},
			})
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	connector := &SlackConnector{
		info:       NewSlackConnector().Info(),
		client:     server.Client(),
		apiBaseURL: server.URL,
		channelIDs: []string{"C123"},
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
		if event.Source != "Slack · #eng" {
			t.Fatalf("expected Slack source, got %q", event.Source)
		}
	}

	for _, eventType := range []string{"slack.decision", "slack.blocker"} {
		if !eventTypes[eventType] {
			t.Fatalf("expected event type %q in %#v", eventType, eventTypes)
		}
	}
}

func TestClassifySlackTextPrefersBlockersOverDecisions(t *testing.T) {
	eventType, priority, _, ok := classifySlackText("Decision is approved but blocked waiting on staging")
	if !ok {
		t.Fatal("expected text to be classified")
	}
	if eventType != "slack.blocker" || priority != "high" {
		t.Fatalf("expected high-priority blocker, got %s/%s", eventType, priority)
	}
}

func writeSlackJSON(t *testing.T, w http.ResponseWriter, payload any) {
	t.Helper()
	w.Header().Set("content-type", "application/json")
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		t.Fatal(err)
	}
}
