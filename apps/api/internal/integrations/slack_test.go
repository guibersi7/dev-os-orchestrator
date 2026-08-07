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

	if result.Status != "needs_selection" {
		t.Fatalf("expected needs_selection, got %q", result.Status)
	}
}

func TestSlackListSelectableResourcesReturnsChannels(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/conversations.list" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if r.URL.Query().Get("types") != "public_channel,private_channel" {
			t.Fatalf("expected channel types query, got %s", r.URL.RawQuery)
		}
		requests++
		switch requests {
		case 1:
			if r.URL.Query().Get("cursor") != "" {
				t.Fatalf("expected first request without cursor, got %s", r.URL.RawQuery)
			}
			writeSlackJSON(t, w, map[string]any{
				"ok": true,
				"channels": []map[string]any{
					{"id": "C123", "name": "eng"},
				},
				"response_metadata": map[string]any{"next_cursor": "page-2"},
			})
		case 2:
			if r.URL.Query().Get("cursor") != "page-2" {
				t.Fatalf("expected second request cursor, got %s", r.URL.RawQuery)
			}
			writeSlackJSON(t, w, map[string]any{
				"ok": true,
				"channels": []map[string]any{
					{"id": "C999", "name": "release"},
				},
				"response_metadata": map[string]any{"next_cursor": ""},
			})
		default:
			t.Fatalf("unexpected conversations.list request %d", requests)
		}
	}))
	defer server.Close()

	connector := &SlackConnector{
		info:       NewSlackConnector().Info(),
		client:     server.Client(),
		apiBaseURL: server.URL,
	}

	resources, err := connector.ListSelectableResources(context.Background(), domain.GatewayContext{}, &domain.ProviderToken{AccessToken: "token"})
	if err != nil {
		t.Fatal(err)
	}

	if len(resources) != 2 {
		t.Fatalf("expected 2 resources, got %d", len(resources))
	}
	if resources[0].ID != "C123" || resources[0].Type != "channel" || resources[0].Name != "#eng" {
		t.Fatalf("unexpected first resource: %#v", resources[0])
	}
	if resources[1].ID != "C999" || resources[1].Type != "channel" || resources[1].Name != "#release" {
		t.Fatalf("unexpected second resource: %#v", resources[1])
	}
	if requests != 2 {
		t.Fatalf("expected 2 paginated requests, got %d", requests)
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

func TestSlackSyncSelectedUsesOnlySelectedChannels(t *testing.T) {
	seenChannels := map[string]bool{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("authorization") != "Bearer token" {
			t.Fatalf("expected bearer token, got %q", r.Header.Get("authorization"))
		}

		channelID := r.URL.Query().Get("channel")
		if channelID != "" {
			seenChannels[channelID] = true
		}

		switch r.URL.Path {
		case "/conversations.info":
			if channelID != "C999" {
				t.Fatalf("unexpected selected channel %s", channelID)
			}
			writeSlackJSON(t, w, map[string]any{
				"ok":      true,
				"channel": map[string]any{"id": "C999", "name": "release"},
			})
		case "/conversations.history":
			if channelID != "C999" {
				t.Fatalf("unexpected selected channel %s", channelID)
			}
			writeSlackJSON(t, w, map[string]any{
				"ok": true,
				"messages": []map[string]any{
					{
						"user": "U2",
						"text": "Blocked waiting on GitHub checks",
						"ts":   "1785326500.000000",
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

	selection := domain.ResourceSelection{
		Service: domain.ServiceSlack,
		Resources: []domain.SelectableResource{
			{ID: "C999", Type: "channel", Name: "#release", Metadata: map[string]any{"channelId": "C999"}},
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
		t.Fatalf("expected one event, got %d", result.EventsCreated)
	}
	if seenChannels["C123"] {
		t.Fatal("sync used env channel instead of selected channel")
	}
	if !seenChannels["C999"] {
		t.Fatal("sync did not use selected channel")
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
