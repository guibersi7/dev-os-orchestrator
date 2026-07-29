# Deployment

Developer OS is deployed as two services backed by one Supabase project per environment.

## Services

| Service | Path | Runtime | Suggested host | Build | Health |
| --- | --- | --- | --- | --- | --- |
| Web | `apps/web` | Next.js | Vercel | `npm run build:web` | `/dashboard` |
| API Gateway | `apps/api` | Go HTTP server | Render, Fly.io, Railway, ECS, or any container host | `docker build -f apps/api/Dockerfile apps/api` | `/health` |
| Database | `supabase/schema.sql` | PostgreSQL | Supabase | Apply SQL migrations | Supabase dashboard |

The web service must call only the API Gateway for application data. Provider secrets, Supabase service role keys, OAuth client secrets, refresh tokens, and token sealing keys must never be configured as `NEXT_PUBLIC_*` values.

## Environment Matrix

| Variable | Development | Staging | Production | Exposed to browser |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8080` | staging API URL | production API URL | Yes |
| `NEXT_PUBLIC_WORKSPACE_ID` | local workspace UUID | staging workspace UUID | production workspace UUID | Yes |
| `NEXT_PUBLIC_USER_ID` | local user UUID | staging user UUID | production user UUID | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | local/staging Supabase URL | staging Supabase URL | production Supabase URL | Yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | local publishable key | staging publishable key | production publishable key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | local service role | staging service role | production service role | No |
| `API_GATEWAY_SECRET` | local shared secret | staging shared secret | production shared secret | No |
| `OAUTH_STATE_SECRET` | local signing secret | staging signing secret | production signing secret | No |
| `TOKEN_SEALING_KEY` | local 32-byte/base64 key | staging key | production key | No |
| Provider OAuth secrets | provider dev apps | provider staging apps | provider production apps | No |
| Provider selection envs | local selected repos/channels/boards | staging selections | production selections | No |

## Web Deployment

Use `apps/web` as the project root when connecting Vercel.

Recommended settings:

- Install command: `npm ci`
- Build command: `npm run build:web`
- Output: managed by Next.js
- Runtime env: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_WORKSPACE_ID`, `NEXT_PUBLIC_USER_ID`, Supabase publishable envs, and `API_GATEWAY_SECRET`

`API_GATEWAY_SECRET` is read only by Server Components and server-side fetches. Do not prefix it with `NEXT_PUBLIC_`.

## API Deployment

Build the API container from the repo root:

```bash
docker build -f apps/api/Dockerfile apps/api -t devos-api
```

Run locally:

```bash
docker run --rm -p 8080:8080 --env-file .env devos-api
```

Production requirements:

- Route HTTPS traffic to port `8080`.
- Configure `/health` as the health check.
- Set `API_ADDR=:8080` unless the host requires a different port binding.
- Configure all provider OAuth secrets server-side only.
- Configure `TOKEN_SEALING_KEY` before storing real provider tokens.

## Supabase Checklist

Before deploying staging or production:

- Create one Supabase project per environment.
- Apply `supabase/schema.sql`.
- Store only the publishable key in frontend-visible env vars.
- Store `SUPABASE_SERVICE_ROLE_KEY` only in API/server environments.
- Rotate `TOKEN_SEALING_KEY` per environment and keep it out of logs.
- Confirm RLS policy strategy before exposing direct browser writes.
- Verify `work_events_workspace_external_id_idx` prevents duplicate normalized events.

## CI

GitHub Actions runs on pushes to `main` and pull requests:

- Web lint: `npm run lint:web`
- Web build: `npm run build:web`
- API tests: `go test ./...`
- API build: `go build ./cmd/api`

## Release Checklist

- CI is green.
- Supabase schema is applied.
- API `/health` returns `ok`.
- Web `NEXT_PUBLIC_API_BASE_URL` points to the target API.
- `/v1/dashboard` returns a versioned envelope.
- `/v1/sync` logs `sync_started` and either `sync_completed` or an actionable failure.
- No provider secret or service role key is present in `NEXT_PUBLIC_*` env vars.
