# Authentication

The web app uses Supabase Auth for passwordless sessions and `public.users` as the application profile gate.

## Email OTP

Login by email is only allowed when the email already exists in `public.users`. Unknown emails are sent to `/signup`, where the user must provide email, phone, full name, birth date, profession, and company before receiving an OTP.

Supabase sends the email. Configure the templates so the message shows the 6-digit code:

- Supabase Dashboard > Authentication > Email Templates.
- Update `Magic Link / OTP` to include `{{ .Token }}`.
- If signup sends `Confirm signup`, update that template to include `{{ .Token }}` too.
- Do not use `{{ .TokenHash }}` for the manual input.
- Do not include `{{ .ConfirmationURL }}` in the OTP email body.
- The signup flow sends the OTP with `shouldCreateUser: true`; after `verifyOtp` succeeds, the user is logged in and the application profile is created in `public.users`.
- The login flow sends the OTP with `shouldCreateUser: false`; after `verifyOtp` succeeds, the user is logged in.

The UI verifies the code with the `input-otp` input. OTP emails and manual verification use a non-PKCE Supabase client so the 6-digit code can be verified directly with `verifyOtp({ email, token, type: "email" })`. When verification returns a session, the normal SSR client persists that session to cookies.

If Supabase accepts the OTP request but rejects the 6-digit verification as expired or invalid immediately after delivery, test the verification type with `SUPABASE_LOGIN_OTP_VERIFY_TYPE` and `SUPABASE_SIGNUP_OTP_VERIFY_TYPE`. Supported values are `email`, `magiclink`, and `signup`; the default is `email`. Test one type per deployment because a failed verification attempt can invalidate the code and hide the real result.

If Supabase has already confirmed the Auth user during signup but the manual OTP verification returns `otp_expired`, the server reconciles that state by creating the missing `public.users` profile and sends the user back to login for a fresh login OTP.

## Required Environment

`SUPABASE_SERVICE_ROLE_KEY` is required on the server to check whether an email is registered and to create the `public.users` profile after signup verification.

These variables must exist in the Vercel project that serves the web app:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

If any Supabase variable is missing, the login and signup forms stay disabled and no OTP email can be sent.
