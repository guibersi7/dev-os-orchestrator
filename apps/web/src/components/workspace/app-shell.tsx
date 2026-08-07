import Link from "next/link";
import { Bell, GitPullRequest, LayoutDashboard, MessageSquareText, Settings } from "lucide-react";
import { HeaderAuthControl } from "@/components/auth/header-auth-control";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/server";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquareText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const userLabel = user?.email ?? "Signed in";

  return (
    <div className="min-h-screen bg-[#080C15] text-brand-ink">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-brand-border bg-[#121826] px-4 py-5 lg:block">
        <Link href="/dashboard" className="flex items-center gap-3 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-primary text-[#E9EDF7]">
            <GitPullRequest className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold">Standup</span>
            <span className="block max-w-[170px] truncate text-xs text-[#6A7489]">{userLabel}</span>
          </span>
        </Link>
        <nav className="mt-8 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-10 items-center gap-3 rounded-md px-3 text-sm text-[#9AA4BA] transition-colors hover:bg-brand-muted hover:text-brand-ink",
                item.href === "/dashboard" && "bg-brand-surface text-brand-ink",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-brand-border bg-[#0B0F1A]/90 backdrop-blur">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#6A7489]">GitHub first</p>
              <p className="text-sm font-medium text-[#E9EDF7]">Today’s engineering context</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" aria-label="Notifications">
                <Bell className="h-4 w-4" />
              </Button>
              <Button variant="secondary" size="sm">
                Sync now
              </Button>
              <HeaderAuthControl />
            </div>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
