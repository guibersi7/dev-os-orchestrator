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
```

The backend stores data in Supabase when `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured. Without those env vars, it uses an in-memory fallback for local development.
