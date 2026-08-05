import { NextResponse } from "next/server";
import { sanitizeAuthRedirect } from "@/lib/auth/config";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { ensureUserProfile, getUserProfileByEmail } from "@/lib/auth/profiles";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const redirectTo = sanitizeAuthRedirect(requestUrl.searchParams.get("redirect"));

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const email = user?.email?.trim().toLowerCase();
      try {
        const existingProfile = email ? await getUserProfileByEmail(email) : null;

        if (user && !existingProfile && user.user_metadata?.full_name && user.user_metadata?.phone) {
          await ensureUserProfile(user);
          return NextResponse.redirect(new URL(redirectTo, request.url));
        }

        if (email && !existingProfile) {
          await supabase.auth.signOut();
          const signupUrl = new URL("/signup", request.url);
          signupUrl.searchParams.set("email", email);
          signupUrl.searchParams.set("redirect", redirectTo);
          return NextResponse.redirect(signupUrl);
        }
      } catch {
        await supabase.auth.signOut();
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("error", "profile_check_failed");
        loginUrl.searchParams.set("redirect", redirectTo);
        return NextResponse.redirect(loginUrl);
      }

      return NextResponse.redirect(new URL(redirectTo, request.url));
    }
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", "callback_failed");
  loginUrl.searchParams.set("redirect", redirectTo);
  return NextResponse.redirect(loginUrl);
}
