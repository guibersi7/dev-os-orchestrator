import Link from "next/link";
import { ArrowRight, CheckCircle2, GitPullRequest, RefreshCw, ShieldCheck, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { integrationCatalog } from "@/features/integrations/catalog";
import { type ConnectionStatus, getConnectionsState } from "@/lib/api-client";
import { syncConnectionAction } from "@/app/(workspace)/settings/actions";

const steps = [
  ["Connect GitHub", "Authorize Developer OS using the GitHub OAuth screen."],
  ["Sync engineering data", "We list repositories, recent PRs, reviews, comments, issues, and failed checks."],
  ["Open dashboard", "Your first dashboard is generated from normalized WorkEvents."],
];

const nextServices = integrationCatalog.filter((integration) => integration.id !== "github");

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
  const githubConnection = connections.get("github");
  const githubStatus = githubConnection?.status ?? "available";
  const githubConnected = githubConnection?.hasToken ?? false;
  const githubSynced = Boolean(githubConnection?.lastSyncedAt);

  return (
    <main className="min-h-screen bg-[#f7fbff] px-4 py-8 text-brand-ink sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-brand-border pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-primary text-white">
                <Workflow className="h-5 w-5" />
              </span>
              Developer OS
            </Link>
            <h1 className="mt-8 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Start with GitHub. Get to your dashboard in a few clicks.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-600">
              Connect your GitHub account with OAuth, sync recent engineering activity, and open Developer OS with real PR, review, issue, and check context.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Link href="/integrations/github/connect">
              <Button>
                <GitPullRequest className="h-4 w-4" />
                Connect GitHub
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="secondary">
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

        <section className="grid gap-6 py-8 lg:grid-cols-[380px_1fr]">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-surface text-brand-primary">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold">Fast setup</h2>
                <p className="text-sm text-zinc-500">OAuth user authorization in a few clicks.</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {steps.map(([title, body], index) => {
                const done = (index === 0 && githubConnected) || (index === 1 && githubSynced) || (index === 2 && githubSynced);

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

          <Card className="overflow-hidden p-0">
            <div className="border-b border-brand-border bg-white p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-brand-primary text-white">
                    <GitPullRequest className="h-6 w-6" />
                  </span>
                  <div>
                    <Badge tone={statusTone(githubStatus)}>{githubStatus.replaceAll("_", " ")}</Badge>
                    <h2 className="mt-4 text-2xl font-semibold tracking-tight">Connect GitHub</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
                      Authorize Developer OS on GitHub. After OAuth, we use your user token to read accessible repositories and build your first dashboard.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Link href="/integrations/github/connect">
                    <Button>
                      {githubConnected ? "Reconnect GitHub" : "Connect GitHub"}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <form action={syncConnectionAction}>
                    <input type="hidden" name="service" value="github" />
                    <Button variant="secondary" disabled={!githubConnected}>
                      <RefreshCw className="h-4 w-4" />
                      Sync GitHub
                    </Button>
                  </form>
                </div>
              </div>
            </div>

            <div className="grid gap-0 divide-y divide-brand-border bg-brand-muted/40 md:grid-cols-3 md:divide-x md:divide-y-0">
              <div className="p-5">
                <p className="text-sm font-semibold">Repositories</p>
                <p className="mt-2 text-sm leading-6 text-zinc-500">List repos from your GitHub account or configured organization.</p>
              </div>
              <div className="p-5">
                <p className="text-sm font-semibold">Pull requests</p>
                <p className="mt-2 text-sm leading-6 text-zinc-500">Paginate recent PRs, reviews, comments, and failed checks.</p>
              </div>
              <div className="p-5">
                <p className="text-sm font-semibold">Dashboard metrics</p>
                <p className="mt-2 text-sm leading-6 text-zinc-500">Generate review time, reviewers, lead time, and blocker signals.</p>
              </div>
            </div>
          </Card>
        </section>

        <section className="border-t border-brand-border py-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">Add more context later</h2>
              <p className="mt-2 text-sm text-zinc-500">After GitHub is working, connect planning, docs, chat, and calendar with the same OAuth pattern.</p>
            </div>
            <Link href="/settings">
              <Button variant="secondary">Open all integrations</Button>
            </Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {nextServices.map((integration) => {
              const connection = connections.get(integration.id);
              const status = connection?.status ?? "available";
              const Icon = integration.icon;

              return (
                <Link
                  key={integration.id}
                  href={`/integrations/${integration.id}/connect`}
                  className="rounded-md border border-brand-border bg-white p-4 transition-colors hover:border-brand-primary"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-surface text-brand-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">{integration.name}</p>
                        <p className="mt-1 text-xs leading-5 text-zinc-500">{integration.scope}</p>
                      </div>
                    </div>
                    <Badge tone={statusTone(status)}>{status.replaceAll("_", " ")}</Badge>
                  </div>
                  <p className="mt-3 text-xs font-medium text-zinc-500">OAuth user connection</p>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
