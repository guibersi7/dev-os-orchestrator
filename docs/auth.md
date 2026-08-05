# Authentication

The web app uses Supabase Auth for passwordless sessions and `public.users` as the application profile gate.

## Email OTP

Login by email is only allowed when the email already exists in `public.users`. Unknown emails are sent to `/signup`, where the user must provide email, phone, full name, birth date, profession, and company before receiving an OTP.

Supabase sends the email. Configure the Supabase template so the message shows the 6-digit code:

- Supabase Dashboard > Authentication > Email Templates.
- Update the `Magic Link / OTP` template body to include `{{ .Token }}`.
- The signup flow creates the Supabase Auth user server-side first, then sends this same `Magic Link / OTP` email with `shouldCreateUser: false`.
- Keep the confirmation URL as `{{ .ConfirmationURL }}` if you also keep a link in the email.
- Set `NEXT_PUBLIC_APP_URL` to the deployed app origin so `{{ .ConfirmationURL }}` points to `/auth/callback` instead of an invalid or blank URL.

The UI verifies the code with the `input-otp` input. The server first verifies the documented numeric OTP type (`email`) and falls back to `signup`/`magiclink` when Supabase returns an invalid/expired token response, which covers projects whose email templates or user state emit one of the older email OTP types. Signup verification writes the profile to `public.users` with the Supabase Auth user id.

## Required Environment

`SUPABASE_SERVICE_ROLE_KEY` is required on the server to check whether an email is registered and to create the `public.users` profile after signup verification.

These variables must exist in the Vercel project that serves the web app:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

If any Supabase variable is missing, the login and signup forms stay disabled and no OTP email can be sent.
