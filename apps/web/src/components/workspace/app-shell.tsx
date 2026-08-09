import { CommandBar } from "@/components/nav/command-bar";
import { getConnectionsState, getWorkspacesState, getActiveWorkspaceId } from "@/lib/api-client";
import { getInitialAuthSession } from "@/lib/auth-session";
import { DESTINATIONS } from "@/features/command/search";
import type { CommandItem } from "@/features/command/search";
import { serviceName } from "@/lib/dashboard/rail";

/**
 * Navigation for every workspace route: the command bar and nothing else.
 *
 * This used to be a sticky header with a tab strip. A dashboard opened once
 * each morning does not need persistent destinations, and a permanent row of
 * them quietly contradicts a product whose whole claim is that it decides what
 * matters. It also meant two navigations stacked once the command bar arrived.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const workspaceId = await getActiveWorkspaceId();
  const [workspacesState, connectionsState, session] = await Promise.all([
    getWorkspacesState(workspaceId),
    getConnectionsState(),
    getInitialAuthSession(),
  ]);

  const workspace = workspacesState.data?.workspaces.find((item) => item.id === workspaceId);
  const connections = connectionsState.data?.connections ?? [];
  const connected = connections.filter((connection) => connection.status === "connected").length;

  const items: CommandItem[] = [
    ...DESTINATIONS,
    ...connections.map((connection) => ({
      id: `source-${connection.service}`,
      kind: "source" as const,
      label: serviceName(connection.service),
      hint: connection.status,
      href: `/integrations/${connection.service}`,
    })),
  ];

  const initials = (session.user?.name ?? "S").slice(0, 1).toUpperCase();

  return (
    <div className="min-h-screen bg-[#080C15] text-brand-ink">
      <CommandBar
        connectedLabel={`${connected}/7`}
        initials={initials}
        items={items}
        workspaceName={workspace?.name ?? "Standup"}
      />
      <main>{children}</main>
    </div>
  );
}
