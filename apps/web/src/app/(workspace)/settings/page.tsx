import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { integrationConnectors } from "@/features/integrations/registry";

const settings = [
  ["Authentication", "OAuth connector framework ready for GitHub, Slack, Linear, Jira, Trello, Notion, and Calendar"],
  ["Background sync", "Initial sync, webhook ingestion, and scheduled polling enabled"],
  ["AI provider", "Provider abstraction configured"],
  ["Data model", "External entities normalized into WorkEvents before they reach product features"],
];

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-zinc-500">Workspace configuration for the multi-service MVP.</p>
      </div>
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
          {Object.values(integrationConnectors).map((connector) => (
            <div key={connector.id} className="rounded-md border border-zinc-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{connector.name}</p>
                <Badge tone="blue">{connector.syncMode.replace("_", " ")}</Badge>
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
