"use client";

import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";

export function LandingAuthControl() {
  const { isAuthenticated, session } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const user = session.user;

  useEffect(() => {
    if (!isOpen) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [isOpen]);

  if (!isAuthenticated || !user) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href="/login">Sign in</Link>
      </Button>
    );
  }

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label="Open account menu"
        aria-expanded={isOpen}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md border border-[#212938] bg-[#121826] text-sm font-semibold text-[var(--standup-accent-text)] transition-colors hover:border-[var(--standup-accent-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setIsOpen((current) => !current)}
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-11 z-20 w-52 rounded-md border border-[#212938] bg-[#121826] p-1 shadow-xl shadow-black/30">
          <div className="border-b border-[#212938] px-3 py-2">
            <p className="truncate text-sm font-semibold text-[#E9EDF7]">{user.name}</p>
            <p className="truncate text-xs text-[#6A7489]">{user.email}</p>
          </div>
          <Link
            href="/settings"
            className="mt-1 flex h-9 items-center gap-2 rounded-md px-3 text-sm text-[#9AA4BA] transition-colors hover:bg-[#1A2130] hover:text-[#E9EDF7]"
            onClick={() => setIsOpen(false)}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-[#9AA4BA] transition-colors hover:bg-[#1A2130] hover:text-[#E9EDF7]"
              onClick={() => setIsOpen(false)}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
