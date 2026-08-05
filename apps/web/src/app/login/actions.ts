"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { isSupabaseAuthConfigured, sanitizeAuthRedirect } from "@/lib/auth/config";

export type AuthActionState = {
  error?: string;
  sent?: boolean;
};

async function getRequestOrigin() {
  const headerStore = await headers();
  const origin = headerStore.get("origin");
  const host = headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") ?? "http";

  return origin ?? `${protocol}://${host}`;
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
      redirectTo: `${origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`,
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

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const redirectTo = sanitizeAuthRedirect(formData.get("redirect"));

  if (!email) {
    return { error: "Enter your email to receive the code." };
  }

  const origin = await getRequestOrigin();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  redirect(`/login/verify?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirectTo)}`);
}

export async function verifyEmailOtpAction(_previousState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  if (!isSupabaseAuthConfigured()) {
    return { error: "Supabase Auth is not configured." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("otp") ?? "").replace(/\D/g, "");
  const redirectTo = sanitizeAuthRedirect(formData.get("redirect"));

  if (!email || token.length < 6) {
    return { error: "Enter the 6-digit code we sent to your email." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    return { error: error.message };
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
