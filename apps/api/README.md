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
- `GET /v1/connections`
- `DELETE /v1/connections/{service}`
- `GET /v1/connections/{service}/resources`
- `PUT /v1/connections/{service}/selection`
- `GET /v1/oauth/{service}/start`
- `GET /v1/oauth/{service}/callback`
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

### `GET /v1/connections`

Returns the unified connection state for every supported service. This is the primary backend contract for the web Connection Center.

The response intentionally returns token metadata only. It never exposes provider access tokens or refresh tokens.

```json
{
  "connections": [
    {
      "service": "github",
      "status": "connected",
      "providerConfigured": true,
      "hasToken": true,
      "hasRefreshToken": true,
      "selectionStatus": "selected",
      "selectedResourceCount": 2,
      "providerAccountId": "provider-account-id",
      "expiresAt": "2026-08-01T00:00:00Z",
      "scopes": ["repo", "read:user"],
      "lastSyncedAt": "2026-07-30T10:00:00Z",
      "lastSyncRecordsScanned": 24,
      "lastSyncEventsCreated": 12
    }
  ]
}
```

Common statuses:

- `available`: service is supported but not connected.
- `needs_config`: service is missing server-side OAuth env vars.
- `needs_selection`: token exists, but the user has not selected which provider resources DevOS can sync.
- `selected`: provider resources were selected, but sync has not completed yet.
- `connected`: token material exists server-side.
- `syncing`: last sync is in progress or recently persisted that status.
- `expired`: stored token has expired.
- `error`: last sync failed.

### `DELETE /v1/connections/{service}`

Disconnects one service for the workspace by deleting stored token material and resetting sync metadata.

On success, the API writes a `connection_disconnected` audit log and returns safe connection metadata:

```json
{
  "connection": {
    "service": "slack",
    "status": "available",
    "providerConfigured": true,
    "hasToken": false,
    "hasRefreshToken": false,
    "scopes": []
  }
}
```

### `GET /v1/connections/{service}/resources`

Lists provider resources the connected user can choose for sync. The response is intentionally generic so every connector can reuse the same onboarding UI.

```json
{
  "service": "github",
  "status": "available",
  "resources": [
    {
      "id": "acme/api",
      "type": "repository",
      "name": "acme/api",
      "externalUrl": "https://github.com/acme/api",
      "metadata": {
        "fullName": "acme/api"
      }
    }
  ],
  "selectedResourceIds": ["acme/api"]
}
```

If the service is not connected yet, `status` is `needs_auth` and `resources` is empty.

### `PUT /v1/connections/{service}/selection`

Persists the resources the user explicitly selected for one connector. `POST /v1/sync` uses this selection before calling provider APIs and returns `needs_selection` when a connected provider has no selected resources.

```json
{
  "resources": [
    {
      "id": "acme/api",
      "type": "repository",
      "name": "acme/api",
      "externalUrl": "https://github.com/acme/api",
      "metadata": {
        "fullName": "acme/api"
      }
    }
  ]
}
```

The persisted selection is stored server-side in `integration_configs.settings.selectedResources`.

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
  "providerAccountId": "provider-user-id",
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

## Sync Observability

The gateway writes structured JSON logs for every `/v1/sync` attempt.

Important log events:

- `sync_started`: request accepted and connector selected.
- `sync_completed`: provider sync and persistence succeeded.
- `sync_failed`: provider call failed before persistence.
- `sync_persist_failed`: provider sync succeeded but persistence failed.
- `sync_token_read_failed`: gateway could not read the stored provider token.
- `sync_rejected`: unsupported service or missing connector.

Each sync log includes:

- `request_id`
- `workspace_id`
- `user_id` when available
- `service`
- `duration_ms`
- `records_scanned`
- `events_created`
- `document_chunks_created`
- `error_type` and `retryable` for failures

Provider sync failures return actionable details in the API envelope:

```json
{
  "error": {
    "code": "provider_sync_failed",
    "message": "429 rate limit exceeded",
    "details": {
      "service": "github",
      "type": "rate_limit",
      "retryable": true,
      "action": "Retry after the provider rate limit resets."
    }
  }
}
```

Troubleshooting guide:

- `auth`: reconnect the integration or refresh the provider token.
- `rate_limit`: back off and retry after the provider reset window.
- `schema`: inspect the provider response and update the connector normalizer.
- `network`: retry sync and verify provider availability.
- `provider`: inspect provider logs, request IDs, and retry manually.

## Local Run

```bash
go run ./cmd/api
```

From repo root:

```bash
npm run dev:api
```

For local development, the API tries to load env vars from these files if they exist:

- `.env`
- `apps/api/.env`
- `apps/web/.env`
- `apps/web/.env.local`

Real host environments should provide secrets as process env vars instead of relying on local `.env` files. Process env vars always win over file values.

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
- `document_chunks`
- `dashboard_snapshots`

Runtime behavior:

- Writes auto-upsert the workspace before dependent records.
- `GET /v1/dashboard` reads persisted `work_events`, source health from `integration_configs`, and stores a `dashboard_snapshots` record.
- `GET /v1/config` reads persisted user preferences and falls back to local defaults when no row exists.
- `PUT /v1/config` upserts user preferences by `(workspace_id, user_id)`.
- `GET /v1/connections` reads connection state from `integration_configs` and token metadata from `integration_tokens` without returning token material.
- `DELETE /v1/connections/{service}` deletes provider tokens and resets sync status for that service.
- `POST /v1/tokens` stores sealed tokens server-side only.
- `POST /v1/tokens/refresh` exchanges refresh tokens with the provider, persists the new access token, and never returns token material.
- Provider tokens are scoped by `(workspace_id, user_id, service, provider_account_id)` so each workspace member owns their own service connections.
- `POST /v1/sync` persists generated `work_events` and updates `integration_configs.last_synced_at`.
- Notion sync persists private `document_chunks` for future semantic search. Chunk content is not returned in the sync response or `WorkEvent.raw`.
- Sync writes are idempotent by `(workspace_id, service, external_id)`.
- Document chunk writes are idempotent by `(workspace_id, service, external_id)`.
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
- `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_OAUTH_SCOPES`, `NOTION_VERSION`
- `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_OAUTH_SCOPES`, `GOOGLE_CALENDAR_IDS`

GitHub sync behavior:

- Uses the connected user's GitHub OAuth access token.
- If `GITHUB_REPOSITORIES` is set, sync is limited to that comma-separated `owner/repo` list.
- If `GITHUB_REPOSITORIES` is not set, the connector lists repositories accessible to the authenticated user through `/user/repos`.
- If `GITHUB_ORGANIZATION` or `GITHUB_ORG` is set, repository discovery uses that organization through `/orgs/{org}/repos`.
- For each repository, the connector paginates recent pull requests and issues.
- For each pull request, the connector fetches reviews, review comments, and failed check runs.
- Pull request WorkEvents include raw metrics such as review count, review comment count, reviewer count, lead time hours, and time to first review hours.
- `GITHUB_SYNC_MAX_PAGES` controls pagination depth per resource. Default is `3`.

## Tests

```bash
go test ./...
```
