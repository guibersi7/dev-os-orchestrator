# Onboarding and Integration Flow

Developer OS should get a new workspace to real engineering context as quickly as possible.

## User Flow

1. Landing page
   - User understands the value proposition.
   - Primary CTA sends the user to `/onboarding`.

2. Workspace onboarding
   - User sees setup progress.
   - User chooses the first integrations to connect.
   - Recommended first services are GitHub, Linear, Slack, and Notion.

3. OAuth start
   - User clicks `Connect` for a service.
   - Frontend opens `/integrations/{service}/connect`.
   - The web app calls `GET /v1/oauth/{service}/start`.
   - If provider env vars are present, the user is redirected to the provider OAuth URL.
   - If provider env vars are missing, the user sees the missing server-side env vars.

4. OAuth callback
   - Provider redirects to `GET /v1/oauth/{service}/callback`.
   - The Go API Gateway validates signed state.
   - The API Gateway exchanges the provider code for tokens.
   - Tokens are sealed and persisted server-side only.

5. First sync
   - User runs `Sync` from onboarding, Settings, or connector details.
   - The web app calls `POST /v1/sync`.
   - Provider records are normalized into `WorkEvent`.
   - WorkEvents are persisted and become dashboard/chat/source context.

6. Daily usage
   - User opens `/dashboard`.
   - Dashboard, Focus, Weekly Summary, and Workspace Chat read normalized data instead of provider-specific entities.

## Product Rules

- Onboarding must be actionable, not informational.
- The fastest happy path is connect, sync, dashboard.
- The frontend must never receive access tokens or refresh tokens.
- Every connected provider must expose safe connection state through `GET /v1/connections`.
- Every external object must become an internal `WorkEvent` before powering product features.

## Current Screens

- `/onboarding`: guided first-run setup and quick connection actions.
- `/settings`: full Connection Center for connect, reconnect, sync, details, and disconnect.
- `/integrations/{service}/connect`: OAuth start and missing configuration state.
- `/integrations/{service}`: connector details and normalized sync output.
- `/dashboard`: working surface after data sync.
