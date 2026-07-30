# Developer OS

Monorepo for Developer OS.

## Apps

- `apps/web`: Next.js frontend.
- `apps/api`: Go API Gateway backend.

## Common Commands

```bash
npm run dev:web
npm run dev:api
npm run build
npm run lint
npm run test:api
```

The backend stores data in Supabase when `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured. Without those env vars, it uses an in-memory fallback for local development.

Deployment, environment mapping, CI, and Supabase checklist are documented in [docs/deployment.md](docs/deployment.md).

Design system decisions, including the required Jet Stream and Blue Whale brand palette for both the landing page and product UI, are documented in [docs/design-system.md](docs/design-system.md).
