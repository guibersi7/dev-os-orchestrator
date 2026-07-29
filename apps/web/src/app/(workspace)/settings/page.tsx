import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { integrationCatalog } from "@/features/integrations/catalog";
import { getConfigState } from "@/lib/api-client";

const settings = [
  ["Authentication", "OAuth connector framework for GitHub, Slack, Linear, Jira, Trello, Notion, and Calendar"],
  ["Background sync", "Initial sync, webhook ingestion, and scheduled polling routed through the Go gateway"],
  ["AI provider", "Provider abstraction configured"],
  ["Data model", "External entities normalized into WorkEvents before they reach product features"],
];

export default async function SettingsPage() {
  const configState = await getConfigState();
  const config = configState.data?.config;
  const visibleSources = new Set(config?.dashboardPreferences.visibleSources ?? []);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-zinc-500">Workspace configuration for the multi-service MVP.</p>
      </div>
      {configState.error ? (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{configState.error}</Card>
      ) : null}
      <Card className="p-5">
        <h2 className="text-base font-semibold">Dashboard preferences</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Default view</dt>
            <dd className="mt-1 font-medium">{config?.dashboardPreferences.defaultView ?? "today"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Workspace</dt>
            <dd className="mt-1 truncate font-medium">{config?.workspaceId ?? "Gateway unavailable"}</dd>
          </div>
        </dl>
      </Card>
      <Card className="divide-y divide-zinc-100">
        {settings.map(([label, value]) => (
          <div key={label} className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="mt-1 text-sm text-zinc-500">{value}</p>
            </div>
            <Badge tone="green">Ready</Badge>
          </div>
        ))}
      </Card>
      <Card className="p-5">
        <h2 className="text-base font-semibold">Connector features</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {integrationCatalog.map((connector) => (
            <div key={connector.id} className="rounded-md border border-zinc-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{connector.name}</p>
                <Badge tone="blue">{connector.syncMode.replaceAll("_", " ")}</Badge>
              </div>
              <div className="mt-3">
                <Badge tone={visibleSources.has(connector.id) ? "green" : "neutral"}>
                  {visibleSources.has(connector.id) ? "Visible" : "Hidden"}
                </Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                {connector.objects.slice(0, 4).map((object) => object.replace("_", " ")).join(", ")}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
