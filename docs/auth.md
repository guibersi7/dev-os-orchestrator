# Authentication

The web app uses Supabase Auth for passwordless sessions and `public.users` as the application profile gate.

## Email Login

Login by email is only allowed when the email already exists in `public.users`. Unknown emails are sent to `/signup`, where the user must provide email, phone, full name, birth date, profession, and company before receiving an auth email.

Supabase sends the email. Configure both the `Magic Link / OTP` and `Confirm signup` templates to use the application confirmation route:

- Supabase Dashboard > Authentication > Email Templates.
- Set the email link to `<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Entrar no Standup</a>`.
- Do not use `{{ .ConfirmationURL }}` directly; it points at Supabase's verifier instead of the application's SSR confirmation route.
- The signup flow sends this same email with `shouldCreateUser: true`; the application profile is created only after the user confirms the link.
- Set `NEXT_PUBLIC_APP_URL` to the deployed app origin so generated auth URLs use the production site.

The primary flow verifies `{{ .TokenHash }}` in `/auth/confirm` with `verifyOtp({ token_hash, type: "email" })`, which persists the Supabase session to SSR cookies. Signup confirmation writes the profile to `public.users` with the Supabase Auth user id.

The manual 6-digit OTP screen remains available as a fallback. OTP emails and manual verification use a non-PKCE Supabase client so the 6-digit code can be verified directly with `verifyOtp({ email, token, type: "email" })`. When verification returns a session, the normal SSR client persists that session to cookies.

If Supabase has already confirmed the Auth user during signup but the manual OTP verification returns `otp_expired`, the server reconciles that state by creating the missing `public.users` profile and sends the user back to login for a fresh login OTP.

## Required Environment

`SUPABASE_SERVICE_ROLE_KEY` is required on the server to check whether an email is registered and to create the `public.users` profile after signup verification.

These variables must exist in the Vercel project that serves the web app:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

If any Supabase variable is missing, the login and signup forms stay disabled and no OTP email can be sent.
