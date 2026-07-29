import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getIntegrationConnector } from "@/features/integrations/registry";
import { integrationIcon, integrations } from "@/lib/product-data";

export default async function IntegrationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const connector = getIntegrationConnector(id);
  const source = integrations.find((integration) => integration.id === id);

  if (!connector || !source) {
    notFound();
  }

  const Icon = integrationIcon[source.id];
  const sync = await connector.sync();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-md bg-zinc-950 text-white">
            <Icon className="h-6 w-6" />
          </span>
          <div>
            <Badge tone={source.connected ? "green" : "neutral"}>{source.connected ? "Connected" : "Available"}</Badge>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">{connector.name}</h1>
            <p className="mt-2 text-sm text-zinc-500">{source.scope}</p>
          </div>
        </div>
        <Badge tone="blue">{connector.syncMode.replace("_", " ")}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="p-5">
          <h2 className="text-base font-semibold">Normalized events</h2>
          <div className="mt-4 space-y-3">
            {sync.events.map((event) => (
              <div key={event.id} className="rounded-md border border-zinc-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium">{event.title}</p>
                  <Badge tone={event.priority === "high" ? "red" : "amber"}>{event.priority}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{event.summary}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  {event.source} · {event.actor} · {event.occurredAt}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold">Connector contract</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-zinc-500">Auth</dt>
              <dd className="mt-1 font-medium">{connector.authStrategy}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Records scanned</dt>
              <dd className="mt-1 font-medium">{sync.recordsScanned}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Events created</dt>
              <dd className="mt-1 font-medium">{sync.eventsCreated}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Objects</dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {connector.objects.map((object) => (
                  <Badge key={object}>{object.replace("_", " ")}</Badge>
                ))}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
