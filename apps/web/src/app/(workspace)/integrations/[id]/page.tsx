import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { IntegrationEmptyState } from "@/components/workspace/integration-empty-state";
import { getIntegrationCatalogItem } from "@/features/integrations/catalog";
import { getConnectionsState, syncIntegration } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/dashboard-view-model";

export default async function IntegrationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const source = getIntegrationCatalogItem(id);

  if (!source) {
    notFound();
  }

  const Icon = source.icon;
  const connectionsState = await getConnectionsState();
  const connection = connectionsState.data?.connections.find((item) => item.service === source.id);
  const connected = connection?.status === "connected" && connection.hasToken;
  const syncState = connected ? await syncIntegration(source.id) : { data: null, error: null };
  const connector = syncState.data?.connector;
  const sync = syncState.data?.result;
  const status = sync?.status ?? (syncState.error ? "sync_failed" : connection?.status ?? "not_connected");
  const objects = connector?.objects ?? source.objects;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-md bg-[#1A2130] text-[#E9EDF7]">
            <Icon className="h-6 w-6" />
          </span>
          <div>
            <Badge tone={status === "connected" ? "green" : syncState.error ? "red" : "neutral"}>
              {status.replaceAll("_", " ")}
            </Badge>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">{connector?.name ?? source.name}</h1>
            <p className="mt-2 text-sm text-[#6A7489]">{source.scope}</p>
          </div>
        </div>
        <Badge tone="blue">{(connector?.syncMode ?? source.syncMode).replaceAll("_", " ")}</Badge>
      </div>

      {connectionsState.error || syncState.error ? (
        <Card className="border-[#4A2230] bg-[#22141C] p-4 text-sm text-[#FF9CAF]">
          {connectionsState.error ?? syncState.error}
        </Card>
      ) : null}

      {!connectionsState.error && !connected ? (
        <IntegrationEmptyState
          title={`Connect ${source.name} to see workspace data`}
          description="This integration has not been connected for the current workspace yet. Connect it to authorize access, choose the right scope, and start syncing real work events."
          service={source.id}
          icon={Icon}
          actionLabel={`Connect ${source.name}`}
        />
      ) : null}

      {connected ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card className="p-5">
            <h2 className="text-base font-semibold">Normalized events</h2>
            <div className="mt-4 space-y-3">
              {!sync || sync.events.length === 0 ? (
                <p className="rounded-md border border-dashed border-[#212938] p-4 text-sm text-[#6A7489]">
                  No events were returned for this connector sync.
                </p>
              ) : null}
              {sync?.events.map((event) => (
                <div key={event.id} className="rounded-md border border-[#212938] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium">{event.title}</p>
                    <Badge tone={event.priority === "high" ? "red" : "amber"}>{event.priority}</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#9AA4BA]">{event.summary}</p>
                  <p className="mt-2 text-xs text-[#6A7489]">
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
                <dt className="text-[#6A7489]">Auth</dt>
                <dd className="mt-1 font-medium">{connector?.authStrategy ?? source.authStrategy}</dd>
              </div>
              <div>
                <dt className="text-[#6A7489]">Records scanned</dt>
                <dd className="mt-1 font-medium">{sync?.recordsScanned ?? 0}</dd>
              </div>
              <div>
                <dt className="text-[#6A7489]">Events created</dt>
                <dd className="mt-1 font-medium">{sync?.eventsCreated ?? 0}</dd>
              </div>
              <div>
                <dt className="text-[#6A7489]">Objects</dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {objects.map((object) => (
                    <Badge key={object}>{object.replace("_", " ")}</Badge>
                  ))}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
