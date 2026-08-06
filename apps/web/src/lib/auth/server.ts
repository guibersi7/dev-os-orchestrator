import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { getSupabaseAdminConfig, getSupabaseAuthConfig, isSupabaseAuthConfigured } from "@/lib/auth/config";

const FALLBACK_USER_ID = process.env.NEXT_PUBLIC_USER_ID ?? "00000000-0000-4000-8000-000000000002";

export async function createServerSupabaseClient() {
  const { url, publishableKey } = getSupabaseAuthConfig();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
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

export async function getCurrentUser(): Promise<User | null> {
  if (!isSupabaseAuthConfigured()) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return data.user;
}

export async function getGatewayUserId() {
  const user = await getCurrentUser();
  return user?.id ?? FALLBACK_USER_ID;
}
