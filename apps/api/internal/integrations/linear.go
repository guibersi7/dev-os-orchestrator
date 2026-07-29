package integrations

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/developer-os/api/internal/domain"
)

type LinearConnector struct {
	info       domain.ConnectorInfo
	client     *http.Client
	apiBaseURL string
}

func NewLinearConnector() Connector {
	return &LinearConnector{
		info: domain.ConnectorInfo{
			ID:           domain.ServiceLinear,
			Name:         "Linear",
			AuthStrategy: "oauth",
			SyncMode:     "webhook_first",
			Capabilities: []string{"oauth", "webhooks", "initial_sync", "write_back"},
			Objects:      []string{"teams", "projects", "cycles", "issues", "comments"},
		},
		client:     &http.Client{Timeout: 15 * time.Second},
		apiBaseURL: envOrDefault("LINEAR_API_BASE_URL", "https://api.linear.app/graphql"),
	}
}

func (c *LinearConnector) Info() domain.ConnectorInfo {
	return c.info
}

func (c *LinearConnector) FetchRecentRecords(ctx context.Context, _ domain.GatewayContext, token *domain.ProviderToken) ([]domain.ExternalRecord, error) {
	accessToken := linearAccessToken(token)
	if accessToken == "" {
		return nil, errLinearNeedsAuth
	}

	issues, err := c.fetchIssues(ctx, accessToken)
	if err != nil {
		return nil, err
	}

	records := make([]domain.ExternalRecord, 0, len(issues))
	for _, issue := range issues {
		records = append(records, issue.toRecord())
	}

	return records, nil
}

func (c *LinearConnector) Normalize(records []domain.ExternalRecord) []domain.WorkEvent {
	events := make([]domain.WorkEvent, 0, len(records))
	for _, record := range records {
		eventType, _ := record.Payload["eventType"].(string)
		priority, _ := record.Payload["priority"].(string)
		source, _ := record.Payload["source"].(string)
		summary, _ := record.Payload["summary"].(string)

		events = append(events, domain.WorkEvent{
			ID:         "evt-" + record.ID,
			ExternalID: record.ID,
			Service:    domain.ServiceLinear,
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

func (c *LinearConnector) Sync(ctx context.Context, gatewayContext domain.GatewayContext, token *domain.ProviderToken) (domain.SyncResult, error) {
	records, err := c.FetchRecentRecords(ctx, gatewayContext, token)
	if errors.Is(err, errLinearNeedsAuth) {
		return domain.SyncResult{Service: domain.ServiceLinear, Status: "needs_auth", Events: []domain.WorkEvent{}}, nil
	}
	if err != nil {
		return domain.SyncResult{}, err
	}

	events := c.Normalize(records)
	cursor := latestRecordCursor(records)

	return domain.SyncResult{
		Service:        domain.ServiceLinear,
		Status:         "connected",
		RecordsScanned: len(records),
		EventsCreated:  len(events),
		NextCursor:     cursor,
		Events:         events,
	}, nil
}

func (c *LinearConnector) fetchIssues(ctx context.Context, token string) ([]linearIssue, error) {
	var response struct {
		Data struct {
			Issues struct {
				Nodes []linearIssue `json:"nodes"`
			} `json:"issues"`
		} `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}

	query := `query DeveloperOSIssues($first: Int!) {
  issues(first: $first, orderBy: updatedAt) {
    nodes {
      id
      identifier
      title
      url
      priority
      priorityLabel
      createdAt
      updatedAt
      completedAt
      canceledAt
      assignee { name }
      state { name type }
      team { name key }
      project { name }
      cycle { name number }
      comments(first: 5) {
        nodes {
          id
          body
          createdAt
          user { name }
        }
      }
    }
  }
}`

	if err := c.graphql(ctx, token, query, map[string]any{"first": 50}, &response); err != nil {
		return nil, err
	}
	if len(response.Errors) > 0 {
		return nil, fmt.Errorf("linear graphql failed: %s", response.Errors[0].Message)
	}

	return response.Data.Issues.Nodes, nil
}

func (c *LinearConnector) graphql(ctx context.Context, token string, query string, variables map[string]any, output any) error {
	payload, err := json.Marshal(map[string]any{
		"query":     query,
		"variables": variables,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.apiBaseURL, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("authorization", "Bearer "+token)
	req.Header.Set("content-type", "application/json")
	req.Header.Set("accept", "application/json")
	req.Header.Set("user-agent", "developer-os-api")

	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("linear api request failed: %s", resp.Status)
	}

	return json.NewDecoder(resp.Body).Decode(output)
}

type linearIssue struct {
	ID            string      `json:"id"`
	Identifier    string      `json:"identifier"`
	Title         string      `json:"title"`
	URL           string      `json:"url"`
	Priority      int         `json:"priority"`
	PriorityLabel string      `json:"priorityLabel"`
	CreatedAt     time.Time   `json:"createdAt"`
	UpdatedAt     time.Time   `json:"updatedAt"`
	CompletedAt   *time.Time  `json:"completedAt"`
	CanceledAt    *time.Time  `json:"canceledAt"`
	Assignee      *linearUser `json:"assignee"`
	State         linearState `json:"state"`
	Team          linearTeam  `json:"team"`
	Project       *struct {
		Name string `json:"name"`
	} `json:"project"`
	Cycle *struct {
		Name   string `json:"name"`
		Number int    `json:"number"`
	} `json:"cycle"`
	Comments struct {
		Nodes []linearComment `json:"nodes"`
	} `json:"comments"`
}

type linearUser struct {
	Name string `json:"name"`
}

type linearState struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type linearTeam struct {
	Name string `json:"name"`
	Key  string `json:"key"`
}

type linearComment struct {
	ID        string      `json:"id"`
	Body      string      `json:"body"`
	CreatedAt time.Time   `json:"createdAt"`
	User      *linearUser `json:"user"`
}

func (i linearIssue) toRecord() domain.ExternalRecord {
	eventType, priority, summary := classifyLinearIssue(i)
	occurredAt := i.UpdatedAt
	if i.CompletedAt != nil {
		occurredAt = *i.CompletedAt
	}
	if i.CanceledAt != nil {
		occurredAt = *i.CanceledAt
	}

	actor := "Linear"
	if i.Assignee != nil && i.Assignee.Name != "" {
		actor = i.Assignee.Name
	}

	source := "Linear"
	if i.Team.Key != "" {
		source = "Linear · " + i.Team.Key
	}

	externalID := fmt.Sprintf("linear:%s:%s:%s", i.Identifier, eventType, occurredAt.Format(time.RFC3339))
	return domain.ExternalRecord{
		ID:          externalID,
		ExternalURL: i.URL,
		Title:       i.Identifier + " " + i.Title,
		Actor:       actor,
		UpdatedAt:   occurredAt,
		Payload: map[string]any{
			"eventType":      eventType,
			"priority":       priority,
			"source":         source,
			"summary":        summary,
			"identifier":     i.Identifier,
			"url":            i.URL,
			"state":          i.State.Name,
			"stateType":      i.State.Type,
			"priorityLabel":  i.PriorityLabel,
			"linearPriority": i.Priority,
			"team":           i.Team.Name,
			"project":        linearProjectName(i),
			"cycle":          linearCycleName(i),
			"commentCount":   len(i.Comments.Nodes),
			"linkedRefs":     extractLinearLinkedRefs(i),
		},
	}
}

func classifyLinearIssue(issue linearIssue) (string, string, string) {
	stateName := strings.ToLower(issue.State.Name)
	stateType := strings.ToLower(issue.State.Type)
	commentText := strings.ToLower(linearCommentsText(issue.Comments.Nodes))

	if issue.CompletedAt != nil || stateType == "completed" {
		return "linear.issue.completed", "medium", "A Linear issue was completed."
	}
	if strings.Contains(stateName, "block") || strings.Contains(commentText, "blocked") || strings.Contains(commentText, "bloqueado") {
		return "linear.issue.blocked", "high", "A Linear issue appears blocked or waiting on a dependency."
	}
	if issue.Priority <= 2 && issue.Priority > 0 {
		return "linear.issue.prioritized", "high", "A high-priority Linear issue needs attention."
	}
	if stateType == "started" {
		return "linear.issue.started", "medium", "A Linear issue moved into active work."
	}

	return "linear.issue.updated", "medium", "A Linear issue changed."
}

func linearProjectName(issue linearIssue) string {
	if issue.Project == nil {
		return ""
	}
	return issue.Project.Name
}

func linearCycleName(issue linearIssue) string {
	if issue.Cycle == nil {
		return ""
	}
	if issue.Cycle.Name != "" {
		return issue.Cycle.Name
	}
	if issue.Cycle.Number > 0 {
		return fmt.Sprintf("Cycle %d", issue.Cycle.Number)
	}
	return ""
}

func linearCommentsText(comments []linearComment) string {
	parts := make([]string, 0, len(comments))
	for _, comment := range comments {
		parts = append(parts, comment.Body)
	}
	return strings.Join(parts, "\n")
}

func extractLinearLinkedRefs(issue linearIssue) []string {
	text := issue.URL + " " + linearCommentsText(issue.Comments.Nodes)
	return extractLinkedRefs(text)
}

var errLinearNeedsAuth = errors.New("linear integration token is required")

func linearAccessToken(token *domain.ProviderToken) string {
	if token != nil && token.AccessToken != "" {
		return token.AccessToken
	}

	return strings.TrimSpace(os.Getenv("LINEAR_ACCESS_TOKEN"))
}
