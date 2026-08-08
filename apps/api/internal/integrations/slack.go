package integrations

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/developer-os/api/internal/domain"
)

type SlackConnector struct {
	info       domain.ConnectorInfo
	client     *http.Client
	apiBaseURL string
	channelIDs []string
}

func NewSlackConnector() Connector {
	return &SlackConnector{
		info: domain.ConnectorInfo{
			ID:           domain.ServiceSlack,
			Name:         "Slack",
			AuthStrategy: "oauth",
			SyncMode:     "hybrid",
			Capabilities: []string{"oauth", "webhooks", "initial_sync", "semantic_context"},
			Objects:      []string{"channels", "threads", "mentions", "decisions", "blockers"},
		},
		client:     &http.Client{Timeout: 15 * time.Second},
		apiBaseURL: envOrDefault("SLACK_API_BASE_URL", "https://slack.com/api"),
		channelIDs: parseCSV(os.Getenv("SLACK_CHANNEL_IDS")),
	}
}

func (c *SlackConnector) Info() domain.ConnectorInfo {
	return c.info
}

func (c *SlackConnector) FetchRecentRecords(ctx context.Context, _ domain.GatewayContext, token *domain.ProviderToken) ([]domain.ExternalRecord, error) {
	accessToken := slackAccessToken(token)
	if accessToken == "" {
		return nil, errSlackNeedsAuth
	}
	if len(c.channelIDs) == 0 {
		return nil, errSlackChannelsNotConfigured
	}

	return c.fetchRecentRecordsForChannels(ctx, accessToken, c.channelIDs)
}

func (c *SlackConnector) ListSelectableResources(ctx context.Context, _ domain.GatewayContext, token *domain.ProviderToken) ([]domain.SelectableResource, error) {
	accessToken := slackAccessToken(token)
	if accessToken == "" {
		return nil, errSlackNeedsAuth
	}

	channels, err := c.fetchChannels(ctx, accessToken)
	if err != nil {
		return nil, err
	}

	resources := make([]domain.SelectableResource, 0, len(channels))
	for _, channel := range channels {
		if channel.ID == "" || channel.Name == "" {
			continue
		}
		resourceType := "public_channel"
		if channel.IsPrivate {
			resourceType = "private_channel"
		}
		lastActivityAt := channelLastActivityAt(channel)
		resources = append(resources, domain.SelectableResource{
			ID:   channel.ID,
			Type: resourceType,
			Name: "#" + channel.Name,
			Metadata: map[string]any{
				"channelId":      channel.ID,
				"channelName":    channel.Name,
				"isPrivate":      channel.IsPrivate,
				"isMember":       channel.IsMember,
				"isShared":       channel.IsShared,
				"createdAt":      slackUnixTimestamp(channel.Created),
				"updatedAt":      slackUnixTimestamp(channel.Updated),
				"lastActivityAt": lastActivityAt,
			},
		})
	}
	return resources, nil
}

func (c *SlackConnector) SyncSelected(ctx context.Context, gatewayContext domain.GatewayContext, token *domain.ProviderToken, selection domain.ResourceSelection) (domain.SyncResult, error) {
	accessToken := slackAccessToken(token)
	if accessToken == "" {
		return domain.SyncResult{Service: domain.ServiceSlack, Status: "needs_auth", Events: []domain.WorkEvent{}}, nil
	}

	channels := selectedSlackChannels(selection)
	if len(channels) == 0 {
		return domain.SyncResult{Service: domain.ServiceSlack, Status: "needs_selection", Events: []domain.WorkEvent{}}, nil
	}

	records, err := c.fetchRecentRecordsForSlackChannels(ctx, accessToken, channels)
	if err != nil {
		return domain.SyncResult{}, err
	}

	events := c.Normalize(records)
	cursor := latestRecordCursor(records)

	return domain.SyncResult{
		Service:        domain.ServiceSlack,
		Status:         "connected",
		RecordsScanned: len(records),
		EventsCreated:  len(events),
		NextCursor:     cursor,
		Events:         events,
	}, nil
}

func (c *SlackConnector) fetchRecentRecordsForChannels(ctx context.Context, accessToken string, channelIDs []string) ([]domain.ExternalRecord, error) {
	channels := make([]slackChannel, 0, len(channelIDs))
	for _, channelID := range channelIDs {
		channels = append(channels, slackChannel{ID: channelID})
	}
	return c.fetchRecentRecordsForSlackChannels(ctx, accessToken, channels)
}

func (c *SlackConnector) fetchRecentRecordsForSlackChannels(ctx context.Context, accessToken string, channels []slackChannel) ([]domain.ExternalRecord, error) {
	records := []domain.ExternalRecord{}
	for _, channel := range channels {
		if channel.Name == "" {
			var err error
			channel, err = c.fetchChannel(ctx, accessToken, channel.ID)
			if err != nil {
				return nil, err
			}
		}

		messages, err := c.fetchHistory(ctx, accessToken, channel.ID)
		if err != nil {
			return nil, err
		}

		for _, message := range messages {
			replies := []slackMessage{}
			if message.ReplyCount > 0 && message.ThreadTS != "" {
				replies, err = c.fetchReplies(ctx, accessToken, channel.ID, message.ThreadTS)
				if err != nil {
					return nil, err
				}
			}

			record, ok := message.toRecord(channel, replies)
			if ok {
				records = append(records, record)
			}
		}
	}

	return records, nil
}

func (c *SlackConnector) Normalize(records []domain.ExternalRecord) []domain.WorkEvent {
	events := make([]domain.WorkEvent, 0, len(records))
	for _, record := range records {
		eventType, _ := record.Payload["eventType"].(string)
		priority, _ := record.Payload["priority"].(string)
		channelName, _ := record.Payload["channelName"].(string)
		summary, _ := record.Payload["summary"].(string)

		events = append(events, domain.WorkEvent{
			ID:         "evt-" + record.ID,
			ExternalID: record.ID,
			Service:    domain.ServiceSlack,
			Type:       eventType,
			Title:      record.Title,
			Source:     "Slack · #" + channelName,
			Actor:      record.Actor,
			Priority:   priority,
			Summary:    summary,
			OccurredAt: record.UpdatedAt,
			Raw:        record.Payload,
		})
	}

	return events
}

func (c *SlackConnector) Sync(ctx context.Context, gatewayContext domain.GatewayContext, token *domain.ProviderToken) (domain.SyncResult, error) {
	records, err := c.FetchRecentRecords(ctx, gatewayContext, token)
	if errors.Is(err, errSlackNeedsAuth) {
		return domain.SyncResult{Service: domain.ServiceSlack, Status: "needs_auth", Events: []domain.WorkEvent{}}, nil
	}
	if errors.Is(err, errSlackChannelsNotConfigured) {
		return domain.SyncResult{Service: domain.ServiceSlack, Status: "needs_selection", Events: []domain.WorkEvent{}}, nil
	}
	if err != nil {
		return domain.SyncResult{}, err
	}

	events := c.Normalize(records)
	cursor := latestRecordCursor(records)

	return domain.SyncResult{
		Service:        domain.ServiceSlack,
		Status:         "connected",
		RecordsScanned: len(records),
		EventsCreated:  len(events),
		NextCursor:     cursor,
		Events:         events,
	}, nil
}

func (c *SlackConnector) fetchChannels(ctx context.Context, token string) ([]slackChannel, error) {
	channels := []slackChannel{}
	cursor := ""

	for {
		var response struct {
			OK               bool           `json:"ok"`
			Error            string         `json:"error"`
			Channels         []slackChannel `json:"channels"`
			ResponseMetadata struct {
				NextCursor string `json:"next_cursor"`
			} `json:"response_metadata"`
		}
		values := url.Values{
			"exclude_archived": []string{"true"},
			"limit":            []string{"200"},
			"types":            []string{"public_channel,private_channel"},
		}
		if cursor != "" {
			values.Set("cursor", cursor)
		}

		if err := c.get(ctx, token, "conversations.list", values, &response); err != nil {
			return nil, err
		}
		if !response.OK {
			return nil, fmt.Errorf("slack conversations.list failed: %s", response.Error)
		}

		channels = append(channels, response.Channels...)
		cursor = strings.TrimSpace(response.ResponseMetadata.NextCursor)
		if cursor == "" {
			break
		}
	}

	return channels, nil
}

func (c *SlackConnector) fetchChannel(ctx context.Context, token string, channelID string) (slackChannel, error) {
	var response struct {
		OK      bool         `json:"ok"`
		Error   string       `json:"error"`
		Channel slackChannel `json:"channel"`
	}
	if err := c.get(ctx, token, "conversations.info", url.Values{"channel": []string{channelID}}, &response); err != nil {
		return slackChannel{}, err
	}
	if !response.OK {
		return slackChannel{}, fmt.Errorf("slack conversations.info failed: %s", response.Error)
	}
	return response.Channel, nil
}

func (c *SlackConnector) fetchHistory(ctx context.Context, token string, channelID string) ([]slackMessage, error) {
	var response struct {
		OK       bool           `json:"ok"`
		Error    string         `json:"error"`
		Messages []slackMessage `json:"messages"`
	}
	if err := c.get(ctx, token, "conversations.history", url.Values{"channel": []string{channelID}, "limit": []string{"50"}}, &response); err != nil {
		return nil, err
	}
	if !response.OK {
		return nil, fmt.Errorf("slack conversations.history failed: %s", response.Error)
	}
	return response.Messages, nil
}

func (c *SlackConnector) fetchReplies(ctx context.Context, token string, channelID string, threadTS string) ([]slackMessage, error) {
	var response struct {
		OK       bool           `json:"ok"`
		Error    string         `json:"error"`
		Messages []slackMessage `json:"messages"`
	}
	if err := c.get(ctx, token, "conversations.replies", url.Values{"channel": []string{channelID}, "ts": []string{threadTS}, "limit": []string{"50"}}, &response); err != nil {
		return nil, err
	}
	if !response.OK {
		return nil, fmt.Errorf("slack conversations.replies failed: %s", response.Error)
	}
	return response.Messages, nil
}

func (c *SlackConnector) get(ctx context.Context, token string, method string, values url.Values, output any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(c.apiBaseURL, "/")+"/"+method+"?"+values.Encode(), nil)
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
		if resp.StatusCode == http.StatusTooManyRequests {
			return slackRateLimitError{Method: method, RetryAfter: retryAfterDuration(resp.Header.Get("retry-after"))}
		}
		return fmt.Errorf("slack api request failed: %s", resp.Status)
	}

	return json.NewDecoder(resp.Body).Decode(output)
}

type slackRateLimitError struct {
	Method     string
	RetryAfter time.Duration
}

func (e slackRateLimitError) Error() string {
	if e.RetryAfter > 0 {
		return fmt.Sprintf("slack rate limit exceeded for %s; retry after %s", e.Method, e.RetryAfter.Round(time.Second))
	}
	return fmt.Sprintf("slack rate limit exceeded for %s", e.Method)
}

type slackChannel struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	IsPrivate bool   `json:"is_private"`
	IsMember  bool   `json:"is_member"`
	IsShared  bool   `json:"is_shared"`
	Created   int64  `json:"created"`
	Updated   int64  `json:"updated"`
}

type slackMessage struct {
	User       string          `json:"user"`
	Username   string          `json:"username"`
	Text       string          `json:"text"`
	TS         string          `json:"ts"`
	ThreadTS   string          `json:"thread_ts"`
	ReplyCount int             `json:"reply_count"`
	Reactions  []slackReaction `json:"reactions"`
}

type slackReaction struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

func (m slackMessage) toRecord(channel slackChannel, replies []slackMessage) (domain.ExternalRecord, bool) {
	threadText := combinedThreadText(m, replies)
	eventType, priority, summary, ok := classifySlackText(threadText)
	if !ok {
		return domain.ExternalRecord{}, false
	}

	occurredAt := slackTimestamp(m.TS)
	title := summarizeSlackTitle(eventType, channel.Name)
	actor := m.User
	if actor == "" {
		actor = m.Username
	}
	if actor == "" {
		actor = "Slack"
	}

	externalID := fmt.Sprintf("slack:%s:%s:%s", channel.ID, m.TS, eventType)
	return domain.ExternalRecord{
		ID:        externalID,
		Title:     title,
		Actor:     actor,
		UpdatedAt: occurredAt,
		Payload: map[string]any{
			"eventType":   eventType,
			"priority":    priority,
			"channelId":   channel.ID,
			"channelName": channel.Name,
			"summary":     summary,
			"messageTs":   m.TS,
			"threadTs":    firstNonEmpty(m.ThreadTS, m.TS),
			"replyCount":  m.ReplyCount,
			"reactions":   m.Reactions,
			"linkedRefs":  extractLinkedRefs(threadText),
			"hasThread":   len(replies) > 0,
		},
	}, true
}

func classifySlackText(text string) (string, string, string, bool) {
	normalized := strings.ToLower(text)
	blockerTerms := []string{"blocked", "blocker", "blocking", "bloqueado", "bloqueador", "travado", "impedimento", "waiting on", "stuck"}
	decisionTerms := []string{"decision", "decided", "agreed", "approved", "ship it", "decisao", "decidido", "aprovado", "combinado"}

	for _, term := range blockerTerms {
		if strings.Contains(normalized, term) {
			return "slack.blocker", "high", "A Slack conversation indicates a blocker or dependency.", true
		}
	}
	for _, term := range decisionTerms {
		if strings.Contains(normalized, term) {
			return "slack.decision", "medium", "A Slack conversation captured a decision that should be durable context.", true
		}
	}

	return "", "", "", false
}

func combinedThreadText(message slackMessage, replies []slackMessage) string {
	parts := []string{message.Text}
	for _, reply := range replies {
		if reply.TS == message.TS {
			continue
		}
		parts = append(parts, reply.Text)
	}
	return strings.Join(parts, "\n")
}

func slackTimestamp(value string) time.Time {
	seconds, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return time.Now().UTC()
	}
	nanos := int64(seconds * 1_000_000_000)
	return time.Unix(0, nanos).UTC()
}

func summarizeSlackTitle(eventType string, channelName string) string {
	prefix := "Slack decision detected"
	if eventType == "slack.blocker" {
		prefix = "Slack blocker detected"
	}
	return prefix + " in #" + channelName
}

func extractLinkedRefs(text string) []string {
	fields := strings.Fields(text)
	refs := []string{}
	for _, field := range fields {
		candidate := strings.Trim(field, "<>()[]{}.,")
		if strings.HasPrefix(candidate, "http://") || strings.HasPrefix(candidate, "https://") || strings.HasPrefix(candidate, "DEV-") {
			refs = append(refs, candidate)
		}
	}
	return refs
}

var (
	errSlackNeedsAuth             = errors.New("slack integration token is required")
	errSlackChannelsNotConfigured = errors.New("slack channels are not configured")
)

func slackAccessToken(token *domain.ProviderToken) string {
	if token != nil && token.AccessToken != "" {
		return token.AccessToken
	}

	return strings.TrimSpace(os.Getenv("SLACK_ACCESS_TOKEN"))
}

func selectedSlackChannelIDs(selection domain.ResourceSelection) []string {
	channels := selectedSlackChannels(selection)
	channelIDs := make([]string, 0, len(channels))
	for _, channel := range channels {
		channelIDs = append(channelIDs, channel.ID)
	}
	return channelIDs
}

func selectedSlackChannels(selection domain.ResourceSelection) []slackChannel {
	channels := []slackChannel{}
	seen := map[string]bool{}
	for _, resource := range selection.Resources {
		if resource.Type != "" && resource.Type != "channel" && resource.Type != "public_channel" && resource.Type != "private_channel" {
			continue
		}

		channelID := strings.TrimSpace(resource.ID)
		if metadataID, ok := resource.Metadata["channelId"].(string); ok && strings.TrimSpace(metadataID) != "" {
			channelID = strings.TrimSpace(metadataID)
		}
		if channelID == "" || seen[channelID] {
			continue
		}

		seen[channelID] = true
		channelName := strings.TrimPrefix(resource.Name, "#")
		if metadataName, ok := resource.Metadata["channelName"].(string); ok && strings.TrimSpace(metadataName) != "" {
			channelName = strings.TrimSpace(metadataName)
		}
		channels = append(channels, slackChannel{
			ID:        channelID,
			Name:      strings.TrimPrefix(channelName, "#"),
			IsPrivate: resource.Type == "private_channel",
		})
	}
	return channels
}

func parseCSV(value string) []string {
	parts := strings.Split(value, ",")
	output := make([]string, 0, len(parts))
	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item != "" {
			output = append(output, item)
		}
	}
	return output
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func retryAfterDuration(value string) time.Duration {
	seconds, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || seconds <= 0 {
		return 0
	}
	return time.Duration(seconds) * time.Second
}

func slackUnixTimestamp(value int64) string {
	if value <= 0 {
		return ""
	}
	return time.Unix(value, 0).UTC().Format(time.RFC3339)
}

func channelLastActivityAt(channel slackChannel) string {
	if channel.Updated > 0 {
		return slackUnixTimestamp(channel.Updated)
	}
	return slackUnixTimestamp(channel.Created)
}
