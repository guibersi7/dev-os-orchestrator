import Link from "next/link";
import { StandupMark } from "@/components/brand/brand-mark";
import { CommandPalette } from "@/components/nav/command-palette";
import { UserMenu } from "@/components/nav/user-menu";
import type { CommandItem } from "@/features/command/search";

/**
 * The whole navigation: no sidebar, no tab bar. A dashboard opened once each
 * morning does not need persistent destinations; it needs a command line.
 */
export function CommandBar({
  workspaceName,
  items,
  initials,
  connectedLabel,
}: {
  workspaceName: string;
  items: CommandItem[];
  initials: string;
  connectedLabel: string;
}) {
  return (
    <div className="flex h-[38px] items-center gap-4 px-5 pt-4">
      <Link className="flex shrink-0 items-center gap-2" href="/today">
        <StandupMark size={20} />
        <span className="hidden text-[12.5px] text-[#9AA4BA] sm:inline">{workspaceName}</span>
      </Link>
      <CommandPalette items={items} />
      <UserMenu connectedLabel={connectedLabel} initials={initials} />
    </div>
  );
}
