package integrations

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/developer-os/api/internal/domain"
)

type CalendarConnector struct {
	info        domain.ConnectorInfo
	client      *http.Client
	apiBaseURL  string
	calendarIDs []string
}

func NewCalendarConnector() Connector {
	return &CalendarConnector{
		info: domain.ConnectorInfo{
			ID:           domain.ServiceCalendar,
			Name:         "Calendar",
			AuthStrategy: "oauth",
			SyncMode:     "polling_first",
			Capabilities: []string{"oauth", "initial_sync", "polling", "semantic_context"},
			Objects:      []string{"meetings", "attendees", "descriptions", "follow_ups"},
		},
		client:      &http.Client{Timeout: 15 * time.Second},
		apiBaseURL:  envOrDefault("GOOGLE_CALENDAR_API_BASE_URL", "https://www.googleapis.com/calendar/v3"),
		calendarIDs: calendarIDsFromEnv(),
	}
}

func (c *CalendarConnector) Info() domain.ConnectorInfo {
	return c.info
}

func (c *CalendarConnector) FetchRecentRecords(ctx context.Context, _ domain.GatewayContext, token *domain.ProviderToken) ([]domain.ExternalRecord, error) {
	accessToken := calendarAccessToken(token)
	if accessToken == "" {
		return nil, errCalendarNeedsAuth
	}

	calendarIDs := c.calendarIDs
	if len(calendarIDs) == 0 {
		calendarIDs = []string{"primary"}
	}

	return c.fetchRecentRecordsForCalendars(ctx, accessToken, calendarIDs)
}

func (c *CalendarConnector) ListSelectableResources(ctx context.Context, _ domain.GatewayContext, token *domain.ProviderToken) ([]domain.SelectableResource, error) {
	accessToken := calendarAccessToken(token)
	if accessToken == "" {
		return nil, errCalendarNeedsAuth
	}

	calendars, err := c.fetchCalendars(ctx, accessToken)
	if err != nil {
		return nil, err
	}

	resources := make([]domain.SelectableResource, 0, len(calendars))
	for _, calendar := range calendars {
		if calendar.ID == "" {
			continue
		}
		name := calendar.Summary
		if name == "" {
			name = calendar.ID
		}
		resources = append(resources, domain.SelectableResource{
			ID:          calendar.ID,
			Type:        "calendar",
			Name:        name,
			ExternalURL: calendar.HTMLLink,
			Metadata: map[string]any{
				"calendarId": calendar.ID,
				"primary":    calendar.Primary,
			},
		})
	}
	return resources, nil
}

func (c *CalendarConnector) SyncSelected(ctx context.Context, gatewayContext domain.GatewayContext, token *domain.ProviderToken, selection domain.ResourceSelection) (domain.SyncResult, error) {
	accessToken := calendarAccessToken(token)
	if accessToken == "" {
		return domain.SyncResult{Service: domain.ServiceCalendar, Status: "needs_auth", Events: []domain.WorkEvent{}}, nil
	}

	calendarIDs := selectedCalendarIDs(selection)
	if len(calendarIDs) == 0 {
		return domain.SyncResult{Service: domain.ServiceCalendar, Status: "needs_selection", Events: []domain.WorkEvent{}}, nil
	}

	records, err := c.fetchRecentRecordsForCalendars(ctx, accessToken, calendarIDs)
	if err != nil {
		return domain.SyncResult{}, err
	}

	events := c.Normalize(records)
	cursor := latestRecordCursor(records)
	return domain.SyncResult{
		Service:        domain.ServiceCalendar,
		Status:         "connected",
		RecordsScanned: len(records),
		EventsCreated:  len(events),
		NextCursor:     cursor,
		Events:         events,
	}, nil
}

func (c *CalendarConnector) fetchRecentRecordsForCalendars(ctx context.Context, accessToken string, calendarIDs []string) ([]domain.ExternalRecord, error) {
	records := []domain.ExternalRecord{}
	for _, calendarID := range calendarIDs {
		events, err := c.fetchEvents(ctx, accessToken, calendarID)
		if err != nil {
			return nil, err
		}
		for _, event := range events {
			record, ok := event.toRecord(calendarID)
			if ok {
				records = append(records, record)
			}
		}
	}
	return records, nil
}

func (c *CalendarConnector) Normalize(records []domain.ExternalRecord) []domain.WorkEvent {
	events := make([]domain.WorkEvent, 0, len(records))
	for _, record := range records {
		eventType, _ := record.Payload["eventType"].(string)
		priority, _ := record.Payload["priority"].(string)
		source, _ := record.Payload["source"].(string)
		summary, _ := record.Payload["summary"].(string)

		events = append(events, domain.WorkEvent{
			ID:         "evt-" + record.ID,
			ExternalID: record.ID,
			Service:    domain.ServiceCalendar,
			Type:       eventType,
			Title:      record.Title,
			Source:     source,
			Actor:      record.Actor,
			Priority:   priority,
			Summary:    summary,
			OccurredAt: record.UpdatedAt,
			Raw:        record.Payload,
		})
	}
	return events
}

func (c *CalendarConnector) Sync(ctx context.Context, gatewayContext domain.GatewayContext, token *domain.ProviderToken) (domain.SyncResult, error) {
	records, err := c.FetchRecentRecords(ctx, gatewayContext, token)
	if errors.Is(err, errCalendarNeedsAuth) {
		return domain.SyncResult{Service: domain.ServiceCalendar, Status: "needs_auth", Events: []domain.WorkEvent{}}, nil
	}
	if err != nil {
		return domain.SyncResult{}, err
	}

	events := c.Normalize(records)
	cursor := latestRecordCursor(records)
	return domain.SyncResult{
		Service:        domain.ServiceCalendar,
		Status:         "connected",
		RecordsScanned: len(records),
		EventsCreated:  len(events),
		NextCursor:     cursor,
		Events:         events,
	}, nil
}

func (c *CalendarConnector) fetchEvents(ctx context.Context, token string, calendarID string) ([]calendarEvent, error) {
	now := time.Now().UTC()
	values := url.Values{
		"timeMin":      []string{now.Add(-7 * 24 * time.Hour).Format(time.RFC3339)},
		"timeMax":      []string{now.Add(24 * time.Hour).Format(time.RFC3339)},
		"singleEvents": []string{"true"},
		"orderBy":      []string{"startTime"},
		"maxResults":   []string{"50"},
	}

	var response struct {
		Items []calendarEvent `json:"items"`
	}
	path := "/calendars/" + url.PathEscape(calendarID) + "/events?" + values.Encode()
	if err := c.get(ctx, token, path, &response); err != nil {
		return nil, err
	}
	return response.Items, nil
}

func (c *CalendarConnector) fetchCalendars(ctx context.Context, token string) ([]calendarListEntry, error) {
	var response struct {
		Items []calendarListEntry `json:"items"`
	}
	if err := c.get(ctx, token, "/users/me/calendarList?minAccessRole=reader", &response); err != nil {
		return nil, err
	}
	return response.Items, nil
}

func (c *CalendarConnector) get(ctx context.Context, token string, path string, output any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(c.apiBaseURL, "/")+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("authorization", "Bearer "+token)
	req.Header.Set("accept", "application/json")
	req.Header.Set("user-agent", "developer-os-api")

	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("calendar api request failed: %s", resp.Status)
	}
	return json.NewDecoder(resp.Body).Decode(output)
}

type calendarEvent struct {
	ID             string             `json:"id"`
	Status         string             `json:"status"`
	HTMLLink       string             `json:"htmlLink"`
	Summary        string             `json:"summary"`
	Description    string             `json:"description"`
	Updated        time.Time          `json:"updated"`
	Start          calendarEventTime  `json:"start"`
	End            calendarEventTime  `json:"end"`
	Organizer      calendarPerson     `json:"organizer"`
	Creator        calendarPerson     `json:"creator"`
	Attendees      []calendarAttendee `json:"attendees"`
	ConferenceData struct {
		ConferenceSolution struct {
			Name string `json:"name"`
		} `json:"conferenceSolution"`
		EntryPoints []struct {
			EntryPointType string `json:"entryPointType"`
			URI            string `json:"uri"`
		} `json:"entryPoints"`
	} `json:"conferenceData"`
}

type calendarListEntry struct {
	ID       string `json:"id"`
	Summary  string `json:"summary"`
	HTMLLink string `json:"htmlLink"`
	Primary  bool   `json:"primary"`
}

type calendarEventTime struct {
	DateTime *time.Time `json:"dateTime"`
	Date     string     `json:"date"`
	TimeZone string     `json:"timeZone"`
}

type calendarPerson struct {
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
	Self        bool   `json:"self"`
}

type calendarAttendee struct {
	Email          string `json:"email"`
	DisplayName    string `json:"displayName"`
	ResponseStatus string `json:"responseStatus"`
	Optional       bool   `json:"optional"`
}

func (e calendarEvent) toRecord(calendarID string) (domain.ExternalRecord, bool) {
	if e.Status == "cancelled" {
		return domain.ExternalRecord{}, false
	}

	end := e.endTime()
	if end.IsZero() || end.After(time.Now().UTC()) {
		return domain.ExternalRecord{}, false
	}

	eventType, priority, summary := classifyCalendarEvent(e)
	title := e.Summary
	if title == "" {
		title = "Untitled meeting"
	}

	actor := firstNonEmpty(e.Organizer.DisplayName, e.Organizer.Email, e.Creator.DisplayName, e.Creator.Email, "Calendar")
	externalID := fmt.Sprintf("calendar:%s:%s:%s", calendarID, e.ID, eventType)
	return domain.ExternalRecord{
		ID:          externalID,
		ExternalURL: e.HTMLLink,
		Title:       title,
		Actor:       actor,
		UpdatedAt:   end,
		Payload: map[string]any{
			"eventType":          eventType,
			"priority":           priority,
			"source":             "Calendar · " + calendarID,
			"summary":            summary,
			"calendarId":         calendarID,
			"eventId":            e.ID,
			"url":                e.HTMLLink,
			"start":              nullableCalendarTime(e.startTime()),
			"end":                nullableCalendarTime(end),
			"attendeeCount":      len(e.Attendees),
			"acceptedCount":      countCalendarResponses(e.Attendees, "accepted"),
			"conferenceProvider": e.ConferenceData.ConferenceSolution.Name,
			"hasConference":      len(e.ConferenceData.EntryPoints) > 0,
			"linkedRefs":         extractLinkedRefs(e.Description),
		},
	}, true
}

func (e calendarEvent) startTime() time.Time {
	if e.Start.DateTime != nil {
		return e.Start.DateTime.UTC()
	}
	if e.Start.Date != "" {
		parsed, _ := time.Parse("2006-01-02", e.Start.Date)
		return parsed.UTC()
	}
	return time.Time{}
}

func (e calendarEvent) endTime() time.Time {
	if e.End.DateTime != nil {
		return e.End.DateTime.UTC()
	}
	if e.End.Date != "" {
		parsed, _ := time.Parse("2006-01-02", e.End.Date)
		return parsed.UTC()
	}
	return time.Time{}
}

func classifyCalendarEvent(event calendarEvent) (string, string, string) {
	description := strings.ToLower(event.Description)
	if strings.Contains(description, "follow up") || strings.Contains(description, "follow-up") || strings.Contains(description, "action item") || strings.Contains(description, "todo") || strings.Contains(description, "next step") {
		return "calendar.follow_up.created", "high", "A completed meeting appears to contain follow-ups."
	}
	return "calendar.meeting.ended", "medium", "A calendar meeting ended and was normalized into workspace context."
}

func countCalendarResponses(attendees []calendarAttendee, status string) int {
	count := 0
	for _, attendee := range attendees {
		if attendee.ResponseStatus == status {
			count++
		}
	}
	return count
}

func nullableCalendarTime(value time.Time) any {
	if value.IsZero() {
		return nil
	}
	return value.UTC()
}

func calendarIDsFromEnv() []string {
	ids := parseCSV(os.Getenv("GOOGLE_CALENDAR_IDS"))
	if len(ids) > 0 {
		return ids
	}
	return []string{"primary"}
}

var errCalendarNeedsAuth = errors.New("calendar integration token is required")

func calendarAccessToken(token *domain.ProviderToken) string {
	if token != nil && token.AccessToken != "" {
		return token.AccessToken
	}
	return strings.TrimSpace(os.Getenv("GOOGLE_CALENDAR_ACCESS_TOKEN"))
}

func selectedCalendarIDs(selection domain.ResourceSelection) []string {
	calendarIDs := []string{}
	seen := map[string]bool{}
	for _, resource := range selection.Resources {
		if resource.Type != "" && resource.Type != "calendar" {
			continue
		}

		calendarID := strings.TrimSpace(resource.ID)
		if metadataID, ok := resource.Metadata["calendarId"].(string); ok && strings.TrimSpace(metadataID) != "" {
			calendarID = strings.TrimSpace(metadataID)
		}
		if calendarID == "" || seen[calendarID] {
			continue
		}

		seen[calendarID] = true
		calendarIDs = append(calendarIDs, calendarID)
	}
	return calendarIDs
}
