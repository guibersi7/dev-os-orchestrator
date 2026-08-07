import { ArrowRight, LayoutDashboard, Plus, ShieldCheck } from "lucide-react";
import { SpringReveal } from "@/components/motion/react-spring-reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getActiveWorkspaceId, getWorkspacesState, type Workspace } from "@/lib/api-client";
import { createDashboardAction, openDashboardAction } from "./actions";

type DashboardsPageProps = {
  searchParams: Promise<{ error?: string }>;
};

function formatWorkspaceDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently updated";
  }

  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function errorCopy(error?: string) {
  if (!error) return null;
  if (error === "missing-name") return "Add a dashboard name before creating it.";
  if (error === "missing-workspace") return "Choose a dashboard to continue.";
  return decodeURIComponent(error).replaceAll("-", " ");
}

function DashboardCard({ workspace, active }: { workspace: Workspace; active: boolean }) {
  return (
    <Card className="group flex min-h-[210px] flex-col justify-between p-5 transition-colors hover:border-[#2A3345] hover:bg-[#141B2A]">
      <div>
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-surface text-[var(--standup-accent-text)]">
            <LayoutDashboard className="h-5 w-5" />
          </span>
          <Badge tone={active ? "green" : "neutral"}>{active ? "Active" : workspace.role ?? "Member"}</Badge>
        </div>
        <h2 className="mt-5 text-lg font-semibold tracking-tight">{workspace.name}</h2>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
          Isolated workspace dashboard for integrations, WorkEvents, focus items, and weekly context.
        </p>
      </div>
      <div className="mt-6 flex items-end justify-between gap-4">
        <div className="text-xs text-muted-foreground">
          <p>Updated</p>
          <p className="mt-1 font-medium text-foreground">{formatWorkspaceDate(workspace.updatedAt)}</p>
        </div>
        <form action={openDashboardAction}>
          <input type="hidden" name="workspaceId" value={workspace.id} />
          <Button size="sm" variant={active ? "secondary" : "default"}>
            Open
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}

export default async function DashboardsPage({ searchParams }: DashboardsPageProps) {
  const [{ error }, activeWorkspaceId, workspacesState] = await Promise.all([
    searchParams,
    getActiveWorkspaceId(),
    getWorkspacesState(),
  ]);
  const workspaces = workspacesState.data?.workspaces ?? [];
  const message = errorCopy(error);

  return (
    <SpringReveal className="mx-auto max-w-6xl space-y-6">
      <section className="flex flex-col gap-5 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-[#6A7489]">
            <ShieldCheck className="h-4 w-4 text-[var(--standup-accent-text)]" />
            Workspace dashboards
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Dashboards</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Choose the workspace context you want to inspect. Each dashboard keeps integrations and synced data isolated.
          </p>
        </div>
        <form action={createDashboardAction} className="flex w-full flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:max-w-[430px] sm:flex-row">
          <Input
            name="name"
            placeholder="New dashboard name"
            aria-label="New dashboard name"
            className="h-10 border-[#212938] bg-[#0B0F1A]"
            required
          />
          <Button className="h-10 sm:w-[132px]">
            <Plus className="h-4 w-4" />
            Create
          </Button>
        </form>
      </section>

      {message ? (
        <Card className="border-[#4A2230] bg-[#22141C] p-4 text-sm capitalize text-[#FF9CAF]">{message}</Card>
      ) : null}
      {workspacesState.error ? (
        <Card className="border-[#4A2230] bg-[#22141C] p-4 text-sm text-[#FF9CAF]">{workspacesState.error}</Card>
      ) : null}

      {workspaces.length === 0 && !workspacesState.error ? (
        <Card className="flex min-h-[260px] flex-col items-start justify-center p-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-brand-surface text-[var(--standup-accent-text)]">
            <LayoutDashboard className="h-5 w-5" />
          </span>
          <h2 className="mt-5 text-lg font-semibold">Create your first dashboard</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Start with a named workspace dashboard, then connect the integrations that should populate its context.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workspaces.map((workspace) => (
            <DashboardCard key={workspace.id} workspace={workspace} active={workspace.id === activeWorkspaceId} />
          ))}
        </div>
      )}
    </SpringReveal>
  );
}
