import type { DashboardPayload, Service, SourceHealth, WorkEvent } from "@/lib/api-client";

export type ReviewQueueItem = {
  id: string;
  service: Service;
  title: string;
  source: string;
  actor: string;
  age: string;
  status: "waiting_review" | "blocked" | "checks_failed" | "ready";
};

export type IssueQueueItem = {
  id: string;
  service: Service;
  title: string;
  source: string;
  actor: string;
  priority: string;
  status: string;
};

export type WeeklySummaryView = {
  mergedPrs: number;
  closedIssues: number;
  decisions: number;
  risks: string[];
};

const emptyMetrics = {
  connectedSources: 0,
  waitingReview: 0,
  crossToolBlockers: 0,
  decisionsFound: 0,
};

function listOrEmpty<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function numberOrZero(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function emptyDashboard(): DashboardPayload {
  return {
    workspaceId: "offline",
    generatedAt: new Date().toISOString(),
    metrics: emptyMetrics,
    today: {
      prsWaitingForReview: [],
      blockedPrs: [],
      failedChecks: [],
      assignedIssues: [],
      recentImportantChanges: [],
    },
    focus: [],
    weeklySummary: {
      completedWork: [],
      mergedPrs: [],
      closedIssues: [],
      activeWork: [],
      risks: [],
      blockers: [],
      summaryStrategy: "offline",
    },
    events: [],
    sourceHealth: [],
  };
}

export function normalizeDashboardPayload(payload?: DashboardPayload | null): DashboardPayload {
  const fallback = emptyDashboard();
  if (!payload) {
    return fallback;
  }

  return {
    ...fallback,
    ...payload,
    metrics: {
      ...fallback.metrics,
      ...(payload.metrics ?? {}),
      connectedSources: numberOrZero(payload.metrics?.connectedSources),
      waitingReview: numberOrZero(payload.metrics?.waitingReview),
      crossToolBlockers: numberOrZero(payload.metrics?.crossToolBlockers),
      decisionsFound: numberOrZero(payload.metrics?.decisionsFound),
    },
    today: {
      ...fallback.today,
      ...(payload.today ?? {}),
      prsWaitingForReview: listOrEmpty(payload.today?.prsWaitingForReview),
      blockedPrs: listOrEmpty(payload.today?.blockedPrs),
      failedChecks: listOrEmpty(payload.today?.failedChecks),
      assignedIssues: listOrEmpty(payload.today?.assignedIssues),
      recentImportantChanges: listOrEmpty(payload.today?.recentImportantChanges),
    },
    focus: listOrEmpty(payload.focus),
    weeklySummary: {
      ...fallback.weeklySummary,
      ...(payload.weeklySummary ?? {}),
      completedWork: listOrEmpty(payload.weeklySummary?.completedWork),
      mergedPrs: listOrEmpty(payload.weeklySummary?.mergedPrs),
      closedIssues: listOrEmpty(payload.weeklySummary?.closedIssues),
      activeWork: listOrEmpty(payload.weeklySummary?.activeWork),
      risks: listOrEmpty(payload.weeklySummary?.risks),
      blockers: listOrEmpty(payload.weeklySummary?.blockers),
    },
    events: listOrEmpty(payload.events),
    sourceHealth: listOrEmpty(payload.sourceHealth),
  };
}

export function formatRelativeTime(value?: string | null) {
  if (!value) {
    return "Not synced";
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return value;
  }

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

export function latestSyncLabel(payload: DashboardPayload) {
  const latestSourceSync = payload.sourceHealth
    .map((source) => source.lastSyncedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return `Synced ${formatRelativeTime(latestSourceSync ?? payload.generatedAt)}`;
}

export function sourceEventCounts(events: WorkEvent[]) {
  return events.reduce(
    (counts, event) => {
      counts[event.service] = (counts[event.service] ?? 0) + 1;
      return counts;
    },
    {} as Partial<Record<Service, number>>,
  );
}

export function sourceHealthByService(sourceHealth: SourceHealth[]) {
  return Object.fromEntries(sourceHealth.map((source) => [source.service, source])) as Partial<Record<Service, SourceHealth>>;
}

export function buildReviewQueue(events: WorkEvent[]) {
  return events
    .filter((event) => {
      const type = event.type.toLowerCase();
      return type.includes("pull_request") || type.includes("review") || type.includes("check");
    })
    .slice(0, 6)
    .map<ReviewQueueItem>((event) => ({
      id: event.id,
      service: event.service,
      title: event.title,
      source: event.source,
      actor: event.actor,
      age: formatRelativeTime(event.occurredAt),
      status: statusFromEvent(event),
    }));
}

export function buildIssueQueue(events: WorkEvent[]) {
  return events
    .filter((event) => {
      const type = event.type.toLowerCase();
      return type.includes("issue") || type.includes("ticket") || type.includes("card");
    })
    .slice(0, 6)
    .map<IssueQueueItem>((event) => ({
      id: event.id,
      service: event.service,
      title: event.title,
      source: event.source,
      actor: event.actor,
      priority: event.priority.toUpperCase(),
      status: event.type.split(".").at(-1)?.replaceAll("_", " ") ?? "open",
    }));
}

export function buildWeeklySummary(events: WorkEvent[]) {
  const lowerTypes = events.map((event) => event.type.toLowerCase());
  const risks = events
    .filter((event) => event.priority === "high" || event.type.toLowerCase().includes("blocked"))
    .slice(0, 3)
    .map((event) => event.summary || event.title);

  return {
    mergedPrs: lowerTypes.filter((type) => type.includes("pull_request.merged")).length,
    closedIssues: lowerTypes.filter((type) => type.includes("issue.closed") || type.includes("completed")).length,
    decisions: lowerTypes.filter((type) => type.includes("decision")).length,
    risks,
  } satisfies WeeklySummaryView;
}

function statusFromEvent(event: WorkEvent): ReviewQueueItem["status"] {
  const type = event.type.toLowerCase();
  const text = `${event.title} ${event.summary}`.toLowerCase();

  if (type.includes("check.failed") || text.includes("failed")) return "checks_failed";
  if (type.includes("blocked") || text.includes("blocked")) return "blocked";
  if (type.includes("review.requested") || text.includes("review")) return "waiting_review";

  return "ready";
}
