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

func TestCalendarSyncReportsNeedsAuthWithoutToken(t *testing.T) {
	connector := &CalendarConnector{
		info:        NewCalendarConnector().Info(),
		client:      http.DefaultClient,
		apiBaseURL:  "https://calendar.test/calendar/v3",
		calendarIDs: []string{"primary"},
	}

	result, err := connector.Sync(context.Background(), domain.GatewayContext{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "needs_auth" {
		t.Fatalf("expected needs_auth, got %q", result.Status)
	}
}

func TestCalendarSyncFetchesEndedMeetingsAndFollowUps(t *testing.T) {
	now := time.Now().UTC()
	start := now.Add(-2 * time.Hour).Format(time.RFC3339)
	end := now.Add(-1 * time.Hour).Format(time.RFC3339)
	futureStart := now.Add(1 * time.Hour).Format(time.RFC3339)
	futureEnd := now.Add(2 * time.Hour).Format(time.RFC3339)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("authorization") != "Bearer token" {
			t.Fatalf("expected bearer token, got %q", r.Header.Get("authorization"))
		}
		if r.URL.Path != "/calendars/primary/events" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if r.URL.Query().Get("singleEvents") != "true" || r.URL.Query().Get("orderBy") != "startTime" {
			t.Fatalf("unexpected query %s", r.URL.RawQuery)
		}

		writeCalendarJSON(t, w, map[string]any{
			"items": []map[string]any{
				{
					"id":          "event-1",
					"status":      "confirmed",
					"htmlLink":    "https://calendar.google.com/event-1",
					"summary":     "Release sync",
					"description": "Follow-up: review https://github.com/owner/repo/pull/42",
					"updated":     end,
					"start":       map[string]any{"dateTime": start},
					"end":         map[string]any{"dateTime": end},
					"organizer":   map[string]any{"email": "lead@example.com", "displayName": "Tech Lead"},
					"attendees": []map[string]any{
						{"email": "one@example.com", "responseStatus": "accepted"},
						{"email": "two@example.com", "responseStatus": "needsAction"},
					},
					"conferenceData": map[string]any{
						"conferenceSolution": map[string]any{"name": "Google Meet"},
						"entryPoints":        []map[string]any{{"entryPointType": "video", "uri": "https://meet.google.com/abc"}},
					},
				},
				{
					"id":       "event-2",
					"status":   "confirmed",
					"htmlLink": "https://calendar.google.com/event-2",
					"summary":  "Future sync",
					"updated":  futureStart,
					"start":    map[string]any{"dateTime": futureStart},
					"end":      map[string]any{"dateTime": futureEnd},
				},
			},
		})
	}))
	defer server.Close()

	connector := &CalendarConnector{
		info:        NewCalendarConnector().Info(),
		client:      server.Client(),
		apiBaseURL:  server.URL,
		calendarIDs: []string{"primary"},
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

	event := result.Events[0]
	if event.Type != "calendar.follow_up.created" {
		t.Fatalf("expected follow-up event, got %q", event.Type)
	}
	if event.Priority != "high" {
		t.Fatalf("expected high priority, got %q", event.Priority)
	}
	if _, ok := event.Raw["description"]; ok {
		t.Fatal("calendar event raw payload exposed meeting description")
	}
	if event.Raw["attendeeCount"].(int) != 2 {
		t.Fatalf("expected attendee count 2, got %v", event.Raw["attendeeCount"])
	}
}

func writeCalendarJSON(t *testing.T, w http.ResponseWriter, payload any) {
	t.Helper()
	w.Header().Set("content-type", "application/json")
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		t.Fatal(err)
	}
}
