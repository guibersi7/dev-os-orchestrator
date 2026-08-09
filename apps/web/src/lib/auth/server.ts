import { cookies } from "next/headers";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { getSupabaseAdminConfig, getSupabaseAuthConfig, isSupabaseAuthConfigured } from "@/lib/auth/config";

const FALLBACK_USER_ID = process.env.NEXT_PUBLIC_USER_ID ?? "00000000-0000-4000-8000-000000000002";
type CookieStore = Awaited<ReturnType<typeof cookies>>;

function hasSupabaseAuthCookie(cookieStore: CookieStore) {
  return cookieStore.getAll().some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token"));
}

export async function createServerSupabaseClient(cookieStore?: CookieStore) {
  const { url, publishableKey } = getSupabaseAuthConfig();
  const resolvedCookieStore = cookieStore ?? (await cookies());

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return resolvedCookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            resolvedCookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always set cookies. Middleware refreshes sessions.
        }
      },
    },
  });
}

export function createAdminSupabaseClient() {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createOtpSupabaseClient() {
  const { url, publishableKey } = getSupabaseAuthConfig();

  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "implicit",
      persistSession: false,
    },
  });
}

export const getCurrentUser = cache(async function getCurrentUser(): Promise<User | null> {
  if (!isSupabaseAuthConfigured()) {
    return null;
  }

  const cookieStore = await cookies();
  if (!hasSupabaseAuthCookie(cookieStore)) {
    return null;
  }

  const supabase = await createServerSupabaseClient(cookieStore);
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return data.user;
});

export const getGatewayUserId = cache(async function getGatewayUserId() {
  const user = await getCurrentUser();
  return user?.id ?? FALLBACK_USER_ID;
});
