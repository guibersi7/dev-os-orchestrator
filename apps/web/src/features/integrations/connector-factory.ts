import type { IntegrationKind } from "@/lib/product-data";
import type { ExternalRecord, IntegrationConnector, SyncResult } from "./types";

function createSync(connector: Omit<IntegrationConnector, "sync">) {
  return async function sync(): Promise<SyncResult> {
    const records = await connector.fetchRecentRecords();
    const events = connector.normalize(records);

    return {
      service: connector.id,
      status: "connected",
      recordsScanned: records.length,
      eventsCreated: events.length,
      nextCursor: `${connector.id}_cursor_${records.length}`,
      events,
    };
  };
}

export function createConnector(config: Omit<IntegrationConnector, "sync">): IntegrationConnector {
  return {
    ...config,
    sync: createSync(config),
  };
}

export function mockRecord(
  id: string,
  title: string,
  actor: string,
  payload: ExternalRecord["payload"],
): ExternalRecord {
  return {
    id,
    externalUrl: `https://example.com/${id}`,
    title,
    actor,
    updatedAt: new Date("2026-07-29T14:00:00.000Z").toISOString(),
    payload,
  };
}

export function invalidServiceResponse(service: string) {
  return Response.json(
    {
      error: "Unsupported integration service",
      service,
      supportedServices: ["github", "slack", "linear", "jira", "trello", "notion", "calendar"] satisfies IntegrationKind[],
    },
    { status: 404 },
  );
}
