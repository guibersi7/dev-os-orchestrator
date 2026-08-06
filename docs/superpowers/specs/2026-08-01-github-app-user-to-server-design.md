# Port GitHub integration from OAuth App to GitHub App (user-to-server)

- **Date:** 2026-08-01
- **Status:** Approved (design)
- **Scope:** Backend only (`apps/api`), GitHub integration
- **Related:** Standup deploy setup (Vercel web + Render API + Supabase)

## Problem

The GitHub integration currently authenticates with an **OAuth App** using a
user token. Organization repositories are gated by each org's third-party
application access policy, so an org owner must approve the OAuth App before its
repos appear. During earlier local testing a **GitHub App** was used, which
accessed all repositories across the user's profile and organizations because it
was installed there. We want that behavior back: repo access driven by where the
app is installed, not by per-org OAuth approval.

## Decision summary

- **Token model:** user-to-server (reuse the existing OAuth authorize/exchange
  flow), not installation tokens. Chosen to minimize new code.
- **Token expiration:** GitHub App configured with "Expire user authorization
  tokens" **disabled** → non-expiring token → **no refresh flow** to implement.
- **Approach:** #1 — swap credentials + change repository discovery to the
  installation-based endpoints. No schema migration, no JWT/private key, no
  installation callback handling.

## Behavior change

The GitHub integration moves from OAuth App to **GitHub App** with a
non-expiring user-to-server token. Repository access now comes from **where the
app is installed** (profile + organizations) instead of the org third-party
policy. The OAuth flow (authorize/exchange), token sealing, resource selection,
and PR/issue fetching are **unchanged**.

## GitHub App setup (external, one-time)

Create a **GitHub App** (Settings → Developer settings → GitHub Apps → New):

- **Name:** `standup-<unique suffix>`
- **Homepage URL:** `https://www.standupmorning.com`
- **Callback URL:** `https://www.standupmorning.com/api/integrations/github/callback`
- ✅ **Request user authorization (OAuth) during installation**
- ❌ **Expire user authorization tokens** (disabled)
- **Webhook:** *Active* unchecked (not used yet)
- **Repository permissions:** Metadata `Read-only`, Contents `Read-only`,
  Pull requests `Read-only`, Issues `Read-only`, Checks `Read-only`
- **Where can this app be installed:** *Only on this account* (personal use)
- After creation: generate a **Client secret**, note the **Client ID**
  (GitHub App client IDs start with `Iv…`), then **Install** the app on the
  profile/orgs (All repositories or selected).

Credentials for this app (`Iv23liHiuHYbO3b7JRtC` + secret) replace the OAuth
App values in the existing `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` env vars.
No new env vars are introduced.

## Code changes (`apps/api`, Go)

### a) `internal/integrations/github.go` — repository discovery (core change)

Replace the current single call:

```
GET /user/repos?affiliation=owner,collaborator,organization_member&...
```

with installation-based discovery (GitHub App user-to-server tokens are scoped
to installations, so `/user/repos` does not return the expected set):

1. `GET /user/installations?per_page=100&page=N`
   → response `{ "total_count": N, "installations": [ { "id": ... } ] }`
2. For each installation id:
   `GET /user/installations/{installation_id}/repositories?per_page=100&page=M`
   → response `{ "total_count": N, "repositories": [ { "full_name", "archived" } ] }`
3. Flatten across installations, skip archived repos, de-duplicate `full_name`,
   respect the existing `maxPages` bound per listing.

New response structs (the `get()` helper already decodes into `any`, so wrapped
objects only need new types):

- `githubInstallationsResponse { Installations []githubInstallation }`
- `githubInstallation { ID int64 }`
- `githubInstallationReposResponse { Repositories []githubRepository }`
  (reuses the existing `githubRepository{ FullName, Archived }`)

Keep the existing `GITHUB_ORGANIZATION` override branch as an explicit legacy
path (unused in the current setup; retained per design approval).

### b) `internal/oauth/providers.go` — scopes

GitHub Apps ignore the OAuth `scope` parameter (permissions come from the app
config). Change the `github` provider default so `GITHUB_OAUTH_SCOPES` defaults
to empty, so the authorization URL does not send an ignored `scope`. `AuthURL`
and `TokenURL` are unchanged (same `github.com/login/oauth/*` endpoints).

### c) Environment (Render `standup-api`)

Replace the values of `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` with the
GitHub App's Client ID/secret. No `GITHUB_ORGANIZATION`. No other new vars.

**Ordering:** ship the code change first (or together), then swap the Render env.
Swapping credentials before the discovery change would use the GitHub App with
the old `/user/repos` discovery and fail to list installation repos.

## Testing

- Update `TestGitHubSyncDiscoversAuthenticatedUserRepositories` to mock
  `/user/installations` and `/user/installations/{id}/repositories` (wrapped
  responses) instead of `/user/repos`.
- Add a test covering pagination and multiple installations → flattened list,
  archived repos excluded, duplicates removed.
- `go test ./...` and `go build ./cmd/api` green before deploy.

## Rollout & verification

1. Merge code change; run tests/build locally.
2. Swap `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` on Render → redeploy →
   `/health` returns ok.
3. (Optional) revoke the old OAuth App authorization at
   `github.com/settings/applications`.
4. Connect via the app → confirm a token row in `integration_tokens`.
5. `GET /v1/connections/github/resources` now lists organization repos.
6. Select a repo with activity → `POST /v1/sync` → verify `work_events` rows in
   Supabase.

## Out of scope (YAGNI)

Installation tokens / JWT / private key, refresh flow, persisting
`installation_id` via a setup callback, an OAuth-App↔GitHub-App config toggle,
and webhooks.
