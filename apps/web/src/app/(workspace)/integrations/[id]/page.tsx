import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getIntegrationCatalogItem } from "@/features/integrations/catalog";
import { syncIntegration } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/dashboard-view-model";

export default async function IntegrationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const source = getIntegrationCatalogItem(id);

  if (!source) {
    notFound();
  }

  const Icon = source.icon;
  const syncState = await syncIntegration(source.id);
  const connector = syncState.data?.connector;
  const sync = syncState.data?.result;
  const status = sync?.status ?? (syncState.error ? "sync_failed" : "ready");
  const objects = connector?.objects ?? source.objects;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-md bg-zinc-950 text-white">
            <Icon className="h-6 w-6" />
          </span>
          <div>
            <Badge tone={status === "connected" ? "green" : syncState.error ? "red" : "neutral"}>
              {status.replaceAll("_", " ")}
            </Badge>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">{connector?.name ?? source.name}</h1>
            <p className="mt-2 text-sm text-zinc-500">{source.scope}</p>
          </div>
        </div>
        <Badge tone="blue">{(connector?.syncMode ?? source.syncMode).replaceAll("_", " ")}</Badge>
      </div>

      {syncState.error ? (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{syncState.error}</Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="p-5">
          <h2 className="text-base font-semibold">Normalized events</h2>
          <div className="mt-4 space-y-3">
            {!sync || sync.events.length === 0 ? (
              <p className="rounded-md border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">
                No events were returned for this connector sync.
              </p>
            ) : null}
            {sync?.events.map((event) => (
              <div key={event.id} className="rounded-md border border-zinc-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium">{event.title}</p>
                  <Badge tone={event.priority === "high" ? "red" : "amber"}>{event.priority}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{event.summary}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  {event.source} · {event.actor} · {formatRelativeTime(event.occurredAt)}
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
              <dd className="mt-1 font-medium">{connector?.authStrategy ?? source.authStrategy}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Records scanned</dt>
              <dd className="mt-1 font-medium">{sync?.recordsScanned ?? 0}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Events created</dt>
              <dd className="mt-1 font-medium">{sync?.eventsCreated ?? 0}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Objects</dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {objects.map((object) => (
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
