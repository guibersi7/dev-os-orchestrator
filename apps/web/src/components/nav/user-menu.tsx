"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CreditCard, LogOut, Plug, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { id: "sources", label: "Fontes conectadas", icon: Plug, href: "/settings" },
  { id: "preferences", label: "Preferências", icon: Settings, href: "/settings" },
  { id: "members", label: "Membros", icon: Users, href: "/settings" },
  { id: "billing", label: "Faturamento", icon: CreditCard, href: "/settings" },
  { id: "signout", label: "Sair", icon: LogOut, href: "/login" },
];

/**
 * Sources are not in the nav — they live here as the first item, carrying the
 * connected count in accent. It is the only highlighted entry, because it is
 * the only one still asking for something.
 */
export function UserMenu({ initials, connectedLabel }: { initials: string; connectedLabel: string }) {
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

  return (
    <div className="relative" ref={container}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "flex h-[26px] w-[26px] items-center justify-center rounded-full border text-[11px] font-medium transition-colors",
          open ? "border-[#39435A] bg-[#1A2130]" : "border-[#212938] bg-[#161C2B] hover:border-[#39435A]",
        )}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {initials}
      </button>

      {open ? (
        <div
          className="absolute right-0 top-[34px] z-40 w-[220px] overflow-hidden rounded-[11px] border border-[#212938] bg-[#121826] py-1 shadow-[0_18px_44px_-20px_rgba(0,0,0,.9)]"
          role="menu"
        >
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const isSources = item.id === "sources";
            return (
              <Link
                key={item.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-[13px] text-[#9AA4BA] transition-colors hover:bg-[#1A2130] hover:text-[#E9EDF7]"
                href={item.href}
                onClick={() => setOpen(false)}
                role="menuitem"
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </span>
                {isSources ? (
                  <span className="font-mono text-[11px] text-[var(--standup-accent-text)]">{connectedLabel}</span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
