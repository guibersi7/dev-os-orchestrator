# GitHub App (user-to-server) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch the GitHub integration's repository discovery from the OAuth-App `/user/repos` call to the GitHub-App installation endpoints, so a non-expiring user-to-server token lists every repo across the user's profile and organizations.

**Architecture:** Reuse the existing OAuth authorize/exchange flow unchanged. Only `fetchRepositories` in the GitHub connector changes: it now lists the token's app installations (`/user/installations`) and, for each, that installation's repositories (`/user/installations/{id}/repositories`), flattening and de-duplicating. The legacy `GITHUB_ORGANIZATION` override is preserved as an explicit branch. Provider scopes default to empty because GitHub Apps ignore the OAuth `scope` parameter. Credentials are swapped on Render after the code ships.

**Tech Stack:** Go 1.22 (stdlib only), `net/http/httptest` for tests. Working branch: `feature/github-app-user-to-server`.

**Spec:** `docs/superpowers/specs/2026-08-01-github-app-user-to-server-design.md`

---

### Task 1: Installation-based repository discovery

**Files:**
- Modify: `apps/api/internal/integrations/github.go` — `fetchRepositories` (currently lines 240-264) and new response structs near `githubRepository` (currently lines 373-376)
- Test: `apps/api/internal/integrations/github_test.go` — update `TestGitHubSyncDiscoversAuthenticatedUserRepositories` (lines 32-80) and add a new test

- [ ] **Step 1: Update the existing sync test to mock installation endpoints**

In `apps/api/internal/integrations/github_test.go`, replace the `case "/user/repos":` block (lines 36-40) inside `TestGitHubSyncDiscoversAuthenticatedUserRepositories` with these two cases (leave the `/repos/owner/repo/pulls` and `/repos/owner/repo/issues` cases as-is):

```go
		case "/user/installations":
			writeJSON(t, w, map[string]any{
				"total_count": 1,
				"installations": []map[string]any{
					{"id": 42},
				},
			})
		case "/user/installations/42/repositories":
			writeJSON(t, w, map[string]any{
				"total_count": 2,
				"repositories": []map[string]any{
					{"full_name": "owner/repo", "archived": false},
					{"full_name": "owner/archived", "archived": true},
				},
			})
```

- [ ] **Step 2: Add a focused discovery test (multiple installations, dedupe, archived filtering)**

Add `reflect` to the import block in `apps/api/internal/integrations/github_test.go` (it currently imports `context`, `encoding/json`, `net/http`, `net/http/httptest`, `testing`, `time`, and the `domain` package). Then append this test to the file:

```go
func TestGitHubFetchRepositoriesFlattensInstallations(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/user/installations":
			writeJSON(t, w, map[string]any{
				"total_count": 2,
				"installations": []map[string]any{
					{"id": 1},
					{"id": 2},
				},
			})
		case "/user/installations/1/repositories":
			writeJSON(t, w, map[string]any{
				"total_count": 2,
				"repositories": []map[string]any{
					{"full_name": "acme/api", "archived": false},
					{"full_name": "acme/legacy", "archived": true},
				},
			})
		case "/user/installations/2/repositories":
			writeJSON(t, w, map[string]any{
				"total_count": 2,
				"repositories": []map[string]any{
					{"full_name": "acme/api", "archived": false},
					{"full_name": "personal/site", "archived": false},
				},
			})
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	connector := &GitHubConnector{
		info:       NewGitHubConnector().Info(),
		client:     server.Client(),
		apiBaseURL: server.URL,
		maxPages:   1,
	}

	repositories, err := connector.fetchRepositories(context.Background(), "token")
	if err != nil {
		t.Fatal(err)
	}

	want := []string{"acme/api", "personal/site"}
	if !reflect.DeepEqual(repositories, want) {
		t.Fatalf("expected %v, got %v", want, repositories)
	}
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/api && go test ./internal/integrations/ -run 'TestGitHubSyncDiscoversAuthenticatedUserRepositories|TestGitHubFetchRepositoriesFlattensInstallations' -v`
Expected: FAIL — `TestGitHubSyncDiscoversAuthenticatedUserRepositories` hits `t.Fatalf("unexpected path /user/installations")` (current code still calls `/user/repos`), and `TestGitHubFetchRepositoriesFlattensInstallations` fails the same way.

- [ ] **Step 4: Add the installation response structs**

In `apps/api/internal/integrations/github.go`, immediately after the `githubRepository` struct (currently lines 373-376), add:

```go
type githubInstallationsResponse struct {
	Installations []githubInstallation `json:"installations"`
}

type githubInstallation struct {
	ID int64 `json:"id"`
}

type githubInstallationReposResponse struct {
	Repositories []githubRepository `json:"repositories"`
}
```

- [ ] **Step 5: Replace `fetchRepositories` with installation-based discovery**

In `apps/api/internal/integrations/github.go`, replace the entire `fetchRepositories` function (currently lines 240-264) with:

```go
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
		installationRepositories, err := c.fetchInstallationRepositories(ctx, token, installation.ID)
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

func (c *GitHubConnector) fetchInstallationRepositories(ctx context.Context, token string, installationID int64) ([]githubRepository, error) {
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
```

Note: the `net/url` import stays in use via `fetchOrganizationRepositories` (`url.PathEscape`).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/api && go test ./internal/integrations/ -run 'TestGitHubSyncDiscoversAuthenticatedUserRepositories|TestGitHubFetchRepositoriesFlattensInstallations' -v`
Expected: PASS (both tests)

- [ ] **Step 7: Run the full integrations package tests**

Run: `cd apps/api && go test ./internal/integrations/`
Expected: `ok  github.com/developer-os/api/internal/integrations`

- [ ] **Step 8: Commit**

```bash
git add apps/api/internal/integrations/github.go apps/api/internal/integrations/github_test.go
git commit -m "Discover GitHub repos via app installation endpoints

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Drop the default OAuth scopes for GitHub

**Files:**
- Modify: `apps/api/internal/oauth/providers.go:29`

GitHub Apps ignore the OAuth `scope` parameter, so the default `repo, read:user, read:org` should not be sent. `splitScopes` returns an empty slice when both the env value and fallback are empty, and `AuthorizationURL` only appends `scope` when the slice is non-empty.

- [ ] **Step 1: Change the GitHub provider scope default to empty**

In `apps/api/internal/oauth/providers.go`, replace line 29:

```go
			Scopes:       splitScopes(os.Getenv("GITHUB_OAUTH_SCOPES"), []string{"repo", "read:user", "read:org"}),
```

with:

```go
			Scopes:       splitScopes(os.Getenv("GITHUB_OAUTH_SCOPES"), nil),
```

- [ ] **Step 2: Build and run the full API test suite**

Run: `cd apps/api && go build ./cmd/api && go test ./...`
Expected: build succeeds; all packages report `ok` or `[no test files]`. No test asserts the old default scopes (verified during planning), so nothing else needs updating.

- [ ] **Step 3: Commit**

```bash
git add apps/api/internal/oauth/providers.go
git commit -m "Stop sending ignored OAuth scopes for GitHub App

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run tests and build exactly as CI/Render would**

Run: `cd apps/api && go test ./... && CGO_ENABLED=0 GOOS=linux go build -o /tmp/devos-api ./cmd/api && echo BUILD_OK`
Expected: all packages `ok`/`[no test files]`, then `BUILD_OK`.

- [ ] **Step 2: Confirm the working tree is clean**

Run: `git status --porcelain`
Expected: empty output (all changes committed across Tasks 1-2).

---

## Post-merge manual rollout (not code — operator steps)

These are done by the operator after the branch is merged; they are documented in the spec's "Rollout & verification" section and are not automated by this plan:

1. On Render (`standup-api` → Environment): replace `GITHUB_CLIENT_ID` with `Iv23liHiuHYbO3b7JRtC` and `GITHUB_CLIENT_SECRET` with the GitHub App's client secret. Save → wait for redeploy → `/health` returns ok.
2. Ensure the GitHub App is **installed** on the profile/orgs (All repositories or selected) — installation is what makes `/user/installations/{id}/repositories` return data.
3. (Optional) Revoke the old OAuth App authorization at `github.com/settings/applications`.
4. Connect GitHub via the app → confirm a row in Supabase `integration_tokens`.
5. `GET /v1/connections/github/resources` now lists organization repos.
6. Select a repo with activity → `POST /v1/sync` → verify `work_events` rows in Supabase.

---

## Self-Review

- **Spec coverage:** §3a repo discovery → Task 1. §3b scopes → Task 2. §4 testing → Task 1 (updated + new test), Task 3 (full suite + build). §3c env swap + §5 rollout → post-merge manual section (correctly not code). Out-of-scope items (JWT/installation tokens, refresh, webhooks) → not present. ✅
- **Placeholder scan:** No TBD/TODO; every code step shows complete code and exact commands. ✅
- **Type consistency:** `fetchRepositories`, `fetchInstallations`, `fetchInstallationRepositories`, `fetchOrganizationRepositories`, and structs `githubInstallationsResponse`/`githubInstallation`/`githubInstallationReposResponse` are named identically everywhere they appear. Reuses existing `githubRepository{FullName, Archived}`, `c.get`, `c.maxPages`, `errGitHubRepositoriesNotConfigured`. ✅
