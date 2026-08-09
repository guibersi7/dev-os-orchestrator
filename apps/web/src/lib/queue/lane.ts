import type { WorkEvent } from "@/lib/work-event";

export type Lane = "action" | "waiting" | "blocked";

/**
 * Whether the viewer is the person behind an event. Step 4 supplies a real
 * implementation backed by connection identities; until then every event is
 * somebody else's, which puts the queue in workspace mode.
 */
export type ViewerPredicate = (event: WorkEvent) => boolean;

export const nobodyIsViewer: ViewerPredicate = () => false;

/** Event types that describe finished work. They are signal, never queue rows. */
const TERMINAL_TYPES = new Set([
  "pull_request.merged",
  "pull_request.closed",
  "issue.closed",
  "issue.completed",
  "linear.issue.completed",
  "linear.issue.canceled",
]);

/** Event types that carry no obligation on their own. */
const AMBIENT_TYPES = new Set(["issue.updated", "pull_request.reviewed", "linear.issue.updated"]);

export function isTerminal(event: WorkEvent): boolean {
  return TERMINAL_TYPES.has(event.type);
}

export function belongsInQueue(event: WorkEvent): boolean {
  if (isTerminal(event)) {
    return false;
  }

  return !AMBIENT_TYPES.has(event.type) || event.priority === "high";
}

function looksBlocked(event: WorkEvent): boolean {
  if (event.type.includes("blocked") || event.type === "check.failed") {
    return true;
  }

  // The gateway has no `blocked` flag for non-GitHub sources yet, so the
  // connector's own summary is the only signal available.
  return `${event.type} ${event.title}`.toLowerCase().includes("blocked");
}

export function laneFor(event: WorkEvent, isViewer: ViewerPredicate = nobodyIsViewer): Lane {
  if (looksBlocked(event)) {
    return "blocked";
  }

  // A review the viewer asked for is the viewer waiting; the same event seen by
  // anyone else is work sitting in the queue.
  if (event.type === "review.requested" || event.type === "pull_request.opened") {
    return isViewer(event) ? "waiting" : "action";
  }

  return "action";
}
