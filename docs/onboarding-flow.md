# Onboarding and Integration Flow

Developer OS should get a new workspace to real engineering context as quickly as possible.

## User Flow

1. Landing page
   - User understands the value proposition.
   - Primary CTA sends the user to `/onboarding`.

2. Workspace onboarding
   - User sees setup progress.
   - User gets one primary action: connect GitHub.
   - Other services stay available as optional next connections after GitHub is working.

3. OAuth start
   - User clicks `Connect` for a service.
   - Frontend opens `/api/integrations/{service}/connect`.
   - The route handler calls `GET /v1/oauth/{service}/start` server-side.
   - If provider env vars are present, the user is redirected to the provider OAuth URL.
   - If provider env vars are missing, the user returns to onboarding with the missing server-side env vars.

4. OAuth callback
   - Provider redirects to `GET /v1/oauth/{service}/callback`.
   - The Go API Gateway validates signed state.
   - The API Gateway exchanges the provider code for tokens.
   - Tokens are sealed and persisted server-side only.
   - Connections are scoped to the current `(workspace, user, service)` so each workspace member connects their own provider account.

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
- The fastest happy path is connect GitHub, sync GitHub, dashboard.
- The frontend must never receive access tokens or refresh tokens.
- A service connection belongs to the user who authorized OAuth inside the workspace.
- Every integration uses OAuth user authorization with the provider's own auth screen.
- Every connected provider must expose safe connection state through `GET /v1/connections`.
- Every external object must become an internal `WorkEvent` before powering product features.

## GitHub First Sync

GitHub is the first provider that should behave like a real production integration.

- OAuth must use the GitHub app/client configured in the API Gateway.
- The connector uses the authenticated user's access token.
- Repository discovery uses the selected static repositories when configured, otherwise it lists repositories accessible to the user.
- Organization discovery is enabled by configuring `GITHUB_ORGANIZATION` or `GITHUB_ORG`.
- Pull request sync fetches PRs, reviews, review comments, and failed check runs.
- Generated WorkEvents carry review metrics in `raw.metrics`, including review count, reviewer count, review comments, lead time, and time to first review.

## Current Screens

- `/onboarding`: guided first-run setup and quick connection actions.
- `/settings`: full Connection Center for connect, reconnect, sync, details, and disconnect.
- `/api/integrations/{service}/connect`: server-side OAuth starter that redirects directly to the provider auth screen.
- `/integrations/{service}/connect`: fallback/manual OAuth diagnostic screen.
- `/integrations/{service}`: connector details and normalized sync output.
- `/dashboard`: working surface after data sync.
