export const ACTIVE_WORKSPACE_COOKIE = "standup_active_workspace_id";

export const activeWorkspaceCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

export function workspaceIdFromDashboardPath(pathname: string) {
  const match = pathname.match(/^\/dashboard\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}
