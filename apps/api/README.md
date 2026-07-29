# Developer OS API

Go backend for the Developer OS API Gateway.

## Responsibilities

- Expose one backend surface for the web app and future clients.
- Hide provider-specific APIs behind integration connectors.
- Normalize external data into `WorkEvent`.
- Persist dashboard data, user config, integration tokens, and sync output in Supabase.
- Keep local development useful without Supabase env vars by falling back to an in-memory store.

## Routes

- `GET /health`
- `GET /v1/dashboard`
- `GET /v1/config`
- `PUT /v1/config`
- `POST /v1/sync`
- `POST /v1/tokens`
- `POST /v1/tokens/refresh`

Protected routes require `Authorization: Bearer $API_GATEWAY_SECRET` when `API_GATEWAY_SECRET` is configured.

## Versioned API Contract

All `/v1/*` routes return the same envelope:

```json
{
  "version": "v1",
  "requestId": "req_...",
  "context": {
    "workspaceId": "00000000-0000-4000-8000-000000000001",
    "userId": "00000000-0000-4000-8000-000000000002"
  },
  "data": {},
  "error": null
}
```

Errors use the same envelope and move details into `error`:

```json
{
  "version": "v1",
  "requestId": "req_...",
  "context": {
    "workspaceId": "00000000-0000-4000-8000-000000000001",
    "userId": "00000000-0000-4000-8000-000000000002"
  },
  "error": {
    "code": "unsupported_service",
    "message": "unsupported integration service",
    "details": {
      "service": "unknown"
    }
  }
}
```

Request context is read from:

- `x-workspace-id`
- `x-user-id`
- `x-request-id`

If headers are missing, local development defaults are used.

## Endpoint Contracts

### `GET /v1/dashboard`

Returns dashboard metrics, source health and normalized `WorkEvent` data.

### `GET /v1/config`

Returns the current user's dashboard and notification preferences.

### `PUT /v1/config`

Upserts user preferences.

```json
{
  "workspaceId": "00000000-0000-4000-8000-000000000001",
  "userId": "00000000-0000-4000-8000-000000000002",
  "dashboardPreferences": {
    "defaultView": "focus",
    "visibleSources": ["github", "slack", "linear"]
  },
  "notificationPreferences": {
    "blockers": true,
    "failedChecks": true,
    "decisions": true
  }
}
```

### `GET /v1/oauth/{service}/start`

Starts a provider OAuth flow. This endpoint is protected by the gateway secret.

Query parameters:

- `redirectUri`: absolute callback URL registered with the provider.

Example:

```bash
curl "http://localhost:8080/v1/oauth/github/start?redirectUri=http://localhost:8080/v1/oauth/github/callback"
```

When provider env vars are configured, response `data` includes:

```json
{
  "service": "github",
  "status": "ready",
  "authorizationUrl": "https://github.com/login/oauth/authorize?...",
  "state": "signed-state",
  "scopes": ["repo", "read:user", "read:org"]
}
```

When provider env vars are missing, response `data.status` is `needs_config`.

### `GET /v1/oauth/{service}/callback`

Handles provider redirect callbacks. This endpoint is validated through signed OAuth `state`, not the gateway bearer token.

Query parameters:

- `code`
- `state`

On success, the API stores token material server-side and returns only safe metadata:

```json
{
  "service": "github",
  "status": "connected",
  "providerAccountId": "provider-account-id",
  "expiresAt": "2026-08-01T00:00:00Z",
  "scopes": ["repo", "read:user"]
}
```

### `POST /v1/sync`

Runs one integration sync through the gateway.

```json
{
  "service": "github"
}
```

Supported services:

- `github`
- `slack`
- `linear`
- `jira`
- `trello`
- `notion`
- `calendar`

### `POST /v1/tokens`

Stores a provider token server-side.

```json
{
  "workspaceId": "00000000-0000-4000-8000-000000000001",
  "service": "github",
  "providerAccountId": "provider-user-or-installation-id",
  "accessToken": "access-token",
  "refreshToken": "refresh-token",
  "expiresAt": "2026-08-01T00:00:00Z",
  "scopes": ["repo", "read:user"]
}
```

### `POST /v1/tokens/refresh`

Refreshes one provider token when a refresh token is available.

```json
{
  "service": "github"
}
```

On success, the API stores the refreshed token server-side and returns only safe metadata:

```json
{
  "service": "linear",
  "status": "connected",
  "providerAccountId": "provider-account-id",
  "expiresAt": "2026-08-01T00:00:00Z",
  "scopes": ["read", "write"]
}
```

If the workspace has no token or no refresh token, response `data.status` is `missing_token` or `missing_refresh_token`.

## Local Run

```bash
go run ./cmd/api
```

From repo root:

```bash
npm run dev:api
```

## Supabase Persistence

The API uses Supabase when these env vars are present:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
API_GATEWAY_SECRET=replace-with-a-long-random-secret
TOKEN_SEALING_KEY=base64-encoded-32-byte-key
```

Apply the schema in:

```bash
supabase/schema.sql
```

Persisted entities:

- `workspaces`
- `user_configs`
- `integration_configs`
- `integration_tokens`
- `work_events`
- `dashboard_snapshots`

Runtime behavior:

- Writes auto-upsert the workspace before dependent records.
- `GET /v1/dashboard` reads persisted `work_events`, source health from `integration_configs`, and stores a `dashboard_snapshots` record.
- `GET /v1/config` reads persisted user preferences and falls back to local defaults when no row exists.
- `PUT /v1/config` upserts user preferences by `(workspace_id, user_id)`.
- `POST /v1/tokens` stores sealed tokens server-side only.
- `POST /v1/tokens/refresh` exchanges refresh tokens with the provider, persists the new access token, and never returns token material.
- `POST /v1/sync` persists generated `work_events` and updates `integration_configs.last_synced_at`.
- Sync writes are idempotent by `(workspace_id, service, external_id)`.
- `integration_configs` tracks `sync_cursor`, `last_sync_error`, `last_sync_records_scanned`, and `last_sync_events_created`.

Without Supabase env vars, the API uses an in-memory store for local development.

OAuth env vars:

- `OAUTH_STATE_SECRET`
- `TOKEN_SEALING_KEY`
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_OAUTH_SCOPES`
- `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_OAUTH_SCOPES`
- `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET`, `LINEAR_OAUTH_SCOPES`
- `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET`, `JIRA_OAUTH_SCOPES`
- `TRELLO_CLIENT_ID`, `TRELLO_CLIENT_SECRET`, `TRELLO_OAUTH_SCOPES`
- `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_OAUTH_SCOPES`
- `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_OAUTH_SCOPES`

## Tests

```bash
go test ./...
```
