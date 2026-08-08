import type { Service } from "@/lib/api-client";

/**
 * Progress model for the first sync. Sources run in parallel and each one owns
 * its state, so one failure degrades the screen instead of ending it.
 */
export type SyncState = "queued" | "reading" | "done" | "failed";

export type SourceSyncStatus = {
  service: Service;
  name: string;
  state: SyncState;
  eventsCreated: number;
  error?: string;
};

const STAGES = [
  "Reading history from each source",
  "Resolving people, repositories and references",
  "Normalizing everything into work events",
  "Ranking your first morning",
] as const;

/** Overall completion, counting a failed source as settled — it will not progress further. */
export function overallPercent(statuses: SourceSyncStatus[]): number {
  if (statuses.length === 0) {
    return 0;
  }

  const settled = statuses.filter((status) => status.state === "done" || status.state === "failed").length;
  const reading = statuses.filter((status) => status.state === "reading").length;

  // A source mid-flight counts as half so the bar moves while work is happening,
  // rather than jumping between zero and done.
  return Math.round(((settled + reading * 0.5) / statuses.length) * 100);
}

export function stageLine(percent: number): string {
  if (percent >= 100) return STAGES[3];
  if (percent >= 72) return STAGES[2];
  if (percent >= 40) return STAGES[1];
  return STAGES[0];
}

export function totalEvents(statuses: SourceSyncStatus[]): number {
  return statuses.reduce((total, status) => total + status.eventsCreated, 0);
}

export function isSettled(statuses: SourceSyncStatus[]): boolean {
  return statuses.length > 0 && statuses.every((status) => status.state === "done" || status.state === "failed");
}

export function readyCount(statuses: SourceSyncStatus[]): number {
  return statuses.filter((status) => status.state === "done").length;
}

/**
 * The headline once everything has settled. Partial failure is stated plainly
 * and still offers a way forward — never a dead end.
 */
export function completionHeadline(statuses: SourceSyncStatus[]): string {
  const ready = readyCount(statuses);
  if (ready === statuses.length) {
    return "Sync complete";
  }

  if (ready === 0) {
    return "No source finished syncing";
  }

  return `${ready} of ${statuses.length} sources ready`;
}

export function completionSummary(statuses: SourceSyncStatus[]): string {
  const events = totalEvents(statuses);
  const ready = readyCount(statuses);
  const sourceWord = ready === 1 ? "source" : "sources";
  const eventWord = events === 1 ? "work event" : "work events";

  return `${events.toLocaleString("en-US")} ${eventWord} normalized across ${ready} ${sourceWord}.`;
}
