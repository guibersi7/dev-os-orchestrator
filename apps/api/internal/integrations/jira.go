package integrations

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
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
	apiBaseURL  string
	cloudID     string
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
		apiBaseURL:  strings.TrimRight(envOrDefault("JIRA_API_BASE_URL", "https://api.atlassian.com"), "/"),
		cloudID:     strings.TrimSpace(os.Getenv("JIRA_CLOUD_ID")),
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

	site, err := c.resolveSite(ctx, accessToken)
	if err != nil {
		return nil, err
	}

	issues, err := c.searchIssues(ctx, accessToken, site)
	if err != nil {
		return nil, err
	}

	records := make([]domain.ExternalRecord, 0, len(issues))
	for _, issue := range issues {
		records = append(records, issue.toRecord(site.URL))
	}
	return records, nil
}

func (c *JiraConnector) ListSelectableResources(ctx context.Context, _ domain.GatewayContext, token *domain.ProviderToken) ([]domain.SelectableResource, error) {
	accessToken := jiraAccessToken(token)
	if accessToken == "" {
		return nil, errJiraNeedsAuth
	}

	site, err := c.resolveSite(ctx, accessToken)
	if err != nil {
		return nil, err
	}

	projects, err := c.fetchProjects(ctx, accessToken, site)
	if err != nil {
		return nil, err
	}

	resources := make([]domain.SelectableResource, 0, len(projects))
	for _, project := range projects {
		if project.Key == "" {
			continue
		}
		resources = append(resources, domain.SelectableResource{
			ID:          project.Key,
			Type:        "project",
			Name:        project.Name,
			ExternalURL: strings.TrimRight(site.URL, "/") + "/jira/software/c/projects/" + url.PathEscape(project.Key),
			Metadata: map[string]any{
				"projectId":  project.ID,
				"projectKey": project.Key,
				"cloudId":    site.CloudID,
				"siteUrl":    site.URL,
			},
		})
	}
	return resources, nil
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

func (c *JiraConnector) SyncSelected(ctx context.Context, gatewayContext domain.GatewayContext, token *domain.ProviderToken, selection domain.ResourceSelection) (domain.SyncResult, error) {
	accessToken := jiraAccessToken(token)
	if accessToken == "" {
		return domain.SyncResult{Service: domain.ServiceJira, Status: "needs_auth", Events: []domain.WorkEvent{}}, nil
	}

	site, err := c.resolveSite(ctx, accessToken)
	if errors.Is(err, errJiraNeedsSiteConfig) {
		return domain.SyncResult{Service: domain.ServiceJira, Status: "needs_site_config", Events: []domain.WorkEvent{}}, nil
	}
	if err != nil {
		return domain.SyncResult{}, err
	}

	projectKeys := selectedJiraProjectKeys(selection)
	if len(projectKeys) == 0 {
		return domain.SyncResult{Service: domain.ServiceJira, Status: "needs_selection", Events: []domain.WorkEvent{}}, nil
	}

	issues, err := c.searchIssuesForProjectKeys(ctx, accessToken, site, projectKeys)
	if err != nil {
		return domain.SyncResult{}, err
	}

	records := make([]domain.ExternalRecord, 0, len(issues))
	for _, issue := range issues {
		records = append(records, issue.toRecord(site.URL))
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

func (c *JiraConnector) searchIssues(ctx context.Context, token string, site jiraSite) ([]jiraIssue, error) {
	return c.searchIssuesForProjectKeys(ctx, token, site, c.projectKeys)
}

func (c *JiraConnector) searchIssuesForProjectKeys(ctx context.Context, token string, site jiraSite, projectKeys []string) ([]jiraIssue, error) {
	jql := "updated >= -14d ORDER BY updated DESC"
	if len(projectKeys) > 0 {
		quoted := make([]string, 0, len(projectKeys))
		for _, key := range projectKeys {
			quoted = append(quoted, `"`+strings.ReplaceAll(key, `"`, `\"`)+`"`)
		}
		jql = "project in (" + strings.Join(quoted, ",") + ") AND " + jql
	}

	basePayload := map[string]any{
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

	issues := []jiraIssue{}
	startAt := 0
	nextPageToken := ""
	for {
		payload := cloneMap(basePayload)
		if nextPageToken != "" {
			payload["nextPageToken"] = nextPageToken
		} else {
			payload["startAt"] = startAt
		}

		var response jiraSearchResponse
		if err := c.post(ctx, token, site, "/rest/api/3/search", payload, &response); err != nil {
			return nil, err
		}

		issues = append(issues, response.Issues...)
		if response.NextPageToken != "" {
			nextPageToken = response.NextPageToken
			continue
		}
		if response.Total == nil && response.IsLast == nil {
			return issues, nil
		}
		if (response.IsLast != nil && *response.IsLast) || len(response.Issues) == 0 {
			return issues, nil
		}
		if response.Total != nil && *response.Total > 0 && startAt+len(response.Issues) >= *response.Total {
			return issues, nil
		}

		startAt += len(response.Issues)
	}
}

func (c *JiraConnector) fetchProjects(ctx context.Context, token string, site jiraSite) ([]jiraProject, error) {
	projects := []jiraProject{}
	startAt := 0
	for {
		var response jiraProjectSearchResponse
		path := fmt.Sprintf("/rest/api/3/project/search?maxResults=100&startAt=%d", startAt)
		if err := c.get(ctx, token, site, path, &response); err != nil {
			return nil, err
		}

		projects = append(projects, response.Values...)
		if response.Total == nil && response.IsLast == nil {
			return projects, nil
		}
		if (response.IsLast != nil && *response.IsLast) || len(response.Values) == 0 {
			return projects, nil
		}
		if response.Total != nil && *response.Total > 0 && response.StartAt+len(response.Values) >= *response.Total {
			return projects, nil
		}
		startAt = response.StartAt + len(response.Values)
	}
}

func cloneMap(input map[string]any) map[string]any {
	output := make(map[string]any, len(input))
	for key, value := range input {
		output[key] = value
	}
	return output
}

func (c *JiraConnector) resolveSite(ctx context.Context, token string) (jiraSite, error) {
	if c.cloudID != "" {
		siteURL := c.baseURL
		if siteURL == "" {
			siteURL = "https://api.atlassian.com/ex/jira/" + url.PathEscape(c.cloudID)
		}
		return jiraSite{CloudID: c.cloudID, URL: siteURL}, nil
	}

	resources, err := c.fetchAccessibleResources(ctx, token)
	if err != nil {
		return jiraSite{}, err
	}

	for _, resource := range resources {
		if !resource.hasJiraScope() {
			continue
		}
		if c.baseURL == "" || strings.EqualFold(strings.TrimRight(resource.URL, "/"), c.baseURL) {
			return jiraSite{CloudID: resource.ID, URL: strings.TrimRight(resource.URL, "/")}, nil
		}
	}

	return jiraSite{}, errJiraNeedsSiteConfig
}

func (c *JiraConnector) fetchAccessibleResources(ctx context.Context, token string) ([]jiraAccessibleResource, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.apiBaseURL+"/oauth/token/accessible-resources", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("authorization", "Bearer "+token)
	req.Header.Set("accept", "application/json")
	req.Header.Set("user-agent", "developer-os-api")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, jiraHTTPError("jira accessible resources request failed", resp)
	}

	var resources []jiraAccessibleResource
	if err := json.NewDecoder(resp.Body).Decode(&resources); err != nil {
		return nil, err
	}
	return resources, nil
}

func (c *JiraConnector) get(ctx context.Context, token string, site jiraSite, path string, output any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.jiraAPIURL(site, path), nil)
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
		return jiraHTTPError("jira api request failed", resp)
	}
	return json.NewDecoder(resp.Body).Decode(output)
}

func (c *JiraConnector) post(ctx context.Context, token string, site jiraSite, path string, input any, output any) error {
	payload, err := json.Marshal(input)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.jiraAPIURL(site, path), bytes.NewReader(payload))
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
		return jiraHTTPError("jira api request failed", resp)
	}
	return json.NewDecoder(resp.Body).Decode(output)
}

func jiraHTTPError(prefix string, resp *http.Response) error {
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	message := strings.TrimSpace(string(body))
	if message == "" {
		return fmt.Errorf("%s: %s", prefix, resp.Status)
	}
	return fmt.Errorf("%s: %s: %s", prefix, resp.Status, message)
}

func (c *JiraConnector) jiraAPIURL(site jiraSite, path string) string {
	return c.apiBaseURL + "/ex/jira/" + url.PathEscape(site.CloudID) + path
}

type jiraSite struct {
	CloudID string
	URL     string
}

type jiraAccessibleResource struct {
	ID     string   `json:"id"`
	URL    string   `json:"url"`
	Name   string   `json:"name"`
	Scopes []string `json:"scopes"`
}

func (r jiraAccessibleResource) hasJiraScope() bool {
	for _, scope := range r.Scopes {
		if strings.Contains(scope, "jira") {
			return true
		}
	}
	return false
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
	ID   string `json:"id"`
	Key  string `json:"key"`
	Name string `json:"name"`
}

type jiraSearchResponse struct {
	Issues        []jiraIssue `json:"issues"`
	StartAt       int         `json:"startAt"`
	MaxResults    int         `json:"maxResults"`
	Total         *int        `json:"total"`
	IsLast        *bool       `json:"isLast"`
	NextPageToken string      `json:"nextPageToken"`
}

type jiraProjectSearchResponse struct {
	Values     []jiraProject `json:"values"`
	StartAt    int           `json:"startAt"`
	MaxResults int           `json:"maxResults"`
	Total      *int          `json:"total"`
	IsLast     *bool         `json:"isLast"`
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

func selectedJiraProjectKeys(selection domain.ResourceSelection) []string {
	projectKeys := []string{}
	seen := map[string]bool{}
	for _, resource := range selection.Resources {
		if resource.Type != "" && resource.Type != "project" && resource.Type != "board" {
			continue
		}

		projectKey := strings.TrimSpace(resource.ID)
		if metadataKey, ok := resource.Metadata["projectKey"].(string); ok && strings.TrimSpace(metadataKey) != "" {
			projectKey = strings.TrimSpace(metadataKey)
		}
		if projectKey == "" || seen[projectKey] {
			continue
		}

		seen[projectKey] = true
		projectKeys = append(projectKeys, projectKey)
	}
	return projectKeys
}
