import Link from "next/link";
import { AlertTriangle, ArrowRight, ExternalLink, PlugZap, RefreshCw, Unplug } from "lucide-react";
import { AnimeStagger } from "@/components/motion/anime-stagger";
import { SpringReveal } from "@/components/motion/react-spring-reveal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getIntegrationCatalogItem, integrationCatalog } from "@/features/integrations/catalog";
import { type ConnectionStatus, getConfigState, getConnectionsState } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/dashboard-view-model";
import { disconnectConnectionAction, syncConnectionAction } from "./actions";

const settings = [
  ["Authentication", "OAuth connector framework for GitHub, Slack, Linear, Jira, Trello, Notion, and Calendar"],
  ["Background sync", "Initial sync, webhook ingestion, and scheduled polling routed through the Go gateway"],
  ["AI provider", "Provider abstraction configured"],
  ["Data model", "External entities normalized into WorkEvents before they reach product features"],
];

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

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ connectionError?: string; service?: string; missing?: string }>;
}) {
  const params = await searchParams;
  const [configState, connectionsState] = await Promise.all([getConfigState(), getConnectionsState()]);
  const config = configState.data?.config;
  const connections = connectionByService(connectionsState.data?.connections);
  const visibleSources = new Set(config?.dashboardPreferences.visibleSources ?? []);
  const failedIntegration = params?.service ? getIntegrationCatalogItem(params.service) : undefined;
  const failedServiceName = failedIntegration?.name ?? params?.service ?? "Provider";
  const missingEnv = params?.missing?.split(",").filter(Boolean) ?? [];
  const connectionError = params?.connectionError;
  const connectionErrorTitle =
    connectionError === "unknown_service"
      ? "This integration is not available."
      : connectionError === "needs_config"
        ? `${failedServiceName} OAuth is not configured yet.`
        : `${failedServiceName} connection could not start.`;
  const connectionErrorMessage =
    connectionError === "needs_config"
      ? `Add the missing ${failedServiceName} OAuth environment variables to the API Gateway environment and retry.`
      : `Retry ${failedServiceName} from this page after checking the gateway response.`;

  return (
    <SpringReveal className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">Workspace configuration for the multi-service MVP.</p>
      </div>
      {configState.error ? (
        <Card className="border-[#4A2230] bg-[#22141C] p-4 text-sm text-[#FF9CAF]">{configState.error}</Card>
      ) : null}
      {connectionsState.error ? (
        <Card className="border-[#4A2230] bg-[#22141C] p-4 text-sm text-[#FF9CAF]">{connectionsState.error}</Card>
      ) : null}
      {connectionError ? (
        <Card className="border-[#4A3A18] bg-[#241F14] p-4 text-sm leading-6 text-[#F6C66A]">
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

      <Card className="p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <PlugZap className="h-4 w-4 text-brand-primary" />
              <h2 className="text-base font-semibold">Connection Center</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Connect, sync, reconnect, and disconnect engineering sources through the Go API Gateway.
            </p>
          </div>
          <Badge tone="blue">{integrationCatalog.length} services</Badge>
        </div>

        <AnimeStagger className="mt-5 grid gap-3 lg:grid-cols-2">
          {integrationCatalog.map((integration) => {
            const connection = connections.get(integration.id);
            const status = connection?.status ?? "available";
            const connected = status === "connected" || status === "syncing";
            const Icon = integration.icon;

            return (
              <Card key={integration.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-surface text-brand-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{integration.name}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{integration.scope}</p>
                    </div>
                  </div>
                  <Badge tone={statusTone(status)}>{status.replaceAll("_", " ")}</Badge>
                </div>

                <dl className="mt-4 grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
                  <div>
                    <dt>Token</dt>
                    <dd className="mt-1 font-medium text-foreground">{connection?.hasToken ? "Stored" : "Missing"}</dd>
                  </div>
                  <div>
                    <dt>Provider</dt>
                    <dd className="mt-1 font-medium text-foreground">{connection?.providerConfigured ? "Configured" : "Needs env"}</dd>
                  </div>
                  <div>
                    <dt>Last sync</dt>
                    <dd className="mt-1 font-medium text-foreground">{formatRelativeTime(connection?.lastSyncedAt)}</dd>
                  </div>
                </dl>

                {connection?.lastSyncError ? (
                  <p className="mt-3 rounded-md border border-[#4A2230] bg-[#22141C] p-3 text-xs leading-5 text-[#FF9CAF]">
                    {connection.lastSyncError}
                  </p>
                ) : null}

                {integration.connect?.permissionBullets.length ? (
                  <div className="mt-4 rounded-md border border-brand-border bg-[#121826] p-3">
                    <p className="text-xs font-medium text-foreground">{integration.connect.preConnectTitle}</p>
                    <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                      {integration.connect.permissionBullets.slice(0, 3).map((bullet) => (
                        <li key={bullet}>- {bullet}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant={connected ? "secondary" : "default"}>
                    <a href={`/integrations/${integration.id}/connect`}>
                      {connected ? `Reconnect ${integration.name}` : `Connect ${integration.name}`}
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
                    <Link href={`/integrations/${integration.id}`} prefetch={false}>
                      <ExternalLink className="h-4 w-4" />
                      Details
                    </Link>
                  </Button>
                  <form action={disconnectConnectionAction}>
                    <input type="hidden" name="service" value={integration.id} />
                    <Button size="sm" variant="ghost" disabled={!connection?.hasToken}>
                      <Unplug className="h-4 w-4" />
                      Disconnect
                    </Button>
                  </form>
                </div>
              </Card>
            );
          })}
        </AnimeStagger>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold">Dashboard preferences</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Default view</dt>
            <dd className="mt-1 font-medium">{config?.dashboardPreferences.defaultView ?? "today"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Workspace</dt>
            <dd className="mt-1 truncate font-medium">{config?.workspaceId ?? "Gateway unavailable"}</dd>
          </div>
        </dl>
      </Card>
      <Card className="divide-y divide-border">
        {settings.map(([label, value]) => (
          <div key={label} className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{value}</p>
            </div>
            <Badge tone="green">Ready</Badge>
          </div>
        ))}
      </Card>
      <Card className="p-5">
        <h2 className="text-base font-semibold">Visible dashboard sources</h2>
        <AnimeStagger className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {integrationCatalog.map((connector) => (
            <Card key={connector.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{connector.name}</p>
                <Badge tone="blue">{connector.syncMode.replaceAll("_", " ")}</Badge>
              </div>
              <div className="mt-3">
                <Badge tone={visibleSources.has(connector.id) ? "green" : "neutral"}>
                  {visibleSources.has(connector.id) ? "Visible" : "Hidden"}
                </Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {connector.objects.slice(0, 4).map((object) => object.replace("_", " ")).join(", ")}
              </p>
            </Card>
          ))}
        </AnimeStagger>
      </Card>
    </SpringReveal>
  );
}
