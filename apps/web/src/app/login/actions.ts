"use server";

import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createOtpSupabaseClient, createServerSupabaseClient } from "@/lib/auth/server";
import {
  getAuthCallbackUrl,
  getAuthConfirmUrl,
  isSupabaseAdminConfigured,
  isSupabaseAuthConfigured,
  sanitizeAuthRedirect,
} from "@/lib/auth/config";
import {
  ensureUserProfile,
  getAuthUserByEmail,
  getUserProfileByEmail,
  normalizeEmail,
  validateSignupLike,
  type SignupProfile,
} from "@/lib/auth/profiles";

export type AuthActionState = {
  error?: string;
  sent?: boolean;
};

const pendingSignupCookie = "standup_pending_signup";
const genericAuthErrorMessage = "Unable to send the code right now. Check the authentication email provider configuration.";

async function getRequestOrigin() {
  const headerStore = await headers();
  const origin = headerStore.get("origin");
  const host = headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") ?? "http";

  return origin ?? `${protocol}://${host}`;
}

function getTrimmed(value: FormDataEntryValue | string | null | undefined) {
  return String(value ?? "").trim();
}

function validateSignupProfile(formData: FormData): SignupProfile | { error: string } {
  const profile = {
    email: normalizeEmail(formData.get("email")),
    phone: getTrimmed(formData.get("phone")),
    fullName: getTrimmed(formData.get("fullName")),
    birthDate: getTrimmed(formData.get("birthDate")),
    profession: getTrimmed(formData.get("profession")),
    company: getTrimmed(formData.get("company")),
  };

  if (!profile.email || !profile.email.includes("@")) {
    return { error: "Enter a valid email." };
  }

  if (!profile.phone || !profile.fullName || !profile.birthDate || !profile.profession || !profile.company) {
    return { error: "Fill in all fields to create your account." };
  }

  if (Number.isNaN(Date.parse(`${profile.birthDate}T00:00:00Z`))) {
    return { error: "Enter a valid birth date." };
  }

  return profile;
}

async function savePendingSignup(profile: SignupProfile) {
  const cookieStore = await cookies();
  cookieStore.set(pendingSignupCookie, Buffer.from(JSON.stringify(profile), "utf8").toString("base64url"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 15,
  });
}

async function readPendingSignup(email: string): Promise<SignupProfile | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(pendingSignupCookie);

  if (!cookie?.value) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cookie.value, "base64url").toString("utf8")) as Partial<SignupProfile>;
    if (normalizeEmail(parsed.email) !== email) {
      return null;
    }

    return validateSignupLike(parsed);
  } catch {
    return null;
  }
}

async function clearPendingSignup() {
  const cookieStore = await cookies();
  cookieStore.delete(pendingSignupCookie);
}

function getAuthErrorMessage(error: unknown, fallback = genericAuthErrorMessage) {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const candidate = "message" in error ? String(error.message ?? "").trim() : "";
  if (candidate && candidate !== "{}") {
    return candidate;
  }

  const description = "error_description" in error ? String(error.error_description ?? "").trim() : "";
  if (description && description !== "{}") {
    return description;
  }

  return fallback;
}

function getAuthErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error ? String(error.code ?? "") : "";
}

function logAuthActionError(step: string, error: unknown, context?: Record<string, string | number | boolean | undefined>) {
  if (!error || typeof error !== "object") {
    console.error("auth_action_failed", { step, message: String(error), ...context });
    return;
  }

  console.error("auth_action_failed", {
    step,
    ...context,
    name: "name" in error ? error.name : undefined,
    status: "status" in error ? error.status : undefined,
    code: "code" in error ? error.code : undefined,
    message: "message" in error ? error.message : undefined,
  });
}

function isConfirmedAuthUser(user: { email_confirmed_at?: string | null; confirmed_at?: string | null; last_sign_in_at?: string | null }) {
  return Boolean(user.email_confirmed_at || user.confirmed_at || user.last_sign_in_at);
}

export async function signInWithGoogleAction(_previousState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  if (!isSupabaseAuthConfigured()) {
    return { error: "Supabase Auth is not configured." };
  }

  const redirectTo = sanitizeAuthRedirect(formData.get("redirect"));
  const origin = await getRequestOrigin();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getAuthCallbackUrl(origin, redirectTo),
    },
  });

  if (error || !data.url) {
    return { error: error?.message ?? "Unable to start Google login." };
  }

  redirect(data.url);
}

export async function sendEmailOtpAction(_previousState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  if (!isSupabaseAuthConfigured()) {
    return { error: "Supabase Auth is not configured." };
  }

  if (!isSupabaseAdminConfigured()) {
    return { error: "Supabase admin access is required to check registered emails." };
  }

  const email = normalizeEmail(formData.get("email"));
  const redirectTo = sanitizeAuthRedirect(formData.get("redirect"));

  if (!email) {
    return { error: "Enter your email to receive the code." };
  }

  let existingProfile;
  try {
    existingProfile = await getUserProfileByEmail(email);
  } catch (error) {
    logAuthActionError("login_profile_lookup", error);
    return { error: getAuthErrorMessage(error, "Unable to check this email.") };
  }

  if (!existingProfile) {
    redirect(`/signup?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirectTo)}`);
  }

  const origin = await getRequestOrigin();
  const supabase = createOtpSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: getAuthConfirmUrl(origin, redirectTo, "login"),
    },
  });

  if (error) {
    logAuthActionError("login_send_otp", error);
    return { error: getAuthErrorMessage(error) };
  }

  redirect(`/login/verify?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirectTo)}&mode=login`);
}

export async function signUpWithEmailOtpAction(_previousState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  if (!isSupabaseAuthConfigured()) {
    return { error: "Supabase Auth is not configured." };
  }

  if (!isSupabaseAdminConfigured()) {
    return { error: "Supabase admin access is required to create profiles." };
  }

  const profile = validateSignupProfile(formData);
  if ("error" in profile) {
    return { error: profile.error };
  }

  const redirectTo = sanitizeAuthRedirect(formData.get("redirect"));

  try {
    const existingProfile = await getUserProfileByEmail(profile.email);
    if (existingProfile) {
      return { error: "This email is already registered. Go back and sign in." };
    }
  } catch (error) {
    logAuthActionError("signup_profile_lookup", error);
    return { error: getAuthErrorMessage(error, "Unable to check this email.") };
  }

  const origin = await getRequestOrigin();
  const supabase = createOtpSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: profile.email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: getAuthConfirmUrl(origin, redirectTo, "signup"),
      data: {
        full_name: profile.fullName,
        phone: profile.phone,
        birth_date: profile.birthDate,
        profession: profile.profession,
        company: profile.company,
      },
    },
  });

  if (error) {
    logAuthActionError("signup_send_otp", error);
    return { error: getAuthErrorMessage(error) };
  }

  await savePendingSignup(profile);

  redirect(`/login/verify?email=${encodeURIComponent(profile.email)}&redirect=${encodeURIComponent(redirectTo)}&mode=signup`);
}

export async function verifyEmailOtpAction(_previousState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  if (!isSupabaseAuthConfigured()) {
    return { error: "Supabase Auth is not configured." };
  }

  const email = normalizeEmail(formData.get("email"));
  const token = String(formData.get("otp") ?? "").replace(/\D/g, "");
  const redirectTo = sanitizeAuthRedirect(formData.get("redirect"));
  const mode = formData.get("mode") === "signup" ? "signup" : "login";

  if (!email || token.length < 6) {
    return { error: "Enter the 6-digit code we sent to your email." };
  }

  const otpSupabase = createOtpSupabaseClient();
  const { data, error } = await otpSupabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    logAuthActionError("verify_email_otp", error, { mode, tokenLength: token.length, type: "email" });
    if (mode === "signup" && getAuthErrorCode(error) === "otp_expired") {
      let reconciledConfirmedSignup = false;
      try {
        const authUser = await getAuthUserByEmail(email);
        if (authUser && isConfirmedAuthUser(authUser)) {
          await ensureUserProfile(authUser, await readPendingSignup(email));
          await clearPendingSignup();
          reconciledConfirmedSignup = true;
        }
      } catch (profileError) {
        logAuthActionError("signup_reconcile_profile", profileError);
        return { error: getAuthErrorMessage(profileError, "Unable to create your profile.") };
      }

      if (reconciledConfirmedSignup) {
        redirect(`/login?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirectTo)}&notice=signup_created`);
      }
    }

    return { error: getAuthErrorMessage(error, "This code has expired or is invalid. Request a new code and try again.") };
  }

  console.info("auth_action_succeeded", { step: "verify_email_otp", mode, type: "email" });

  if (data.session) {
    const supabase = await createServerSupabaseClient();
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    if (sessionError) {
      logAuthActionError("verify_email_otp_set_session", sessionError, { mode });
      return { error: getAuthErrorMessage(sessionError, "Unable to create your session.") };
    }
  }

  if (mode === "signup" && data?.user) {
    try {
      await ensureUserProfile(data.user, await readPendingSignup(email));
      await clearPendingSignup();
    } catch (error) {
      logAuthActionError("signup_create_profile", error);
      return { error: getAuthErrorMessage(error, "Unable to create your profile.") };
    }
  }

  redirect(redirectTo);
}

export async function signOutAction() {
  if (isSupabaseAuthConfigured()) {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
  }

  redirect("/login");
}
