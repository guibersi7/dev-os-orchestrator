"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { StandupMark } from "@/components/brand/brand-mark";
import { cn } from "@/lib/utils";

export type WorkspaceOption = {
  id: string;
  name: string;
};

/**
 * Workspace selection sits one level above ⌘K, which navigates inside a single
 * workspace. Keeping them apart means the palette never has to answer for two
 * different contexts at once.
 *
 * Navigating to /dashboard/{id} is what switches: middleware reads the id from
 * the path and writes the active-workspace cookie, which is what /today then
 * resolves.
 */
export function WorkspaceSwitcher({
  workspaceId,
  workspaceName,
  workspaces,
}: {
  workspaceId: string;
  workspaceName: string;
  workspaces: WorkspaceOption[];
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    function onClick(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  // With nothing to switch between, the mark is a link home and nothing more.
  if (workspaces.length < 2) {
    return (
      <a className="flex shrink-0 items-center gap-2" href="/today">
        <StandupMark size={20} />
        <span className="hidden text-[12.5px] text-[#9AA4BA] sm:inline">{workspaceName}</span>
      </a>
    );
  }

  return (
    <div className="relative shrink-0" ref={container}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "flex h-[30px] items-center gap-2 rounded-[7px] border px-2 transition-colors",
          open ? "border-[#39435A] bg-[#1A2130]" : "border-transparent hover:border-[#212938] hover:bg-[#141B2A]",
        )}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <StandupMark size={20} />
        <span className="hidden max-w-[160px] truncate text-[12.5px] text-[#9AA4BA] sm:inline">{workspaceName}</span>
        <ChevronDown className="h-3 w-3 text-[#79839B]" />
      </button>

      {open ? (
        <div
          className="absolute left-0 top-[36px] z-40 w-[248px] overflow-hidden rounded-[11px] border border-[#212938] bg-[#121826] py-1 shadow-[0_18px_44px_-20px_rgba(0,0,0,.9)]"
          role="menu"
        >
          <p className="font-mono px-3 pb-1 pt-2 text-[10.5px] uppercase tracking-[0.06em] text-[#79839B]">
            Workspaces
          </p>
          {workspaces.map((workspace) => {
            const current = workspace.id === workspaceId;
            return (
              // Document navigation, so middleware sees the path and persists
              // the active workspace before the next render.
              <a
                key={workspace.id}
                aria-current={current ? "true" : undefined}
                className="flex items-center justify-between gap-3 px-3 py-2 text-[13px] text-[#9AA4BA] transition-colors hover:bg-[#1A2130] hover:text-[#E9EDF7]"
                href={`/dashboard/${encodeURIComponent(workspace.id)}`}
                role="menuitem"
              >
                <span className="truncate">{workspace.name}</span>
                {current ? <Check className="h-3.5 w-3.5 shrink-0 text-[var(--standup-accent-text)]" /> : null}
              </a>
            );
          })}
          <div className="mt-1 border-t border-[#1B2230] pt-1">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-[#9AA4BA] transition-colors hover:bg-[#1A2130] hover:text-[#E9EDF7]"
              href="/dashboard"
              role="menuitem"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo workspace
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
