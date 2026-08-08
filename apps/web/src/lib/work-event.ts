import type { Service, WorkEvent as GatewayWorkEvent } from "@/lib/api-client";

/**
 * The normalized event every feature reads. No feature touches a provider
 * payload, and no feature touches the gateway shape either.
 *
 * The gateway (Go) speaks a slightly different dialect than the design handoff:
 * it sends `externalId` and a loose `raw` bag, has no `workspaceId` on the event,
 * and keeps the item URL inside `raw`. This module is the only place that knows
 * that, so the divergence stops here.
 */
export type WorkEventPriority = "low" | "medium" | "high";

export type WorkEvent = {
  id: string;
  workspaceId: string;
  service: Service;
  type: string;
  title: string;
  summary: string;
  actor: string;
  source: string;
  priority: WorkEventPriority;
  occurredAt: string;
  externalUrl?: string;
  metadata: Record<string, unknown>;
};

const URL_KEYS = ["url", "html_url", "htmlUrl", "permalink", "webUrl", "externalUrl"] as const;

function toPriority(value: unknown): WorkEventPriority {
  return value === "low" || value === "high" ? value : "medium";
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Pulls the item's own URL out of the provider bag. Null when nothing usable is there. */
export function resolveExternalUrl(metadata: Record<string, unknown>): string | undefined {
  for (const key of URL_KEYS) {
    const candidate = metadata[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return undefined;
}

export function normalizeWorkEvent(event: GatewayWorkEvent, workspaceId: string): WorkEvent {
  const metadata = toRecord(event.raw);

  return {
    id: event.id,
    workspaceId,
    service: event.service,
    type: event.type ?? "",
    title: event.title ?? "",
    summary: event.summary ?? "",
    actor: event.actor ?? "",
    source: event.source ?? "",
    priority: toPriority(event.priority),
    occurredAt: event.occurredAt,
    externalUrl: resolveExternalUrl(metadata),
    metadata,
  };
}

export function normalizeWorkEvents(events: GatewayWorkEvent[], workspaceId: string): WorkEvent[] {
  return events.map((event) => normalizeWorkEvent(event, workspaceId));
}

/** Compact age for the mono metadata slot: "20m", "4h", "2d". */
export function formatAge(occurredAt: string, now: number = Date.now()): string {
  const timestamp = new Date(occurredAt).getTime();
  if (Number.isNaN(timestamp)) {
    return "—";
  }

  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;

  return `${Math.floor(days / 7)}sem`;
}

export function ageInHours(occurredAt: string, now: number = Date.now()): number {
  const timestamp = new Date(occurredAt).getTime();
  if (Number.isNaN(timestamp)) {
    return 0;
  }

  return Math.max(0, (now - timestamp) / 3_600_000);
}

export function metadataString(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function metadataNumber(metadata: Record<string, unknown>, key: string): number | undefined {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function metadataMetrics(metadata: Record<string, unknown>): Record<string, unknown> {
  return toRecord(metadata.metrics);
}
