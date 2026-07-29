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

type GitHubConnector struct {
	info         domain.ConnectorInfo
	client       *http.Client
	apiBaseURL   string
	repositories []string
}

func NewGitHubConnector() Connector {
	return &GitHubConnector{
		info: domain.ConnectorInfo{
			ID:           domain.ServiceGitHub,
			Name:         "GitHub",
			AuthStrategy: "oauth",
			SyncMode:     "webhook_first",
			Capabilities: []string{"oauth", "webhooks", "initial_sync", "semantic_context"},
			Objects:      []string{"pull_requests", "issues", "commits", "reviews", "checks", "releases"},
		},
		client:       &http.Client{Timeout: 15 * time.Second},
		apiBaseURL:   envOrDefault("GITHUB_API_BASE_URL", "https://api.github.com"),
		repositories: parseRepositories(os.Getenv("GITHUB_REPOSITORIES")),
	}
}

func (c *GitHubConnector) Info() domain.ConnectorInfo {
	return c.info
}

func (c *GitHubConnector) FetchRecentRecords(ctx context.Context, _ domain.GatewayContext, token *domain.ProviderToken) ([]domain.ExternalRecord, error) {
	accessToken := githubAccessToken(token)
	if accessToken == "" {
		return nil, errGitHubNeedsAuth
	}

	repositories := c.repositories
	if len(repositories) == 0 {
		return nil, errGitHubRepositoriesNotConfigured
	}

	records := []domain.ExternalRecord{}
	for _, repository := range repositories {
		pulls, err := c.fetchPullRequests(ctx, accessToken, repository)
		if err != nil {
			return nil, err
		}
		for _, pull := range pulls {
			records = append(records, pull.toRecord(repository))

			checkRuns, err := c.fetchCheckRuns(ctx, accessToken, repository, pull.Head.SHA)
			if err != nil {
				return nil, err
			}
			for _, checkRun := range checkRuns {
				if checkRun.isFailed() {
					records = append(records, checkRun.toRecord(repository, pull.Number))
				}
			}
		}

		issues, err := c.fetchIssues(ctx, accessToken, repository)
		if err != nil {
			return nil, err
		}
		for _, issue := range issues {
			if issue.PullRequest != nil {
				continue
			}
			records = append(records, issue.toRecord(repository))
		}
	}

	return records, nil
}

func (c *GitHubConnector) Normalize(records []domain.ExternalRecord) []domain.WorkEvent {
	events := make([]domain.WorkEvent, 0, len(records))
	for _, record := range records {
		eventType, _ := record.Payload["eventType"].(string)
		priority, _ := record.Payload["priority"].(string)
		repository, _ := record.Payload["repository"].(string)
		summary, _ := record.Payload["summary"].(string)

		if priority == "" {
			priority = "medium"
		}
		if summary == "" {
			summary = "GitHub activity was normalized into the shared work event stream."
		}

		events = append(events, domain.WorkEvent{
			ID:         "evt-" + record.ID,
			ExternalID: record.ID,
			Service:    domain.ServiceGitHub,
			Type:       eventType,
			Title:      record.Title,
			Source:     "GitHub · " + repository,
			Actor:      record.Actor,
			Priority:   priority,
			Summary:    summary,
			OccurredAt: record.UpdatedAt,
			Raw:        record.Payload,
		})
	}

	return events
}

func (c *GitHubConnector) Sync(ctx context.Context, gatewayContext domain.GatewayContext, token *domain.ProviderToken) (domain.SyncResult, error) {
	records, err := c.FetchRecentRecords(ctx, gatewayContext, token)
	if errors.Is(err, errGitHubNeedsAuth) {
		return domain.SyncResult{
			Service: domain.ServiceGitHub,
			Status:  "needs_auth",
			Events:  []domain.WorkEvent{},
		}, nil
	}
	if errors.Is(err, errGitHubRepositoriesNotConfigured) {
		return domain.SyncResult{
			Service: domain.ServiceGitHub,
			Status:  "needs_repository_selection",
			Events:  []domain.WorkEvent{},
		}, nil
	}
	if err != nil {
		return domain.SyncResult{}, err
	}

	events := c.Normalize(records)
	cursor := latestRecordCursor(records)

	return domain.SyncResult{
		Service:        domain.ServiceGitHub,
		Status:         "connected",
		RecordsScanned: len(records),
		EventsCreated:  len(events),
		NextCursor:     cursor,
		Events:         events,
	}, nil
}

func (c *GitHubConnector) fetchPullRequests(ctx context.Context, token string, repository string) ([]githubPullRequest, error) {
	var pulls []githubPullRequest
	path := fmt.Sprintf("repos/%s/pulls?state=all&sort=updated&direction=desc&per_page=30", repository)
	if err := c.get(ctx, token, path, &pulls); err != nil {
		return nil, err
	}
	return pulls, nil
}

func (c *GitHubConnector) fetchIssues(ctx context.Context, token string, repository string) ([]githubIssue, error) {
	var issues []githubIssue
	path := fmt.Sprintf("repos/%s/issues?state=all&sort=updated&direction=desc&per_page=30", repository)
	if err := c.get(ctx, token, path, &issues); err != nil {
		return nil, err
	}
	return issues, nil
}

func (c *GitHubConnector) fetchCheckRuns(ctx context.Context, token string, repository string, ref string) ([]githubCheckRun, error) {
	if ref == "" {
		return []githubCheckRun{}, nil
	}

	var response struct {
		CheckRuns []githubCheckRun `json:"check_runs"`
	}
	path := fmt.Sprintf("repos/%s/commits/%s/check-runs?per_page=30", repository, url.PathEscape(ref))
	if err := c.get(ctx, token, path, &response); err != nil {
		return nil, err
	}
	return response.CheckRuns, nil
}

func (c *GitHubConnector) get(ctx context.Context, token string, path string, output any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(c.apiBaseURL, "/")+"/"+path, nil)
	if err != nil {
		return err
	}

	req.Header.Set("accept", "application/vnd.github+json")
	req.Header.Set("authorization", "Bearer "+token)
	req.Header.Set("x-github-api-version", "2022-11-28")
	req.Header.Set("user-agent", "developer-os-api")

	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("github api request failed: %s", resp.Status)
	}

	return json.NewDecoder(resp.Body).Decode(output)
}

type githubUser struct {
	Login string `json:"login"`
}

type githubPullRequest struct {
	ID                 int64        `json:"id"`
	Number             int          `json:"number"`
	State              string       `json:"state"`
	Title              string       `json:"title"`
	HTMLURL            string       `json:"html_url"`
	User               githubUser   `json:"user"`
	UpdatedAt          time.Time    `json:"updated_at"`
	MergedAt           *time.Time   `json:"merged_at"`
	RequestedReviewers []githubUser `json:"requested_reviewers"`
	Head               struct {
		SHA string `json:"sha"`
	} `json:"head"`
}

func (p githubPullRequest) toRecord(repository string) domain.ExternalRecord {
	eventType := "pull_request.opened"
	priority := "medium"
	summary := "A pull request changed and may need attention."
	occurredAt := p.UpdatedAt

	if p.MergedAt != nil {
		eventType = "pull_request.merged"
		summary = "A pull request was merged into the codebase."
		occurredAt = *p.MergedAt
	} else if len(p.RequestedReviewers) > 0 {
		eventType = "review.requested"
		priority = "high"
		summary = "A pull request is waiting for review."
	}

	externalID := fmt.Sprintf("github:%s:pr:%d:%s:%s", repository, p.Number, eventType, occurredAt.Format(time.RFC3339))
	return domain.ExternalRecord{
		ID:          externalID,
		ExternalURL: p.HTMLURL,
		Title:       fmt.Sprintf("#%d %s", p.Number, p.Title),
		Actor:       p.User.Login,
		UpdatedAt:   occurredAt,
		Payload: map[string]any{
			"eventType":  eventType,
			"priority":   priority,
			"repository": repository,
			"summary":    summary,
			"number":     p.Number,
			"state":      p.State,
			"url":        p.HTMLURL,
		},
	}
}

type githubIssue struct {
	ID          int64          `json:"id"`
	Number      int            `json:"number"`
	State       string         `json:"state"`
	Title       string         `json:"title"`
	HTMLURL     string         `json:"html_url"`
	User        githubUser     `json:"user"`
	UpdatedAt   time.Time      `json:"updated_at"`
	ClosedAt    *time.Time     `json:"closed_at"`
	Assignees   []githubUser   `json:"assignees"`
	PullRequest map[string]any `json:"pull_request"`
}

func (i githubIssue) toRecord(repository string) domain.ExternalRecord {
	eventType := "issue.updated"
	priority := "medium"
	summary := "An issue changed in GitHub."
	occurredAt := i.UpdatedAt

	if i.ClosedAt != nil {
		eventType = "issue.closed"
		summary = "An issue was closed."
		occurredAt = *i.ClosedAt
	} else if len(i.Assignees) > 0 {
		eventType = "issue.assigned"
		summary = "An assigned issue needs delivery attention."
	}

	externalID := fmt.Sprintf("github:%s:issue:%d:%s:%s", repository, i.Number, eventType, occurredAt.Format(time.RFC3339))
	return domain.ExternalRecord{
		ID:          externalID,
		ExternalURL: i.HTMLURL,
		Title:       fmt.Sprintf("#%d %s", i.Number, i.Title),
		Actor:       i.User.Login,
		UpdatedAt:   occurredAt,
		Payload: map[string]any{
			"eventType":  eventType,
			"priority":   priority,
			"repository": repository,
			"summary":    summary,
			"number":     i.Number,
			"state":      i.State,
			"url":        i.HTMLURL,
		},
	}
}

type githubCheckRun struct {
	ID          int64      `json:"id"`
	Name        string     `json:"name"`
	HTMLURL     string     `json:"html_url"`
	Status      string     `json:"status"`
	Conclusion  string     `json:"conclusion"`
	CompletedAt *time.Time `json:"completed_at"`
	StartedAt   *time.Time `json:"started_at"`
}

func (c githubCheckRun) isFailed() bool {
	switch c.Conclusion {
	case "failure", "timed_out", "cancelled", "action_required":
		return true
	default:
		return false
	}
}

func (c githubCheckRun) toRecord(repository string, pullNumber int) domain.ExternalRecord {
	occurredAt := time.Now().UTC()
	if c.CompletedAt != nil {
		occurredAt = *c.CompletedAt
	} else if c.StartedAt != nil {
		occurredAt = *c.StartedAt
	}

	externalID := fmt.Sprintf("github:%s:pr:%d:check:%d:%s", repository, pullNumber, c.ID, occurredAt.Format(time.RFC3339))
	return domain.ExternalRecord{
		ID:          externalID,
		ExternalURL: c.HTMLURL,
		Title:       fmt.Sprintf("Check failed on PR #%d: %s", pullNumber, c.Name),
		Actor:       "GitHub Actions",
		UpdatedAt:   occurredAt,
		Payload: map[string]any{
			"eventType":  "check.failed",
			"priority":   "high",
			"repository": repository,
			"summary":    "A GitHub check run failed and may be blocking delivery.",
			"checkName":  c.Name,
			"status":     c.Status,
			"conclusion": c.Conclusion,
			"url":        c.HTMLURL,
			"pullNumber": pullNumber,
		},
	}
}

var (
	errGitHubNeedsAuth                 = errors.New("github integration token is required")
	errGitHubRepositoriesNotConfigured = errors.New("github repositories are not configured")
)

func githubAccessToken(token *domain.ProviderToken) string {
	if token != nil && token.AccessToken != "" {
		return token.AccessToken
	}

	return strings.TrimSpace(os.Getenv("GITHUB_ACCESS_TOKEN"))
}

func parseRepositories(value string) []string {
	parts := strings.Split(value, ",")
	repositories := make([]string, 0, len(parts))
	for _, part := range parts {
		repository := strings.TrimSpace(part)
		if repository == "" || !strings.Contains(repository, "/") {
			continue
		}
		repositories = append(repositories, repository)
	}
	return repositories
}

func latestRecordCursor(records []domain.ExternalRecord) *string {
	if len(records) == 0 {
		return nil
	}

	latest := records[0].UpdatedAt
	for _, record := range records[1:] {
		if record.UpdatedAt.After(latest) {
			latest = record.UpdatedAt
		}
	}

	cursor := strconv.FormatInt(latest.Unix(), 10)
	return &cursor
}

func envOrDefault(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}
