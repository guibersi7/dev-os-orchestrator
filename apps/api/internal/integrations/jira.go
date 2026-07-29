package integrations

import (
	"bytes"
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

type JiraConnector struct {
	info        domain.ConnectorInfo
	client      *http.Client
	baseURL     string
	projectKeys []string
}

func NewJiraConnector() Connector {
	return &JiraConnector{
		info: domain.ConnectorInfo{
			ID:           domain.ServiceJira,
			Name:         "Jira",
			AuthStrategy: "oauth",
			SyncMode:     "hybrid",
			Capabilities: []string{"oauth", "webhooks", "initial_sync", "polling"},
			Objects:      []string{"projects", "epics", "tickets", "sprints", "comments"},
		},
		client:      &http.Client{Timeout: 15 * time.Second},
		baseURL:     strings.TrimRight(os.Getenv("JIRA_BASE_URL"), "/"),
		projectKeys: parseCSV(os.Getenv("JIRA_PROJECT_KEYS")),
	}
}

func (c *JiraConnector) Info() domain.ConnectorInfo {
	return c.info
}

func (c *JiraConnector) FetchRecentRecords(ctx context.Context, _ domain.GatewayContext, token *domain.ProviderToken) ([]domain.ExternalRecord, error) {
	accessToken := jiraAccessToken(token)
	if accessToken == "" {
		return nil, errJiraNeedsAuth
	}
	if c.baseURL == "" {
		return nil, errJiraNeedsSiteConfig
	}

	issues, err := c.searchIssues(ctx, accessToken)
	if err != nil {
		return nil, err
	}

	records := make([]domain.ExternalRecord, 0, len(issues))
	for _, issue := range issues {
		records = append(records, issue.toRecord(c.baseURL))
	}
	return records, nil
}

func (c *JiraConnector) Normalize(records []domain.ExternalRecord) []domain.WorkEvent {
	events := make([]domain.WorkEvent, 0, len(records))
	for _, record := range records {
		eventType, _ := record.Payload["eventType"].(string)
		priority, _ := record.Payload["priority"].(string)
		source, _ := record.Payload["source"].(string)
		summary, _ := record.Payload["summary"].(string)

		events = append(events, domain.WorkEvent{
			ID:         "evt-" + record.ID,
			ExternalID: record.ID,
			Service:    domain.ServiceJira,
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

func (c *JiraConnector) Sync(ctx context.Context, gatewayContext domain.GatewayContext, token *domain.ProviderToken) (domain.SyncResult, error) {
	records, err := c.FetchRecentRecords(ctx, gatewayContext, token)
	if errors.Is(err, errJiraNeedsAuth) {
		return domain.SyncResult{Service: domain.ServiceJira, Status: "needs_auth", Events: []domain.WorkEvent{}}, nil
	}
	if errors.Is(err, errJiraNeedsSiteConfig) {
		return domain.SyncResult{Service: domain.ServiceJira, Status: "needs_site_config", Events: []domain.WorkEvent{}}, nil
	}
	if err != nil {
		return domain.SyncResult{}, err
	}

	events := c.Normalize(records)
	cursor := latestRecordCursor(records)

	return domain.SyncResult{
		Service:        domain.ServiceJira,
		Status:         "connected",
		RecordsScanned: len(records),
		EventsCreated:  len(events),
		NextCursor:     cursor,
		Events:         events,
	}, nil
}

func (c *JiraConnector) searchIssues(ctx context.Context, token string) ([]jiraIssue, error) {
	jql := "updated >= -14d ORDER BY updated DESC"
	if len(c.projectKeys) > 0 {
		quoted := make([]string, 0, len(c.projectKeys))
		for _, key := range c.projectKeys {
			quoted = append(quoted, `"`+strings.ReplaceAll(key, `"`, `\"`)+`"`)
		}
		jql = "project in (" + strings.Join(quoted, ",") + ") AND " + jql
	}

	var response struct {
		Issues []jiraIssue `json:"issues"`
	}
	payload := map[string]any{
		"jql":        jql,
		"maxResults": 50,
		"fields": []string{
			"summary",
			"status",
			"assignee",
			"project",
			"priority",
			"issuetype",
			"comment",
			"updated",
			"created",
			"resolutiondate",
			"labels",
		},
	}

	if err := c.post(ctx, token, "/rest/api/3/search/jql", payload, &response); err != nil {
		return nil, err
	}
	return response.Issues, nil
}

func (c *JiraConnector) post(ctx context.Context, token string, path string, input any, output any) error {
	payload, err := json.Marshal(input)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("authorization", "Bearer "+token)
	req.Header.Set("accept", "application/json")
	req.Header.Set("content-type", "application/json")
	req.Header.Set("user-agent", "developer-os-api")

	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("jira api request failed: %s", resp.Status)
	}
	return json.NewDecoder(resp.Body).Decode(output)
}

type jiraIssue struct {
	ID     string     `json:"id"`
	Key    string     `json:"key"`
	Self   string     `json:"self"`
	Fields jiraFields `json:"fields"`
}

type jiraFields struct {
	Summary        string          `json:"summary"`
	Updated        jiraTime        `json:"updated"`
	Created        jiraTime        `json:"created"`
	ResolutionDate *jiraTime       `json:"resolutiondate"`
	Labels         []string        `json:"labels"`
	Status         jiraNamedEntity `json:"status"`
	Project        jiraProject     `json:"project"`
	Priority       jiraNamedEntity `json:"priority"`
	IssueType      jiraNamedEntity `json:"issuetype"`
	Assignee       *jiraUser       `json:"assignee"`
	Comment        struct {
		Comments []jiraComment `json:"comments"`
		Total    int           `json:"total"`
	} `json:"comment"`
}

type jiraNamedEntity struct {
	Name           string `json:"name"`
	StatusCategory *struct {
		Key  string `json:"key"`
		Name string `json:"name"`
	} `json:"statusCategory,omitempty"`
}

type jiraProject struct {
	Key  string `json:"key"`
	Name string `json:"name"`
}

type jiraUser struct {
	DisplayName string `json:"displayName"`
}

type jiraComment struct {
	ID      string   `json:"id"`
	Body    any      `json:"body"`
	Updated jiraTime `json:"updated"`
	Author  jiraUser `json:"author"`
}

func (i jiraIssue) toRecord(baseURL string) domain.ExternalRecord {
	eventType, priority, summary := classifyJiraIssue(i)
	occurredAt := i.Fields.Updated.Time
	if i.Fields.ResolutionDate != nil {
		occurredAt = i.Fields.ResolutionDate.Time
	}
	if occurredAt.IsZero() {
		occurredAt = time.Now().UTC()
	}

	actor := "Jira"
	if i.Fields.Assignee != nil && i.Fields.Assignee.DisplayName != "" {
		actor = i.Fields.Assignee.DisplayName
	}

	source := "Jira"
	if i.Fields.Project.Key != "" {
		source = "Jira · " + i.Fields.Project.Key
	}

	browseURL := strings.TrimRight(baseURL, "/") + "/browse/" + url.PathEscape(i.Key)
	externalID := fmt.Sprintf("jira:%s:%s:%s", i.Key, eventType, occurredAt.Format(time.RFC3339))
	return domain.ExternalRecord{
		ID:          externalID,
		ExternalURL: browseURL,
		Title:       i.Key + " " + i.Fields.Summary,
		Actor:       actor,
		UpdatedAt:   occurredAt,
		Payload: map[string]any{
			"eventType":      eventType,
			"priority":       priority,
			"source":         source,
			"summary":        summary,
			"key":            i.Key,
			"url":            browseURL,
			"project":        i.Fields.Project.Name,
			"projectKey":     i.Fields.Project.Key,
			"status":         i.Fields.Status.Name,
			"statusCategory": jiraStatusCategory(i),
			"priorityLabel":  i.Fields.Priority.Name,
			"issueType":      i.Fields.IssueType.Name,
			"labels":         i.Fields.Labels,
			"commentCount":   i.Fields.Comment.Total,
			"linkedRefs":     extractJiraLinkedRefs(i),
		},
	}
}

func classifyJiraIssue(issue jiraIssue) (string, string, string) {
	statusName := strings.ToLower(issue.Fields.Status.Name)
	statusCategory := strings.ToLower(jiraStatusCategory(issue))
	priorityName := strings.ToLower(issue.Fields.Priority.Name)
	labels := strings.ToLower(strings.Join(issue.Fields.Labels, " "))
	comments := strings.ToLower(jiraCommentsText(issue.Fields.Comment.Comments))

	if issue.Fields.ResolutionDate != nil || statusCategory == "done" {
		return "jira.ticket.completed", "medium", "A Jira ticket was completed."
	}
	if strings.Contains(statusName, "block") || strings.Contains(labels, "block") || strings.Contains(comments, "blocked") || strings.Contains(comments, "bloqueado") {
		return "jira.ticket.blocked", "high", "A Jira ticket appears blocked or waiting on a dependency."
	}
	if strings.Contains(priorityName, "highest") || strings.Contains(priorityName, "high") {
		return "jira.ticket.prioritized", "high", "A high-priority Jira ticket needs attention."
	}
	if statusCategory == "indeterminate" {
		return "jira.ticket.moved", "medium", "A Jira ticket moved into active work."
	}
	return "jira.ticket.updated", "medium", "A Jira ticket changed."
}

func jiraStatusCategory(issue jiraIssue) string {
	if issue.Fields.Status.StatusCategory == nil {
		return ""
	}
	return issue.Fields.Status.StatusCategory.Key
}

func jiraCommentsText(comments []jiraComment) string {
	parts := make([]string, 0, len(comments))
	for _, comment := range comments {
		parts = append(parts, fmt.Sprint(comment.Body))
	}
	return strings.Join(parts, "\n")
}

func extractJiraLinkedRefs(issue jiraIssue) []string {
	return extractLinkedRefs(issue.Self + " " + jiraCommentsText(issue.Fields.Comment.Comments))
}

type jiraTime struct {
	time.Time
}

func (t *jiraTime) UnmarshalJSON(data []byte) error {
	value := strings.Trim(string(data), `"`)
	if value == "" || value == "null" {
		t.Time = time.Time{}
		return nil
	}

	for _, layout := range []string{time.RFC3339Nano, "2006-01-02T15:04:05.000-0700"} {
		parsed, err := time.Parse(layout, value)
		if err == nil {
			t.Time = parsed.UTC()
			return nil
		}
	}
	return fmt.Errorf("invalid jira time %q", value)
}

var (
	errJiraNeedsAuth       = errors.New("jira integration token is required")
	errJiraNeedsSiteConfig = errors.New("jira base url is required")
)

func jiraAccessToken(token *domain.ProviderToken) string {
	if token != nil && token.AccessToken != "" {
		return token.AccessToken
	}

	return strings.TrimSpace(os.Getenv("JIRA_ACCESS_TOKEN"))
}
