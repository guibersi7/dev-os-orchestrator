import type { DashboardPayload, Service } from "@/lib/api-client";
import type { QueueItem } from "@/lib/queue/build";
import { formatAge } from "@/lib/work-event";
import type { WorkEvent } from "@/lib/work-event";

export type SignalItem = {
  id: string;
  title: string;
  summary: string;
  age: string;
  href: string | null;
};

export type SignalGroup = {
  service: Service;
  name: string;
  count: string;
  href: string;
  items: SignalItem[];
};

export type SourceRow = {
  service: Service;
  name: string;
  meta: string;
  connected: boolean;
  href: string;
};

const SERVICE_NAMES: Record<Service, string> = {
  github: "GitHub",
  slack: "Slack",
  linear: "Linear",
  jira: "Jira",
  trello: "Trello",
  notion: "Notion",
  calendar: "Calendar",
};

export function serviceName(service: Service): string {
  return SERVICE_NAMES[service] ?? service;
}

/**
 * Recent signal is what happened without asking anything of the viewer, grouped
 * by source so the rail reads as "what moved" rather than a second queue.
 */
export function buildRecentSignal(
  events: WorkEvent[],
  queue: QueueItem[],
  now: number = Date.now(),
  perGroup = 2,
): SignalGroup[] {
  const queued = new Set(queue.map((item) => item.id));
  const groups = new Map<Service, WorkEvent[]>();

  for (const event of events) {
    if (queued.has(event.id)) continue;
    const bucket = groups.get(event.service) ?? [];
    bucket.push(event);
    groups.set(event.service, bucket);
  }

  return [...groups.entries()]
    .map(([service, bucket]) => {
      const sorted = [...bucket].sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      );

      return {
        service,
        name: serviceName(service),
        count: `${bucket.length} ${bucket.length === 1 ? "evento" : "eventos"}`,
        href: `/integrations/${service}`,
        items: sorted.slice(0, perGroup).map((event) => ({
          id: event.id,
          title: event.title,
          summary: event.summary,
          age: formatAge(event.occurredAt, now),
          href: event.externalUrl ?? null,
        })),
      };
    })
    .sort((a, b) => b.items.length - a.items.length);
}

const ALL_SERVICES: Service[] = ["github", "linear", "slack", "jira", "trello", "notion", "calendar"];

export function buildSourceRows(dashboard: DashboardPayload, events: WorkEvent[]): SourceRow[] {
  const counts = events.reduce<Partial<Record<Service, number>>>((totals, event) => {
    totals[event.service] = (totals[event.service] ?? 0) + 1;
    return totals;
  }, {});

  const health = new Map(dashboard.sourceHealth.map((source) => [source.service, source]));

  return ALL_SERVICES.map((service) => {
    const connected = health.get(service)?.status === "connected";
    const count = counts[service] ?? 0;

    return {
      service,
      name: serviceName(service),
      // A connected source with no events is a fact worth stating, not a blank.
      meta: connected ? `${count.toLocaleString("pt-BR")} ${count === 1 ? "evento" : "eventos"}` : "conectar",
      connected,
      href: `/integrations/${service}`,
    };
  }).sort((a, b) => Number(b.connected) - Number(a.connected));
}

export function connectedCount(dashboard: DashboardPayload): number {
  return dashboard.sourceHealth.filter((source) => source.status === "connected").length;
}

/** Green when fresh, amber past an hour, red when the gateway is down. */
export function syncTone(lastSyncedAt: string | undefined, offline: boolean): "green" | "amber" | "red" {
  if (offline) return "red";
  if (!lastSyncedAt) return "amber";

  const age = Date.now() - new Date(lastSyncedAt).getTime();
  return Number.isNaN(age) || age > 3_600_000 ? "amber" : "green";
}
