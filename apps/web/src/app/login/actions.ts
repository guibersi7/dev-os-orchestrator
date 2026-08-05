"use server";

import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/auth/server";
import {
  getAuthCallbackUrl,
  isSupabaseAdminConfigured,
  isSupabaseAuthConfigured,
  sanitizeAuthRedirect,
} from "@/lib/auth/config";
import {
  ensureUserProfile,
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

function isAuthUserAlreadyRegistered(error: { message?: string; status?: number }) {
  const message = error.message?.toLowerCase() ?? "";
  return error.status === 422 || message.includes("already registered") || message.includes("already exists");
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

function logAuthActionError(step: string, error: unknown) {
  if (!error || typeof error !== "object") {
    console.error("auth_action_failed", { step, message: String(error) });
    return;
  }

  console.error("auth_action_failed", {
    step,
    name: "name" in error ? error.name : undefined,
    status: "status" in error ? error.status : undefined,
    code: "code" in error ? error.code : undefined,
    message: "message" in error ? error.message : undefined,
  });
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
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: getAuthCallbackUrl(origin, redirectTo),
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
  const adminSupabase = createAdminSupabaseClient();
  const { error: createUserError } = await adminSupabase.auth.admin.createUser({
    email: profile.email,
    email_confirm: true,
    user_metadata: {
      full_name: profile.fullName,
      phone: profile.phone,
      birth_date: profile.birthDate,
      profession: profile.profession,
      company: profile.company,
    },
  });

  if (createUserError && !isAuthUserAlreadyRegistered(createUserError)) {
    logAuthActionError("signup_create_auth_user", createUserError);
    return { error: getAuthErrorMessage(createUserError, "Unable to create the authentication user.") };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: profile.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: getAuthCallbackUrl(origin, redirectTo),
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

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    logAuthActionError("verify_email_otp", error);
    return { error: getAuthErrorMessage(error, "Unable to verify this code.") };
  }

  if (mode === "signup" && data.user) {
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
