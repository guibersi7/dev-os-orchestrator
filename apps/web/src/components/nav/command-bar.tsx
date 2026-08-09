import { CommandPalette } from "@/components/nav/command-palette";
import { UserMenu } from "@/components/nav/user-menu";
import { WorkspaceSwitcher } from "@/components/nav/workspace-switcher";
import type { WorkspaceOption } from "@/components/nav/workspace-switcher";
import type { CommandItem } from "@/features/command/search";

/**
 * The whole navigation: no sidebar, no tab bar. Three levels, left to right —
 * which workspace, where inside it, and the account.
 */
export function CommandBar({
  workspaceId,
  workspaceName,
  workspaces,
  items,
  initials,
  connectedLabel,
}: {
  workspaceId: string;
  workspaceName: string;
  workspaces: WorkspaceOption[];
  items: CommandItem[];
  initials: string;
  connectedLabel: string;
}) {
  return (
    <div className="flex h-[38px] items-center gap-4 px-5 pt-4">
      <WorkspaceSwitcher workspaceId={workspaceId} workspaceName={workspaceName} workspaces={workspaces} />
      <CommandPalette items={items} />
      <UserMenu connectedLabel={connectedLabel} initials={initials} />
    </div>
  );
}
