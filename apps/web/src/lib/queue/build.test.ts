import { describe, expect, it } from "vitest";
import type { WorkEvent } from "@/lib/work-event";
import { buildQueue, scoreEvent } from "@/lib/queue/build";
import { laneFor } from "@/lib/queue/lane";

const NOW = new Date("2026-08-08T12:00:00Z").getTime();

function event(overrides: Partial<WorkEvent> = {}): WorkEvent {
  return {
    id: "evt-1",
    workspaceId: "ws-1",
    service: "github",
    type: "review.requested",
    title: "#42 Normalize Linear payloads",
    summary: "A pull request is waiting for review.",
    actor: "ana",
    source: "GitHub · acme/api",
    priority: "high",
    occurredAt: new Date(NOW - 2 * 3_600_000).toISOString(),
    metadata: {},
    ...overrides,
  };
}

describe("buildQueue", () => {
  it("returns an empty queue for no events", () => {
    expect(buildQueue([], { now: NOW })).toEqual([]);
  });

  it("drops terminal work", () => {
    const queue = buildQueue([event({ type: "pull_request.merged" }), event({ id: "evt-2" })], { now: NOW });
    expect(queue.map((item) => item.id)).toEqual(["evt-2"]);
  });

  it("ranks a failed check above a pending review", () => {
    const queue = buildQueue(
      [
        event({ id: "review", type: "review.requested" }),
        event({ id: "check", type: "check.failed", metadata: { checkName: "integration", pullNumber: 42 } }),
      ],
      { now: NOW },
    );

    expect(queue.map((item) => item.id)).toEqual(["check", "review"]);
  });

  it("interleaves lanes instead of grouping them", () => {
    const queue = buildQueue(
      [
        event({ id: "old-waiting", type: "pull_request.opened", priority: "low" }),
        event({ id: "check", type: "check.failed", metadata: { checkName: "unit", pullNumber: 7 } }),
        event({ id: "issue", type: "issue.assigned", priority: "medium" }),
      ],
      { now: NOW, isViewer: (candidate) => candidate.id === "old-waiting" },
    );

    expect(queue[0].lane).toBe("blocked");
    expect(queue.some((item) => item.lane === "waiting")).toBe(true);
  });

  it("dedupes events that point at the same external item", () => {
    const url = "https://github.com/acme/api/pull/42";
    const queue = buildQueue([event({ id: "a", externalUrl: url }), event({ id: "b", externalUrl: url })], {
      now: NOW,
    });

    expect(queue).toHaveLength(1);
  });

  it("links to the external item when the connector sent one", () => {
    const [item] = buildQueue([event({ externalUrl: "https://github.com/acme/api/pull/42" })], { now: NOW });
    expect(item.action.href).toBe("https://github.com/acme/api/pull/42");
  });

  it("falls back to the integration page when no URL is available", () => {
    const [item] = buildQueue([event({ service: "slack", type: "message.posted" })], { now: NOW });
    expect(item.action.href).toBe("/integrations/slack");
  });

  it("keeps solid buttons rare", () => {
    const events = Array.from({ length: 6 }, (_, index) => event({ id: `evt-${index}`, priority: "high" }));
    const primaries = buildQueue(events, { now: NOW }).filter((item) => item.action.primary);
    expect(primaries.length).toBeLessThanOrEqual(2);
  });
});

describe("scoreEvent", () => {
  it("prefers the older of two otherwise identical items", () => {
    const fresh = event({ occurredAt: new Date(NOW - 10 * 60_000).toISOString() });
    const stale = event({ occurredAt: new Date(NOW - 48 * 3_600_000).toISOString() });

    expect(scoreEvent(stale, "action", NOW)).toBeGreaterThan(scoreEvent(fresh, "action", NOW));
  });

  it("never lets age outrank a broken build", () => {
    const ancientReview = event({ occurredAt: new Date(NOW - 90 * 24 * 3_600_000).toISOString() });
    const freshCheck = event({ type: "check.failed", occurredAt: new Date(NOW - 60_000).toISOString() });

    expect(scoreEvent(freshCheck, "blocked", NOW)).toBeGreaterThan(scoreEvent(ancientReview, "action", NOW));
  });
});

describe("laneFor", () => {
  it("puts a failed check in blocked", () => {
    expect(laneFor(event({ type: "check.failed" }))).toBe("blocked");
  });

  it("moves the viewer's own pull request to waiting", () => {
    expect(laneFor(event({ type: "pull_request.opened" }), () => true)).toBe("waiting");
    expect(laneFor(event({ type: "pull_request.opened" }), () => false)).toBe("action");
  });
});
