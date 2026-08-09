import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAuthConfig, isSupabaseAuthConfigured } from "@/lib/auth/config";
import { ACTIVE_WORKSPACE_COOKIE, activeWorkspaceCookieOptions, workspaceIdFromDashboardPath } from "@/lib/workspace-session";

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
  "/timeline",
  "/weekly",
];

function isProtectedPath(pathname: string) {
  return protectedPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function persistDashboardWorkspace(request: NextRequest, response: NextResponse) {
  const workspaceId = workspaceIdFromDashboardPath(request.nextUrl.pathname);
  if (!workspaceId) {
    return response;
  }

  request.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspaceId);
  response.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, activeWorkspaceCookieOptions);
  return response;
}

export async function updateAuthSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const isProtected = isProtectedPath(request.nextUrl.pathname);

  if (!isProtected) {
    return persistDashboardWorkspace(request, response);
  }

  if (!isSupabaseAuthConfigured()) {
    return persistDashboardWorkspace(request, response);
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

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return persistDashboardWorkspace(request, NextResponse.redirect(loginUrl));
  }

  return persistDashboardWorkspace(request, response);
}
