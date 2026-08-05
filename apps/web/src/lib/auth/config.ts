export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

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

export function isSupabaseAdminConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdminConfig() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase admin access is not configured.");
  }

  return {
    url: SUPABASE_URL,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
  };
}

export function getAuthCallbackUrl(origin: string, redirectTo: string) {
  const appOrigin = APP_URL || origin;
  return `${appOrigin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`;
}

export function getAuthConfirmUrl(origin: string, redirectTo: string, mode: "login" | "signup") {
  const appOrigin = APP_URL || origin;
  return `${appOrigin}/auth/confirm?redirect=${encodeURIComponent(redirectTo)}&mode=${mode}`;
}

export function sanitizeAuthRedirect(value: FormDataEntryValue | string | null | undefined) {
  const fallback = "/dashboard";
  const redirectTo = typeof value === "string" ? value : "";

  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    return fallback;
  }

  if (redirectTo.startsWith("/login") || redirectTo.startsWith("/auth/callback") || redirectTo.startsWith("/auth/confirm")) {
    return fallback;
  }

  return redirectTo;
}
