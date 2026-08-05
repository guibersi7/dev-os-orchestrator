# Authentication

The web app uses Supabase Auth for passwordless sessions and `public.users` as the application profile gate.

## Email OTP

Login by email is only allowed when the email already exists in `public.users`. Unknown emails are sent to `/signup`, where the user must provide email, phone, full name, birth date, profession, and company before receiving an OTP.

Supabase sends the email. Configure the Supabase template so the message shows the 6-digit code:

- Supabase Dashboard > Authentication > Email Templates.
- Update the `Magic Link / OTP` template body to include `{{ .Token }}`.
- Remove `{{ .ConfirmationURL }}` from the OTP email body. Some email clients and security scanners prefetch links; if they open the Supabase confirmation URL, the token is consumed before the user types the code.
- If the signup email uses the `Confirm signup` template, update that template too. The manual OTP input must show `{{ .Token }}`; `{{ .TokenHash }}` is only for links that verify with `token_hash`.
- The signup flow sends this same `Magic Link / OTP` email with `shouldCreateUser: true`; the application profile is created only after the user verifies the code.
- Set `NEXT_PUBLIC_APP_URL` to the deployed app origin so `{{ .ConfirmationURL }}` points to `/auth/callback` instead of an invalid or blank URL.

The UI verifies the code with the `input-otp` input. The server verifies the documented numeric OTP type (`email`) for `signInWithOtp`. Signup verification writes the profile to `public.users` with the Supabase Auth user id.

OTP emails are sent with a non-PKCE Supabase client so the 6-digit code can be verified directly with `verifyOtp({ email, token, type: "email" })`. The normal SSR client is still used for verification so the resulting session is persisted to cookies.

## Required Environment

`SUPABASE_SERVICE_ROLE_KEY` is required on the server to check whether an email is registered and to create the `public.users` profile after signup verification.

These variables must exist in the Vercel project that serves the web app:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

If any Supabase variable is missing, the login and signup forms stay disabled and no OTP email can be sent.
