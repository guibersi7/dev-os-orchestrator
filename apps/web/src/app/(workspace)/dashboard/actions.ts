"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createWorkspace } from "@/lib/api-client";
import { ACTIVE_WORKSPACE_COOKIE, activeWorkspaceCookieOptions } from "@/lib/workspace-session";

export async function openDashboardAction(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "").trim();
  if (!workspaceId) {
    redirect("/dashboard?error=missing-workspace");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, activeWorkspaceCookieOptions);
  redirect(`/dashboard/${encodeURIComponent(workspaceId)}`);
}

export async function createDashboardAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect("/dashboard?error=missing-name");
  }

  const result = await createWorkspace(name);
  const workspace = result.data?.workspace;
  if (!workspace) {
    redirect(`/dashboard?error=${encodeURIComponent(result.error ?? "create-failed")}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspace.id, activeWorkspaceCookieOptions);
  revalidatePath("/dashboard");
  redirect(`/dashboard/${encodeURIComponent(workspace.id)}`);
}
