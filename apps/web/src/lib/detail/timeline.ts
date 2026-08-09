import type { Service } from "@/lib/api-client";
import type { WorkEvent } from "@/lib/work-event";
import { serviceName } from "@/lib/dashboard/rail";

export type TimelineEntry = {
  event: WorkEvent;
  time: string;
};

export type TimelineDay = {
  key: string;
  label: string;
  entries: TimelineEntry[];
};

export type TimelineFilter = {
  service: Service | "all";
  label: string;
  count: number;
  href: string;
  active: boolean;
};

const DAY_FORMAT = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "short" });
const TIME_FORMAT = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

/**
 * The raw record: no ranking, no reasons. Grouped by day only so the eye has
 * somewhere to rest.
 */
export function groupByDay(events: WorkEvent[]): TimelineDay[] {
  const days = new Map<string, TimelineEntry[]>();

  for (const event of [...events].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  )) {
    const date = new Date(event.occurredAt);
    if (Number.isNaN(date.getTime())) continue;

    const key = date.toISOString().slice(0, 10);
    const entries = days.get(key) ?? [];
    entries.push({ event, time: TIME_FORMAT.format(date) });
    days.set(key, entries);
  }

  return [...days.entries()].map(([key, entries]) => ({
    key,
    label: DAY_FORMAT.format(new Date(`${key}T12:00:00Z`)),
    entries,
  }));
}

export function buildTimelineFilters(events: WorkEvent[], active: Service | "all"): TimelineFilter[] {
  const counts = events.reduce<Partial<Record<Service, number>>>((totals, event) => {
    totals[event.service] = (totals[event.service] ?? 0) + 1;
    return totals;
  }, {});

  const services = (Object.keys(counts) as Service[]).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));

  return [
    { service: "all" as const, label: "Tudo", count: events.length, href: "/timeline", active: active === "all" },
    ...services.map((service) => ({
      service,
      label: serviceName(service),
      count: counts[service] ?? 0,
      href: `/timeline?source=${service}`,
      active: active === service,
    })),
  ];
}
