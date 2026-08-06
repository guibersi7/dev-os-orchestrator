import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAuthConfig, isSupabaseAuthConfigured, sanitizeAuthRedirect } from "@/lib/auth/config";

const protectedPathPrefixes = [
  "/chat",
  "/dashboard",
  "/integrations",
  "/issues",
  "/onboarding",
  "/pull-requests",
  "/repositories",
  "/settings",
  "/setup",
  "/today",
];

function isProtectedPath(pathname: string) {
  return protectedPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function updateAuthSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!isSupabaseAuthConfigured()) {
    return response;
  }

  const { url, publishableKey } = getSupabaseAuthConfig();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtectedPath(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (user && request.nextUrl.pathname === "/login") {
    const redirectTo = sanitizeAuthRedirect(request.nextUrl.searchParams.get("redirect"));
    return NextResponse.redirect(new URL(redirectTo, request.url));
  }

  return response;
}
