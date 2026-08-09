import type { Service } from "@/lib/api-client";
import { sources } from "@/features/wave-one/design-data";

/**
 * Authorization is a queue, not a single grant. The queue lives entirely in the
 * URL (`?queue=github,linear,slack&i=1`) so a refresh — or a provider bouncing
 * the user back mid-flow — resumes exactly where it left off. Nothing about the
 * flow is stored client-side.
 */
export type OAuthQueue = {
  services: Service[];
  index: number;
  current?: Service;
  next?: Service;
  /** 1-based position, for "2 of 4"-style copy. */
  position: number;
  isLast: boolean;
};

const KNOWN = new Set<string>(sources.map((source) => source.id));

function toParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function parseOAuthQueue(searchParams: Record<string, string | string[] | undefined>): OAuthQueue {
  const raw = toParam(searchParams.queue);
  const seen = new Set<string>();
  const services = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => {
      // An unknown or repeated service in the URL is user-editable garbage, not
      // a crash: drop it and keep the rest of the queue walking.
      if (!KNOWN.has(entry) || seen.has(entry)) return false;
      seen.add(entry);
      return true;
    }) as Service[];

  const parsedIndex = Number.parseInt(toParam(searchParams.i), 10);
  const index = Number.isFinite(parsedIndex) ? Math.min(Math.max(parsedIndex, 0), Math.max(services.length - 1, 0)) : 0;

  return {
    services,
    index,
    current: services[index],
    next: services[index + 1],
    position: services.length === 0 ? 0 : index + 1,
    isLast: index >= services.length - 1,
  };
}

export function buildQueueHref(services: Service[], index: number, pathname = "/setup/oauth"): string {
  if (services.length === 0) {
    return "/setup/connect";
  }

  const params = new URLSearchParams({ queue: services.join(","), i: String(Math.max(0, index)) });
  return `${pathname}?${params.toString()}`;
}

/**
 * Where the user goes after finishing — or skipping — the current source.
 * One failure never kills the queue.
 */
export function advanceHref(queue: OAuthQueue): string {
  if (queue.isLast || queue.services.length === 0) {
    return "/setup/resources";
  }

  return buildQueueHref(queue.services, queue.index + 1);
}

export function retryHref(queue: OAuthQueue): string {
  return buildQueueHref(queue.services, queue.index);
}
