import Link from "next/link";
import { ArrowRight, CheckCircle2, PlugZap, RefreshCw, Settings, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { integrationCatalog } from "@/features/integrations/catalog";
import { type ConnectionStatus, getConnectionsState } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/dashboard-view-model";
import { syncConnectionAction } from "@/app/(workspace)/settings/actions";

const steps = [
  ["Create workspace", "Default workspace context is ready for local MVP usage."],
  ["Connect services", "Start with GitHub, then add planning, communication, docs, and calendar sources."],
  ["Run first sync", "Normalize provider data into WorkEvents through the Go API Gateway."],
  ["Open dashboard", "Use real connection status and synced events to decide what matters now."],
];

const recommendedServices = new Set(["github", "linear", "slack", "notion"]);

function statusTone(status: string): "neutral" | "green" | "amber" | "red" | "blue" {
  if (status === "connected") return "green";
  if (status === "syncing") return "blue";
  if (status === "needs_config" || status === "needs_auth" || status === "expired") return "amber";
  if (status === "error") return "red";
  return "neutral";
}

function connectionByService(connections: ConnectionStatus[] | undefined) {
  return new Map(connections?.map((connection) => [connection.service, connection]) ?? []);
}

export default async function OnboardingPage() {
  const connectionsState = await getConnectionsState();
  const connections = connectionByService(connectionsState.data?.connections);
  const connectedCount = connectionsState.data?.connections.filter((connection) => connection.hasToken).length ?? 0;
  const firstSyncReady = connectionsState.data?.connections.some((connection) => connection.hasToken && connection.lastSyncedAt) ?? false;

  return (
    <main className="min-h-screen bg-[#f7fbff] px-4 py-8 text-brand-ink sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 border-b border-brand-border pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-primary text-white">
                <Workflow className="h-5 w-5" />
              </span>
              Developer OS
            </Link>
            <h1 className="mt-8 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Connect your workspace in minutes.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-600">
              The fastest path is to connect the services your team already uses, run the first sync, and land on a dashboard backed by real WorkEvents.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/settings">
              <Button variant="secondary">
                <Settings className="h-4 w-4" />
                Connection Center
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button>
                Open dashboard
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </header>

        {connectionsState.error ? (
          <Card className="mt-6 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            The API Gateway is not reachable yet. You can still review the onboarding flow, but connection status will load after the gateway starts.
          </Card>
        ) : null}

        <section className="grid gap-6 py-8 lg:grid-cols-[360px_1fr]">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-surface text-brand-primary">
                <PlugZap className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold">Setup progress</h2>
                <p className="text-sm text-zinc-500">{connectedCount} of {integrationCatalog.length} services connected</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {steps.map(([title, body], index) => {
                const done = index === 0 || (index === 1 && connectedCount > 0) || (index === 2 && firstSyncReady);

                return (
                  <div key={title} className="flex gap-3">
                    <CheckCircle2 className={done ? "mt-0.5 h-4 w-4 text-emerald-600" : "mt-0.5 h-4 w-4 text-zinc-300"} />
                    <div>
                      <p className="text-sm font-medium">{title}</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">{body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Choose your first integrations</h2>
                <p className="mt-2 text-sm text-zinc-500">Recommended first: GitHub, Linear, Slack, and Notion.</p>
              </div>
              <Badge tone="blue">OAuth via API Gateway</Badge>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {integrationCatalog.map((integration) => {
                const connection = connections.get(integration.id);
                const status = connection?.status ?? "available";
                const connected = status === "connected" || status === "syncing";
                const Icon = integration.icon;

                return (
                  <Card key={integration.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-surface text-brand-primary">
                          <Icon className="h-5 w-5" />
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">{integration.name}</p>
                            {recommendedServices.has(integration.id) ? <Badge tone="blue">Recommended</Badge> : null}
                          </div>
                          <p className="mt-2 text-xs leading-5 text-zinc-500">{integration.scope}</p>
                        </div>
                      </div>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-zinc-500">
                      <div>
                        <dt>Status</dt>
                        <dd className="mt-1">
                          <Badge tone={statusTone(status)}>{status.replaceAll("_", " ")}</Badge>
                        </dd>
                      </div>
                      <div>
                        <dt>Last sync</dt>
                        <dd className="mt-1 font-medium text-zinc-900">{formatRelativeTime(connection?.lastSyncedAt)}</dd>
                      </div>
                    </dl>

                    {connection?.lastSyncError ? (
                      <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
                        {connection.lastSyncError}
                      </p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link href={`/integrations/${integration.id}/connect`}>
                        <Button size="sm" variant={connected ? "secondary" : "default"}>
                          {connected ? "Reconnect" : "Connect"}
                        </Button>
                      </Link>
                      <form action={syncConnectionAction}>
                        <input type="hidden" name="service" value={integration.id} />
                        <Button size="sm" variant="secondary" disabled={!connection?.hasToken}>
                          <RefreshCw className="h-4 w-4" />
                          Sync
                        </Button>
                      </form>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="grid gap-4 border-t border-brand-border py-8 md:grid-cols-3">
          <Card className="p-5">
            <p className="text-sm font-semibold">1. Connect</p>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              User starts OAuth from onboarding or Settings. Provider secrets stay in the Go API Gateway.
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-sm font-semibold">2. Normalize</p>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Provider records are transformed into internal WorkEvents before they power product surfaces.
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-sm font-semibold">3. Act</p>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Dashboard, Focus, Weekly Summary, and Chat answer what needs attention now.
            </p>
          </Card>
        </section>
      </div>
    </main>
  );
}
