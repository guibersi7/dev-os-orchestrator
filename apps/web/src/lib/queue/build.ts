import { ageInHours, formatAge } from "@/lib/work-event";
import type { WorkEvent, WorkEventPriority } from "@/lib/work-event";
import { belongsInQueue, laneFor, nobodyIsViewer } from "@/lib/queue/lane";
import type { Lane, ViewerPredicate } from "@/lib/queue/lane";
import { buildReason } from "@/lib/queue/reason";

export type QueueItem = {
  id: string;
  service: WorkEvent["service"];
  title: string;
  reason: string;
  age: string;
  source: string;
  priority: WorkEventPriority;
  lane: Lane;
  action: { label: string; href: string; primary: boolean };
};

const SEVERITY: Record<string, number> = {
  "check.failed": 100,
  "linear.issue.blocked": 90,
  "review.requested": 60,
  "pull_request.opened": 45,
  "issue.assigned": 40,
  "linear.issue.prioritized": 40,
  "linear.issue.started": 25,
};

const PRIORITY_WEIGHT: Record<WorkEventPriority, number> = { high: 20, medium: 10, low: 0 };

const LANE_WEIGHT: Record<Lane, number> = { blocked: 30, action: 15, waiting: 0 };

/** Action labels are the verb the user performs, never the vendor's noun. */
function actionLabel(event: WorkEvent, lane: Lane): string {
  if (event.type === "check.failed") return "Ver run";
  if (lane === "waiting") return "Cutucar";
  if (event.type === "review.requested" || event.type === "pull_request.opened") return "Revisar";
  if (event.service === "slack") return "Responder";
  if (event.service === "notion") return "Ler";
  return "Abrir";
}

export function scoreEvent(event: WorkEvent, lane: Lane, now: number = Date.now()): number {
  const severity = SEVERITY[event.type] ?? 20;
  // Age matters, but a week-old item must never outrank a broken build, so its
  // contribution is logarithmic and capped.
  const age = Math.min(15, Math.log1p(ageInHours(event.occurredAt, now)) * 4);

  return severity + LANE_WEIGHT[lane] + PRIORITY_WEIGHT[event.priority] + age;
}

export type BuildQueueOptions = {
  isViewer?: ViewerPredicate;
  now?: number;
  limit?: number;
};

export function buildQueue(events: WorkEvent[], options: BuildQueueOptions = {}): QueueItem[] {
  const { isViewer = nobodyIsViewer, now = Date.now(), limit = 12 } = options;
  const seen = new Set<string>();

  return events
    .filter(belongsInQueue)
    .map((event) => {
      const lane = laneFor(event, isViewer);
      return { event, lane, score: scoreEvent(event, lane, now) };
    })
    // A row that cannot say why it is on screen does not stay on screen.
    .filter(({ event, lane }) => Boolean(buildReason(event, now)) && Boolean(lane))
    .sort((a, b) => b.score - a.score)
    .filter(({ event }) => {
      const key = event.externalUrl ?? event.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(({ event, lane }, index) => ({
      id: event.id,
      service: event.service,
      title: event.title,
      reason: buildReason(event, now),
      age: formatAge(event.occurredAt, now),
      source: event.source,
      priority: event.priority,
      lane,
      action: {
        label: actionLabel(event, lane),
        href: event.externalUrl ?? `/integrations/${event.service}`,
        // One solid button per urgency cluster: a wall of green kills the
        // hierarchy, so only the leading high-priority rows get emphasis.
        primary: index < 2 && event.priority === "high",
      },
    }));
}

/** Events that did not make the queue, for the "N more today" footer. */
export function countTrailingEvents(events: WorkEvent[], queue: QueueItem[]): number {
  const queued = new Set(queue.map((item) => item.id));
  return events.filter((event) => !queued.has(event.id)).length;
}
