import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sanitizeAuthRedirect } from "@/lib/auth/config";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { ensureUserProfile, getUserProfileByEmail } from "@/lib/auth/profiles";

function sanitizeEmailOtpType(value: string | null): EmailOtpType {
  return value === "signup" || value === "magiclink" || value === "email" ? value : "email";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = sanitizeEmailOtpType(requestUrl.searchParams.get("type"));
  const mode = requestUrl.searchParams.get("mode") === "signup" ? "signup" : "login";
  const redirectTo = sanitizeAuthRedirect(requestUrl.searchParams.get("redirect"));

  if (!tokenHash) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "confirm_missing_token");
    loginUrl.searchParams.set("redirect", redirectTo);
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    console.error("auth_confirm_failed", {
      mode,
      type,
      name: error.name,
      status: error.status,
      code: error.code,
      message: error.message,
    });

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "confirm_failed");
    loginUrl.searchParams.set("redirect", redirectTo);
    return NextResponse.redirect(loginUrl);
  }

  const user = data.user;
  const email = user?.email?.trim().toLowerCase();

  try {
    const existingProfile = email ? await getUserProfileByEmail(email) : null;

    if (user && mode === "signup" && !existingProfile) {
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
  } catch (profileError) {
    console.error("auth_confirm_profile_failed", {
      mode,
      message: profileError instanceof Error ? profileError.message : String(profileError),
    });
    await supabase.auth.signOut();
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "profile_check_failed");
    loginUrl.searchParams.set("redirect", redirectTo);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(new URL(redirectTo, request.url));
}
