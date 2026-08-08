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
		if r.URL.Query().Get("types") != "public_channel,private_channel,im,mpim" {
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
					{"id": "C123", "name": "eng", "created": 1785320000, "updated": 1785326400, "is_member": true},
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
					{"id": "C999", "name": "release", "is_private": false, "is_shared": true, "created": 1785320100},
					{"id": "G999", "name": "leadership", "is_private": true, "is_member": true, "created": 1785320200, "updated": 1785326500},
					{"id": "D123", "is_im": true, "user": "U123", "created": 1785320300, "updated": 1785326600},
					{"id": "GMPIM", "name": "mpdm-alice-bob-1", "is_mpim": true, "created": 1785320400, "updated": 1785326700},
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

	if len(resources) != 5 {
		t.Fatalf("expected 5 resources, got %d", len(resources))
	}
	if resources[0].ID != "C123" || resources[0].Type != "public_channel" || resources[0].Name != "#eng" {
		t.Fatalf("unexpected first resource: %#v", resources[0])
	}
	if resources[0].Metadata["lastActivityAt"] != "2026-07-29T12:00:00Z" || resources[0].Metadata["isMember"] != true {
		t.Fatalf("unexpected first resource metadata: %#v", resources[0].Metadata)
	}
	if resources[1].ID != "C999" || resources[1].Type != "public_channel" || resources[1].Name != "#release" {
		t.Fatalf("unexpected second resource: %#v", resources[1])
	}
	if resources[1].Metadata["lastActivityAt"] != "2026-07-29T10:15:00Z" || resources[1].Metadata["isShared"] != true {
		t.Fatalf("unexpected second resource metadata: %#v", resources[1].Metadata)
	}
	if resources[2].ID != "G999" || resources[2].Type != "private_channel" || resources[2].Name != "#leadership" {
		t.Fatalf("unexpected third resource: %#v", resources[2])
	}
	if resources[2].Metadata["lastActivityAt"] != "2026-07-29T12:01:40Z" || resources[2].Metadata["isPrivate"] != true {
		t.Fatalf("unexpected third resource metadata: %#v", resources[2].Metadata)
	}
	if resources[3].ID != "D123" || resources[3].Type != "direct_message" || resources[3].Name != "DM with U123" {
		t.Fatalf("unexpected fourth resource: %#v", resources[3])
	}
	if resources[3].Metadata["lastActivityAt"] != "2026-07-29T12:03:20Z" || resources[3].Metadata["isIm"] != true || resources[3].Metadata["userId"] != "U123" {
		t.Fatalf("unexpected fourth resource metadata: %#v", resources[3].Metadata)
	}
	if resources[4].ID != "GMPIM" || resources[4].Type != "group_direct_message" || resources[4].Name != "Group DM mpdm-alice-bob-1" {
		t.Fatalf("unexpected fifth resource: %#v", resources[4])
	}
	if resources[4].Metadata["lastActivityAt"] != "2026-07-29T12:05:00Z" || resources[4].Metadata["isMpim"] != true {
		t.Fatalf("unexpected fifth resource metadata: %#v", resources[4].Metadata)
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

func TestSlackSyncSelectedUsesSelectedChannelMetadataWithoutInfoLookup(t *testing.T) {
	seenInfo := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/conversations.info":
			seenInfo = true
			t.Fatalf("conversations.info should not be called when channel metadata is selected")
		case "/conversations.history":
			if r.URL.Query().Get("channel") != "C999" {
				t.Fatalf("unexpected selected channel %s", r.URL.Query().Get("channel"))
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
	}

	selection := domain.ResourceSelection{
		Service: domain.ServiceSlack,
		Resources: []domain.SelectableResource{
			{ID: "C999", Type: "public_channel", Name: "#release", Metadata: map[string]any{"channelId": "C999", "channelName": "release"}},
		},
	}
	result, err := connector.SyncSelected(context.Background(), domain.GatewayContext{}, &domain.ProviderToken{AccessToken: "token"}, selection)
	if err != nil {
		t.Fatal(err)
	}

	if seenInfo {
		t.Fatal("sync looked up selected channel info")
	}
	if result.Status != "connected" || result.EventsCreated != 1 {
		t.Fatalf("unexpected sync result: %#v", result)
	}
	if result.Events[0].Source != "Slack · #release" {
		t.Fatalf("expected selected channel source, got %q", result.Events[0].Source)
	}
}

func TestSlackSyncSelectedReadsSelectedDirectMessages(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/conversations.history":
			if r.URL.Query().Get("channel") != "D123" {
				t.Fatalf("unexpected selected conversation %s", r.URL.Query().Get("channel"))
			}
			writeSlackJSON(t, w, map[string]any{
				"ok": true,
				"messages": []map[string]any{
					{
						"user": "U123",
						"text": "Decision: move the Slack onboarding checklist into setup",
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
	}

	selection := domain.ResourceSelection{
		Service: domain.ServiceSlack,
		Resources: []domain.SelectableResource{
			{ID: "D123", Type: "direct_message", Name: "DM with U123", Metadata: map[string]any{"conversationId": "D123"}},
		},
	}
	result, err := connector.SyncSelected(context.Background(), domain.GatewayContext{}, &domain.ProviderToken{AccessToken: "token"}, selection)
	if err != nil {
		t.Fatal(err)
	}

	if result.EventsCreated != 1 {
		t.Fatalf("expected one event from selected DM, got %d", result.EventsCreated)
	}
	if result.Events[0].Source != "Slack · DM with U123" {
		t.Fatalf("expected DM source, got %q", result.Events[0].Source)
	}
	if result.Events[0].Title != "Slack decision detected in DM with U123" {
		t.Fatalf("expected DM title, got %q", result.Events[0].Title)
	}
}

func TestSlackSyncSelectedSkipsChannelsWithoutAccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/conversations.history":
			switch r.URL.Query().Get("channel") {
			case "CNOACCESS":
				writeSlackJSON(t, w, map[string]any{"ok": false, "error": "not_in_channel"})
			case "C999":
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
				t.Fatalf("unexpected selected channel %s", r.URL.Query().Get("channel"))
			}
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	connector := &SlackConnector{
		info:       NewSlackConnector().Info(),
		client:     server.Client(),
		apiBaseURL: server.URL,
	}

	selection := domain.ResourceSelection{
		Service: domain.ServiceSlack,
		Resources: []domain.SelectableResource{
			{ID: "CNOACCESS", Type: "public_channel", Name: "#no-access", Metadata: map[string]any{"channelId": "CNOACCESS", "channelName": "no-access"}},
			{ID: "C999", Type: "public_channel", Name: "#release", Metadata: map[string]any{"channelId": "C999", "channelName": "release"}},
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
		t.Fatalf("expected one event from accessible channel, got %d", result.EventsCreated)
	}
	if result.Events[0].Source != "Slack · #release" {
		t.Fatalf("expected accessible channel source, got %q", result.Events[0].Source)
	}
}

func TestSlackSyncSelectedRespectsExtractionTypesAndSyncWindow(t *testing.T) {
	seenOldest := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/conversations.history":
			if r.URL.Query().Get("channel") != "C999" {
				t.Fatalf("unexpected selected channel %s", r.URL.Query().Get("channel"))
			}
			if r.URL.Query().Get("oldest") == "" {
				t.Fatal("expected oldest query for selected sync window")
			}
			seenOldest = true
			writeSlackJSON(t, w, map[string]any{
				"ok": true,
				"messages": []map[string]any{
					{
						"user": "U1",
						"text": "Decision: this should be ignored when decisions are not selected",
						"ts":   "1785326400.000000",
					},
					{
						"user": "U2",
						"text": "Can <@U999> take a look?",
						"ts":   "1785326500.000000",
					},
					{
						"user":        "U3",
						"text":        "Follow-up thread",
						"ts":          "1785326600.000000",
						"thread_ts":   "1785326600.000000",
						"reply_count": 1,
					},
				},
			})
		case "/conversations.replies":
			writeSlackJSON(t, w, map[string]any{
				"ok": true,
				"messages": []map[string]any{
					{
						"user": "U3",
						"text": "Follow-up thread",
						"ts":   "1785326600.000000",
					},
					{
						"user": "U4",
						"text": "Context: https://example.com/spec",
						"ts":   "1785326610.000000",
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
	}

	selection := domain.ResourceSelection{
		Service: domain.ServiceSlack,
		Resources: []domain.SelectableResource{
			{ID: "C999", Type: "public_channel", Name: "#release", Metadata: map[string]any{"channelId": "C999", "channelName": "release"}},
		},
		Settings: map[string]any{
			"slack": map[string]any{
				"extractionTypes": []any{"mentions", "threads_with_links"},
				"syncWindow":      "last_7_days",
			},
		},
	}
	result, err := connector.SyncSelected(context.Background(), domain.GatewayContext{}, &domain.ProviderToken{AccessToken: "token"}, selection)
	if err != nil {
		t.Fatal(err)
	}

	if !seenOldest {
		t.Fatal("sync did not pass selected sync window to Slack history")
	}
	if result.RecordsScanned != 3 {
		t.Fatalf("expected 3 scanned Slack messages, got %d", result.RecordsScanned)
	}
	if result.EventsCreated != 2 {
		t.Fatalf("expected mention and thread link events, got %d", result.EventsCreated)
	}

	eventTypes := map[string]bool{}
	for _, event := range result.Events {
		eventTypes[event.Type] = true
	}
	if eventTypes["slack.decision"] {
		t.Fatal("decision event should not be created when decisions are not selected")
	}
	for _, eventType := range []string{"slack.mention", "slack.thread_with_link"} {
		if !eventTypes[eventType] {
			t.Fatalf("expected event type %q in %#v", eventType, eventTypes)
		}
	}
}

func TestSlackRateLimitErrorIncludesRetryAfter(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("retry-after", "42")
		http.Error(w, "too many requests", http.StatusTooManyRequests)
	}))
	defer server.Close()

	connector := &SlackConnector{
		info:       NewSlackConnector().Info(),
		client:     server.Client(),
		apiBaseURL: server.URL,
	}

	_, err := connector.ListSelectableResources(context.Background(), domain.GatewayContext{}, &domain.ProviderToken{AccessToken: "token"})
	if err == nil {
		t.Fatal("expected rate limit error")
	}
	if err.Error() != "slack rate limit exceeded for conversations.list; retry after 42s" {
		t.Fatalf("unexpected error: %q", err.Error())
	}
}

func TestClassifySlackTextPrefersBlockersOverDecisions(t *testing.T) {
	eventType, priority, _, ok := classifySlackText("Decision is approved but blocked waiting on staging", false, defaultSlackSyncOptions())
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
