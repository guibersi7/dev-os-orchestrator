export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function isSupabaseAuthConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

export function getSupabaseAuthConfig() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Supabase Auth is not configured.");
  }

  return {
    url: SUPABASE_URL,
    publishableKey: SUPABASE_PUBLISHABLE_KEY,
  };
}

export function sanitizeAuthRedirect(value: FormDataEntryValue | string | null | undefined) {
  const fallback = "/dashboard";
  const redirectTo = typeof value === "string" ? value : "";

  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    return fallback;
  }

  if (redirectTo.startsWith("/login") || redirectTo.startsWith("/auth/callback")) {
    return fallback;
  }

  return redirectTo;
}
