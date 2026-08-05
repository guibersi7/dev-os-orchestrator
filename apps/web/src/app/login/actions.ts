"use server";

import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/auth/server";
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
    return { error: error instanceof Error ? error.message : "Unable to check this email." };
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
    return { error: error.message };
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
    return { error: error instanceof Error ? error.message : "Unable to check this email." };
  }

  const origin = await getRequestOrigin();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: profile.email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: getAuthCallbackUrl(origin, redirectTo),
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
    return { error: error.message };
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
    type: mode === "signup" ? "signup" : "email",
  });

  if (error) {
    return { error: error.message };
  }

  if (mode === "signup" && data.user) {
    try {
      await ensureUserProfile(data.user, await readPendingSignup(email));
      await clearPendingSignup();
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unable to create your profile." };
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
