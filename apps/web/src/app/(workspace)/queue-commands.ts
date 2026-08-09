"use server";

import { getActiveWorkspaceId, getDashboardState } from "@/lib/api-client";
import { getInitialAuthSession, type AuthUser } from "@/lib/auth-session";
import { getConnectionsState } from "@/lib/api-client";
import { normalizeDashboardPayload } from "@/lib/dashboard-view-model";
import { normalizeWorkEvents } from "@/lib/work-event";
import { buildQueue } from "@/lib/queue/build";
import { buildViewerIdentity, isViewerActor } from "@/lib/viewer-identity";
import type { CommandItem } from "@/features/command/search";

/**
 * The palette lists destinations instantly from the shell, then folds in the
 * queue once this resolves. Loading the dashboard in the shell itself would
 * make every workspace route wait on it, and ⌘K has to paint immediately.
 *
 * Only async functions may be exported from a "use server" module.
 */
export async function loadQueueCommands(): Promise<CommandItem[]> {
  const workspaceId = await getActiveWorkspaceId();
  const [dashboardState, connectionsState, session] = await Promise.all([
    getDashboardState(workspaceId),
    getConnectionsState(),
    getInitialAuthSession(),
  ]);

  const dashboard = normalizeDashboardPayload(dashboardState.data?.dashboard);
  const events = normalizeWorkEvents(dashboard.events, workspaceId);
  const identity = buildViewerIdentity((session.user ?? null) as AuthUser | null, connectionsState.data?.connections ?? [], events);
  const queue = buildQueue(events, { isViewer: (event) => isViewerActor(event, identity) });

  return queue.map((item) => ({
    id: `queue-${item.id}`,
    kind: "queue" as const,
    label: item.title,
    hint: item.source,
    href: item.action.href,
  }));
}
