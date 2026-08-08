import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, PlugZap, RefreshCw, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HeaderAuthControl } from "@/components/auth/header-auth-control";
import { getIntegrationCatalogItem, integrationCatalog } from "@/features/integrations/catalog";
import { type ConnectionStatus, getConnectionsState } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/dashboard-view-model";
import { syncConnectionAction } from "@/app/(workspace)/settings/actions";

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

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<{ connectionError?: string; service?: string; missing?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const connectionsState = await getConnectionsState();
  const connections = connectionByService(connectionsState.data?.connections);
  const connectedCount = integrationCatalog.filter((integration) => connections.get(integration.id)?.hasToken).length;
  const configuredCount = integrationCatalog.filter((integration) => {
    const connection = connections.get(integration.id);

    return connection ? connection.providerConfigured : false;
  }).length;
  const syncedCount = integrationCatalog.filter((integration) => Boolean(connections.get(integration.id)?.lastSyncedAt)).length;
  const failedIntegration = params?.service ? getIntegrationCatalogItem(params.service) : undefined;
  const failedServiceName = failedIntegration?.name ?? params?.service ?? "Provider";
  const missingEnv = params?.missing?.split(",").filter(Boolean) ?? [];
  const connectionError = params?.connectionError;
  const connectionErrorTitle =
    connectionError === "unknown_service"
      ? "This integration is not available."
      : connectionError === "needs_config"
        ? `${failedServiceName} OAuth is not configured yet.`
        : connectionError === "oauth_callback_failed"
          ? `${failedServiceName} authorization could not be completed.`
          : `${failedServiceName} connection could not start.`;
  const connectionErrorMessage =
    connectionError === "needs_config"
      ? `Add the missing ${failedServiceName} OAuth environment variables to the API Gateway environment and retry.`
      : connectionError === "oauth_callback_failed"
        ? "The provider returned to Standup, but the gateway could not finish the token exchange."
        : `Retry ${failedServiceName} from this page after checking the gateway response.`;

  return (
    <main className="min-h-screen bg-[#080C15] px-4 py-8 text-brand-ink sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-brand-border pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-primary text-[#E9EDF7]">
                <Workflow className="h-5 w-5" />
              </span>
              Standup
            </Link>
            <h1 className="mt-8 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Connect your work tools in one place.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#9AA4BA]">
              Authorize engineering, planning, docs, chat, and calendar sources from a single connection center.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button asChild>
              <Link href="/settings">
                Open Connection Center
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
            <HeaderAuthControl />
          </div>
        </header>

        {connectionsState.error ? (
          <Card className="mt-6 border-[#4A3A18] bg-[#241F14] p-4 text-sm text-[#F6C66A]">
            The API Gateway is not reachable yet. You can still review the onboarding flow, but connection status will load after the gateway starts.
          </Card>
        ) : null}
        {connectionError ? (
          <Card className="mt-6 border-[#4A3A18] bg-[#241F14] p-4 text-sm leading-6 text-[#F6C66A]">
            <div className="flex gap-3">
              <AlertTriangle className="mt-1 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">{connectionErrorTitle}</p>
                <p className="mt-1">{connectionErrorMessage}</p>
                {missingEnv.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {missingEnv.map((env) => (
                      <code key={env} className="rounded-md bg-[#121826] px-2 py-1 text-xs text-[#F6C66A]">
                        {env}
                      </code>
                    ))}
                  </div>
                ) : null}
                {failedIntegration ? (
                  <Button asChild size="sm" className="mt-4">
                    <a href={`/integrations/${failedIntegration.id}/connect`}>
                      Retry {failedIntegration.name}
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
        ) : null}

        <section className="grid gap-4 py-8 sm:grid-cols-3">
          {[
            ["Connected", connectedCount],
            ["Configured", configuredCount],
            ["Synced", syncedCount],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-brand-border bg-[#121826] p-4">
              <p className="text-sm text-[#9AA4BA]">{label}</p>
              <p className="mt-2 text-3xl font-semibold">{value}</p>
            </div>
          ))}
        </section>

        <section className="border-t border-brand-border py-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <PlugZap className="h-4 w-4 text-brand-primary" />
                <h2 className="text-base font-semibold">Connection Center</h2>
              </div>
              <p className="mt-2 text-sm text-[#9AA4BA]">
                Connect, reconnect, and sync every integration from the same surface.
              </p>
            </div>
            <Badge tone="blue">{integrationCatalog.length} services</Badge>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {integrationCatalog.map((integration) => {
              const connection = connections.get(integration.id);
              const status = connection?.status ?? "available";
              const connected = status === "connected" || status === "syncing";
              const Icon = integration.icon;

              return (
                <Card key={integration.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-surface text-brand-primary">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{integration.name}</p>
                        <p className="mt-1 text-xs leading-5 text-[#9AA4BA]">{integration.scope}</p>
                      </div>
                    </div>
                    <Badge tone={statusTone(status)}>{status.replaceAll("_", " ")}</Badge>
                  </div>

                  <dl className="mt-4 grid gap-3 text-xs text-[#9AA4BA] sm:grid-cols-3">
                    <div>
                      <dt>Token</dt>
                      <dd className="mt-1 font-medium text-brand-ink">{connection?.hasToken ? "Stored" : "Missing"}</dd>
                    </div>
                    <div>
                      <dt>Provider</dt>
                      <dd className="mt-1 font-medium text-brand-ink">{connection?.providerConfigured ? "Configured" : "Needs env"}</dd>
                    </div>
                    <div>
                      <dt>Last sync</dt>
                      <dd className="mt-1 font-medium text-brand-ink">{formatRelativeTime(connection?.lastSyncedAt)}</dd>
                    </div>
                  </dl>

                  {connection?.lastSyncError ? (
                    <p className="mt-3 rounded-md border border-[#4A2230] bg-[#22141C] p-3 text-xs leading-5 text-[#FF9CAF]">
                      {connection.lastSyncError}
                    </p>
                  ) : null}

                  {integration.connect?.permissionBullets.length ? (
                    <div className="mt-4 rounded-md border border-brand-border bg-[#121826] p-3">
                      <p className="text-xs font-medium text-brand-ink">{integration.connect.preConnectTitle}</p>
                      <ul className="mt-2 space-y-1 text-xs leading-5 text-[#9AA4BA]">
                        {integration.connect.permissionBullets.slice(0, 3).map((bullet) => (
                          <li key={bullet}>- {bullet}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant={connected ? "secondary" : "default"}>
                      <a href={`/integrations/${integration.id}/connect`}>
                        {connected ? "Reconnect" : "Connect"} {integration.name}
                      </a>
                    </Button>
                    <form action={syncConnectionAction}>
                      <input type="hidden" name="service" value={integration.id} />
                      <Button size="sm" variant="secondary" disabled={!connection?.hasToken}>
                        <RefreshCw className="h-4 w-4" />
                        Sync
                      </Button>
                    </form>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/integrations/${integration.id}`} prefetch={false}>Details</Link>
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="border-t border-brand-border py-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-[#6EE7B7]" />
              <div>
                <h2 className="text-base font-semibold">Dashboard unlocks as sources sync</h2>
                <p className="mt-2 text-sm text-[#9AA4BA]">
                  Standup normalizes connected sources into WorkEvents for reviews, blockers, decisions, and planning context.
                </p>
              </div>
            </div>
            <Button asChild variant="secondary">
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
