package integrations

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
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
	info          domain.ConnectorInfo
	client        *http.Client
	apiBaseURL    string
	repositories  []string
	organization  string
	appID         string
	appPrivateKey string
	maxPages      int
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
		client:        &http.Client{Timeout: 15 * time.Second},
		apiBaseURL:    envOrDefault("GITHUB_API_BASE_URL", "https://api.github.com"),
		repositories:  parseRepositories(os.Getenv("GITHUB_REPOSITORIES")),
		organization:  envOrDefault("GITHUB_ORGANIZATION", os.Getenv("GITHUB_ORG")),
		appID:         strings.TrimSpace(os.Getenv("GITHUB_APP_ID")),
		appPrivateKey: githubAppPrivateKeyFromEnv(),
		maxPages:      positiveIntOrDefault(os.Getenv("GITHUB_SYNC_MAX_PAGES"), 3),
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

	repositories, err := c.repositoryAccess(ctx, accessToken, c.repositories)
	if err != nil {
		return nil, err
	}

	return c.fetchRecentRecordsForRepositories(ctx, accessToken, repositories)
}

func (c *GitHubConnector) ListSelectableResources(ctx context.Context, _ domain.GatewayContext, token *domain.ProviderToken) ([]domain.SelectableResource, error) {
	accessToken := githubAccessToken(token)
	if accessToken == "" {
		return nil, errGitHubNeedsAuth
	}

	repositories, err := c.repositoryAccess(ctx, accessToken, nil)
	if err != nil {
		return nil, err
	}

	resources := make([]domain.SelectableResource, 0, len(repositories))
	for _, repository := range repositories {
		resources = append(resources, domain.SelectableResource{
			ID:          repository.FullName,
			Type:        "repository",
			Name:        repository.FullName,
			ExternalURL: "https://github.com/" + repository.FullName,
			Metadata: map[string]any{
				"fullName":       repository.FullName,
				"installationId": repository.InstallationID,
			},
		})
	}
	return resources, nil
}

func (c *GitHubConnector) SyncSelected(ctx context.Context, gatewayContext domain.GatewayContext, token *domain.ProviderToken, selection domain.ResourceSelection) (domain.SyncResult, error) {
	accessToken := githubAccessToken(token)
	if accessToken == "" {
		return domain.SyncResult{
			Service: domain.ServiceGitHub,
			Status:  "needs_auth",
			Events:  []domain.WorkEvent{},
		}, nil
	}

	selectedRepositories := selectedGitHubRepositories(selection)
	if len(selectedRepositories) == 0 {
		return domain.SyncResult{
			Service: domain.ServiceGitHub,
			Status:  "needs_selection",
			Events:  []domain.WorkEvent{},
		}, nil
	}

	repositories, err := c.repositoryAccess(ctx, accessToken, selectedRepositories)
	if err != nil {
		return domain.SyncResult{}, err
	}

	records, err := c.fetchRecentRecordsForRepositories(ctx, accessToken, repositories)
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

func (c *GitHubConnector) fetchRecentRecordsForRepositories(ctx context.Context, fallbackToken string, repositories []githubRepositoryAccess) ([]domain.ExternalRecord, error) {
	records := []domain.ExternalRecord{}
	for _, repository := range repositories {
		accessToken := repository.AccessToken
		if accessToken == "" {
			accessToken = fallbackToken
		}

		pulls, err := c.fetchPullRequests(ctx, accessToken, repository.FullName)
		if err != nil {
			return nil, err
		}
		for _, pull := range pulls {
			reviews, err := c.fetchPullReviews(ctx, accessToken, repository.FullName, pull.Number)
			if err != nil {
				return nil, err
			}
			reviewComments, err := c.fetchPullReviewComments(ctx, accessToken, repository.FullName, pull.Number)
			if err != nil {
				return nil, err
			}
			records = append(records, pull.toRecord(repository.FullName, reviews, reviewComments))

			checkRuns, err := c.fetchCheckRuns(ctx, accessToken, repository.FullName, pull.Head.SHA)
			if err != nil {
				return nil, err
			}
			for _, checkRun := range checkRuns {
				if checkRun.isFailed() {
					records = append(records, checkRun.toRecord(repository.FullName, pull.Number))
				}
			}
		}

		issues, err := c.fetchIssues(ctx, accessToken, repository.FullName)
		if err != nil {
			return nil, err
		}
		for _, issue := range issues {
			if issue.PullRequest != nil {
				continue
			}
			records = append(records, issue.toRecord(repository.FullName))
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

func (c *GitHubConnector) fetchRepositories(ctx context.Context, token string) ([]string, error) {
	if c.organization != "" {
		return c.fetchOrganizationRepositories(ctx, token)
	}

	installations, err := c.fetchInstallations(ctx, token)
	if err != nil {
		return nil, err
	}

	seen := map[string]bool{}
	repositories := []string{}
	for _, installation := range installations {
		installationRepositories, err := c.fetchUserInstallationRepositories(ctx, token, installation.ID)
		if err != nil {
			return nil, err
		}
		for _, repository := range installationRepositories {
			if repository.FullName == "" || repository.Archived || seen[repository.FullName] {
				continue
			}
			seen[repository.FullName] = true
			repositories = append(repositories, repository.FullName)
		}
	}

	if len(repositories) == 0 {
		return nil, errGitHubRepositoriesNotConfigured
	}
	return repositories, nil
}

func (c *GitHubConnector) repositoryAccess(ctx context.Context, userToken string, selected []string) ([]githubRepositoryAccess, error) {
	if c.githubAppConfigured() {
		return c.githubAppRepositoryAccess(ctx, userToken, selected)
	}

	repositories := selected
	if len(repositories) == 0 {
		discovered, err := c.fetchRepositories(ctx, userToken)
		if err != nil {
			return nil, err
		}
		repositories = discovered
	}

	access := make([]githubRepositoryAccess, 0, len(repositories))
	for _, repository := range repositories {
		access = append(access, githubRepositoryAccess{FullName: repository, AccessToken: userToken})
	}
	return access, nil
}

func (c *GitHubConnector) githubAppRepositoryAccess(ctx context.Context, userToken string, selected []string) ([]githubRepositoryAccess, error) {
	installations, err := c.fetchInstallations(ctx, userToken)
	if err != nil {
		return nil, err
	}

	selectedSet := map[string]bool{}
	for _, repository := range selected {
		selectedSet[repository] = true
	}

	seen := map[string]bool{}
	access := []githubRepositoryAccess{}
	for _, installation := range installations {
		installationToken, err := c.createInstallationToken(ctx, installation.ID)
		if err != nil {
			return nil, err
		}

		repositories, err := c.fetchInstallationRepositories(ctx, installationToken)
		if err != nil {
			return nil, err
		}
		for _, repository := range repositories {
			if repository.FullName == "" || repository.Archived || seen[repository.FullName] {
				continue
			}
			if c.organization != "" && !strings.HasPrefix(repository.FullName, c.organization+"/") {
				continue
			}
			if len(selectedSet) > 0 && !selectedSet[repository.FullName] {
				continue
			}

			seen[repository.FullName] = true
			access = append(access, githubRepositoryAccess{
				FullName:       repository.FullName,
				InstallationID: installation.ID,
				AccessToken:    installationToken,
			})
		}
	}

	if len(access) == 0 {
		return nil, errGitHubRepositoriesNotConfigured
	}
	return access, nil
}

func (c *GitHubConnector) fetchInstallations(ctx context.Context, token string) ([]githubInstallation, error) {
	installations := []githubInstallation{}
	for page := 1; page <= c.maxPages; page++ {
		var response githubInstallationsResponse
		path := fmt.Sprintf("user/installations?per_page=100&page=%d", page)
		if err := c.get(ctx, token, path, &response); err != nil {
			return nil, err
		}
		installations = append(installations, response.Installations...)
		if len(response.Installations) < 100 {
			break
		}
	}
	return installations, nil
}

func (c *GitHubConnector) fetchUserInstallationRepositories(ctx context.Context, token string, installationID int64) ([]githubRepository, error) {
	repositories := []githubRepository{}
	for page := 1; page <= c.maxPages; page++ {
		var response githubInstallationReposResponse
		path := fmt.Sprintf("user/installations/%d/repositories?per_page=100&page=%d", installationID, page)
		if err := c.get(ctx, token, path, &response); err != nil {
			return nil, err
		}
		repositories = append(repositories, response.Repositories...)
		if len(response.Repositories) < 100 {
			break
		}
	}
	return repositories, nil
}

func (c *GitHubConnector) fetchInstallationRepositories(ctx context.Context, token string) ([]githubRepository, error) {
	repositories := []githubRepository{}
	for page := 1; page <= c.maxPages; page++ {
		var response githubInstallationReposResponse
		path := fmt.Sprintf("installation/repositories?per_page=100&page=%d", page)
		if err := c.get(ctx, token, path, &response); err != nil {
			return nil, err
		}
		repositories = append(repositories, response.Repositories...)
		if len(response.Repositories) < 100 {
			break
		}
	}
	return repositories, nil
}

func (c *GitHubConnector) createInstallationToken(ctx context.Context, installationID int64) (string, error) {
	jwt, err := c.githubAppJWT()
	if err != nil {
		return "", err
	}

	var response struct {
		Token string `json:"token"`
	}
	path := fmt.Sprintf("app/installations/%d/access_tokens", installationID)
	if err := c.post(ctx, jwt, path, nil, &response); err != nil {
		return "", err
	}
	if response.Token == "" {
		return "", errors.New("github app installation token response did not include token")
	}
	return response.Token, nil
}

func (c *GitHubConnector) fetchOrganizationRepositories(ctx context.Context, token string) ([]string, error) {
	repositories := []string{}
	for page := 1; page <= c.maxPages; page++ {
		var pageRepositories []githubRepository
		path := fmt.Sprintf("orgs/%s/repos?type=all&sort=pushed&direction=desc&per_page=100&page=%d", url.PathEscape(c.organization), page)
		if err := c.get(ctx, token, path, &pageRepositories); err != nil {
			return nil, err
		}
		for _, repository := range pageRepositories {
			if repository.FullName != "" && !repository.Archived {
				repositories = append(repositories, repository.FullName)
			}
		}
		if len(pageRepositories) < 100 {
			break
		}
	}
	if len(repositories) == 0 {
		return nil, errGitHubRepositoriesNotConfigured
	}
	return repositories, nil
}

func (c *GitHubConnector) fetchPullRequests(ctx context.Context, token string, repository string) ([]githubPullRequest, error) {
	pulls := []githubPullRequest{}
	for page := 1; page <= c.maxPages; page++ {
		var pagePulls []githubPullRequest
		path := fmt.Sprintf("repos/%s/pulls?state=all&sort=updated&direction=desc&per_page=30&page=%d", repository, page)
		if err := c.get(ctx, token, path, &pagePulls); err != nil {
			return nil, err
		}
		pulls = append(pulls, pagePulls...)
		if len(pagePulls) < 30 {
			break
		}
	}
	return pulls, nil
}

func (c *GitHubConnector) fetchIssues(ctx context.Context, token string, repository string) ([]githubIssue, error) {
	issues := []githubIssue{}
	for page := 1; page <= c.maxPages; page++ {
		var pageIssues []githubIssue
		path := fmt.Sprintf("repos/%s/issues?state=all&sort=updated&direction=desc&per_page=30&page=%d", repository, page)
		if err := c.get(ctx, token, path, &pageIssues); err != nil {
			return nil, err
		}
		issues = append(issues, pageIssues...)
		if len(pageIssues) < 30 {
			break
		}
	}
	return issues, nil
}

func (c *GitHubConnector) fetchPullReviews(ctx context.Context, token string, repository string, pullNumber int) ([]githubPullReview, error) {
	reviews := []githubPullReview{}
	for page := 1; page <= c.maxPages; page++ {
		var pageReviews []githubPullReview
		path := fmt.Sprintf("repos/%s/pulls/%d/reviews?per_page=100&page=%d", repository, pullNumber, page)
		if err := c.get(ctx, token, path, &pageReviews); err != nil {
			return nil, err
		}
		reviews = append(reviews, pageReviews...)
		if len(pageReviews) < 100 {
			break
		}
	}
	return reviews, nil
}

func (c *GitHubConnector) fetchPullReviewComments(ctx context.Context, token string, repository string, pullNumber int) ([]githubPullReviewComment, error) {
	comments := []githubPullReviewComment{}
	for page := 1; page <= c.maxPages; page++ {
		var pageComments []githubPullReviewComment
		path := fmt.Sprintf("repos/%s/pulls/%d/comments?per_page=100&page=%d", repository, pullNumber, page)
		if err := c.get(ctx, token, path, &pageComments); err != nil {
			return nil, err
		}
		comments = append(comments, pageComments...)
		if len(pageComments) < 100 {
			break
		}
	}
	return comments, nil
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

func (c *GitHubConnector) post(ctx context.Context, token string, path string, input any, output any) error {
	var body strings.Reader
	if input != nil {
		payload, err := json.Marshal(input)
		if err != nil {
			return err
		}
		body = *strings.NewReader(string(payload))
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(c.apiBaseURL, "/")+"/"+path, &body)
	if err != nil {
		return err
	}

	req.Header.Set("accept", "application/vnd.github+json")
	req.Header.Set("authorization", "Bearer "+token)
	req.Header.Set("content-type", "application/json")
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

	if output == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(output)
}

func (c *GitHubConnector) githubAppConfigured() bool {
	return c.appID != "" && strings.TrimSpace(c.appPrivateKey) != ""
}

func (c *GitHubConnector) githubAppJWT() (string, error) {
	privateKey, err := parseGitHubAppPrivateKey(c.appPrivateKey)
	if err != nil {
		return "", err
	}

	now := time.Now().UTC()
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","typ":"JWT"}`))
	payloadBytes, err := json.Marshal(map[string]any{
		"iat": now.Add(-60 * time.Second).Unix(),
		"exp": now.Add(9 * time.Minute).Unix(),
		"iss": c.appID,
	})
	if err != nil {
		return "", err
	}
	payload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	unsigned := header + "." + payload
	sum := sha256.Sum256([]byte(unsigned))
	signature, err := rsa.SignPKCS1v15(rand.Reader, privateKey, crypto.SHA256, sum[:])
	if err != nil {
		return "", err
	}

	return unsigned + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}

func parseGitHubAppPrivateKey(value string) (*rsa.PrivateKey, error) {
	key := strings.TrimSpace(strings.ReplaceAll(value, `\n`, "\n"))
	if key == "" {
		return nil, errors.New("github app private key is required")
	}
	if !strings.Contains(key, "BEGIN") {
		decoded, err := base64.StdEncoding.DecodeString(key)
		if err != nil {
			return nil, errors.New("github app private key must be PEM or base64-encoded PEM")
		}
		key = string(decoded)
	}

	block, _ := pem.Decode([]byte(key))
	if block == nil {
		return nil, errors.New("github app private key PEM could not be decoded")
	}
	if parsed, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return parsed, nil
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	privateKey, ok := parsed.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("github app private key must be RSA")
	}
	return privateKey, nil
}

type githubUser struct {
	Login string `json:"login"`
}

type githubRepository struct {
	FullName string `json:"full_name"`
	Archived bool   `json:"archived"`
}

type githubRepositoryAccess struct {
	FullName       string
	InstallationID int64
	AccessToken    string
}

type githubInstallationsResponse struct {
	Installations []githubInstallation `json:"installations"`
}

type githubInstallation struct {
	ID int64 `json:"id"`
}

type githubInstallationReposResponse struct {
	Repositories []githubRepository `json:"repositories"`
}

type githubPullRequest struct {
	ID                 int64        `json:"id"`
	Number             int          `json:"number"`
	State              string       `json:"state"`
	Title              string       `json:"title"`
	HTMLURL            string       `json:"html_url"`
	User               githubUser   `json:"user"`
	CreatedAt          time.Time    `json:"created_at"`
	UpdatedAt          time.Time    `json:"updated_at"`
	MergedAt           *time.Time   `json:"merged_at"`
	RequestedReviewers []githubUser `json:"requested_reviewers"`
	Head               struct {
		SHA string `json:"sha"`
	} `json:"head"`
}

type githubPullReview struct {
	ID          int64      `json:"id"`
	State       string     `json:"state"`
	User        githubUser `json:"user"`
	SubmittedAt time.Time  `json:"submitted_at"`
}

type githubPullReviewComment struct {
	ID        int64      `json:"id"`
	User      githubUser `json:"user"`
	CreatedAt time.Time  `json:"created_at"`
}

func (p githubPullRequest) toRecord(repository string, reviews []githubPullReview, reviewComments []githubPullReviewComment) domain.ExternalRecord {
	eventType := "pull_request.opened"
	priority := "medium"
	summary := "A pull request changed and may need attention."
	occurredAt := p.UpdatedAt
	reviewers := githubReviewers(reviews)
	timeToFirstReviewHours := githubTimeToFirstReviewHours(p.CreatedAt, reviews)
	leadTimeHours := 0.0

	if p.MergedAt != nil {
		eventType = "pull_request.merged"
		summary = "A pull request was merged into the codebase."
		occurredAt = *p.MergedAt
		if !p.CreatedAt.IsZero() {
			leadTimeHours = p.MergedAt.Sub(p.CreatedAt).Hours()
		}
	} else if len(p.RequestedReviewers) > 0 || len(reviews) == 0 {
		eventType = "review.requested"
		priority = "high"
		summary = "A pull request is waiting for review."
	} else if len(reviews) > 0 {
		eventType = "pull_request.reviewed"
		summary = "A pull request received review activity."
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
			"metrics": map[string]any{
				"reviewCount":            len(reviews),
				"reviewCommentCount":     len(reviewComments),
				"reviewerCount":          len(reviewers),
				"reviewers":              reviewers,
				"leadTimeHours":          leadTimeHours,
				"timeToFirstReviewHours": timeToFirstReviewHours,
			},
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

func githubAppPrivateKeyFromEnv() string {
	if value := strings.TrimSpace(os.Getenv("GITHUB_APP_PRIVATE_KEY")); value != "" {
		return value
	}
	if value := strings.TrimSpace(os.Getenv("GITHUB_APP_PRIVATE_KEY_BASE64")); value != "" {
		return value
	}
	return ""
}

func selectedGitHubRepositories(selection domain.ResourceSelection) []string {
	repositories := []string{}
	seen := map[string]bool{}
	for _, resource := range selection.Resources {
		if resource.Type != "" && resource.Type != "repository" {
			continue
		}

		repository := strings.TrimSpace(resource.ID)
		if fullName, ok := resource.Metadata["fullName"].(string); ok && strings.TrimSpace(fullName) != "" {
			repository = strings.TrimSpace(fullName)
		}
		if repository == "" || seen[repository] {
			continue
		}

		seen[repository] = true
		repositories = append(repositories, repository)
	}
	return repositories
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

func positiveIntOrDefault(value string, fallback int) int {
	parsed, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func githubReviewers(reviews []githubPullReview) []string {
	seen := map[string]bool{}
	reviewers := []string{}
	for _, review := range reviews {
		if review.User.Login == "" || seen[review.User.Login] {
			continue
		}
		seen[review.User.Login] = true
		reviewers = append(reviewers, review.User.Login)
	}
	return reviewers
}

func githubTimeToFirstReviewHours(createdAt time.Time, reviews []githubPullReview) float64 {
	if createdAt.IsZero() || len(reviews) == 0 {
		return 0
	}

	var firstReview *time.Time
	for _, review := range reviews {
		if review.SubmittedAt.IsZero() {
			continue
		}
		submittedAt := review.SubmittedAt
		if firstReview == nil || submittedAt.Before(*firstReview) {
			firstReview = &submittedAt
		}
	}
	if firstReview == nil {
		return 0
	}
	return firstReview.Sub(createdAt).Hours()
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
