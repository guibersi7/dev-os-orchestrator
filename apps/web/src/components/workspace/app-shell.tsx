import { Bell, GitPullRequest, LayoutDashboard, MessageSquareText, Settings } from "lucide-react";
import { HeaderAuthControl } from "@/components/auth/header-auth-control";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/server";

const navItems = [
  { href: "/dashboard", label: "Dashboards", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquareText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const userLabel = user?.email ?? "Signed in";

  return (
    <div className="min-h-screen bg-[#080C15] text-brand-ink">
      <header className="sticky top-0 z-10 border-b border-brand-border bg-[#0B0F1A]/90 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {/* Intentionally use document navigation to avoid protected-route RSC requests. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/dashboard" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-primary text-[#E9EDF7]">
              <GitPullRequest className="h-5 w-5" />
            </a>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#E9EDF7]">Standup</p>
              <p className="truncate text-xs text-[#6A7489]">{userLabel}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex items-center gap-1 rounded-md border border-border bg-[#121826] p-1">
              {navItems.map((item) => (
                <Button key={item.href} asChild variant="ghost" size="sm" className="text-[#9AA4BA] hover:text-brand-ink">
                  <a href={item.href}>
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </a>
                </Button>
              ))}
            </nav>
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell className="h-4 w-4" />
            </Button>
            <Button asChild variant="secondary" size="sm">
              <a href="/settings">Sync</a>
            </Button>
            <HeaderAuthControl />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
