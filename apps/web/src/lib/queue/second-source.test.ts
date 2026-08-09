import { describe, expect, it } from "vitest";
import type { WorkEvent } from "@/lib/work-event";
import { buildQueue } from "@/lib/queue/build";
import { itemKey, relatedEvents } from "@/lib/detail/briefing";
import { buildRecentSignal } from "@/lib/dashboard/rail";

/**
 * Step 6 of the build order: adding a second source must not need a new screen.
 * These tests hold that claim — every derivation the dashboard depends on has
 * to work for Linear without a GitHub-shaped fallback.
 */
const NOW = new Date("2026-08-09T12:00:00Z").getTime();

function linear(overrides: Partial<WorkEvent> = {}): WorkEvent {
  return {
    id: "linear-1",
    workspaceId: "ws-1",
    service: "linear",
    type: "linear.issue.blocked",
    title: "DEV-18 Rate limit strategy",
    summary: "A Linear issue appears blocked.",
    actor: "ana",
    source: "Linear · DEV",
    priority: "high",
    occurredAt: new Date(NOW - 2 * 24 * 3_600_000).toISOString(),
    externalUrl: "https://linear.app/acme/issue/DEV-18",
    metadata: { identifier: "DEV-18", cycle: "Sprint 1", state: "Blocked" },
    ...overrides,
  };
}

function github(overrides: Partial<WorkEvent> = {}): WorkEvent {
  return {
    id: "gh-1",
    workspaceId: "ws-1",
    service: "github",
    type: "review.requested",
    title: "#42 Normalize payloads",
    summary: "Waiting for review.",
    actor: "taina",
    source: "GitHub · acme/api",
    priority: "high",
    occurredAt: new Date(NOW - 3_600_000).toISOString(),
    metadata: { repository: "acme/api", number: 42 },
    ...overrides,
  };
}

describe("a second source needs no new screen", () => {
  it("ranks Linear and GitHub in one queue", () => {
    const queue = buildQueue([github(), linear()], { now: NOW });
    expect(queue).toHaveLength(2);
    // A blocked issue outranks a pending review regardless of which tool it came from.
    expect(queue[0].service).toBe("linear");
    expect(queue[0].lane).toBe("blocked");
  });

  it("gives Linear rows a reason in the product's own voice", () => {
    const [item] = buildQueue([linear()], { now: NOW });
    expect(item.reason).toBe("Parada há 2d e o ciclo Sprint 1 segue correndo.");
    expect(item.action.label).toBe("Abrir");
    expect(item.action.href).toBe("https://linear.app/acme/issue/DEV-18");
  });

  it("drops completed Linear work from the queue", () => {
    const queue = buildQueue([linear({ type: "linear.issue.completed" })], { now: NOW });
    expect(queue).toEqual([]);
  });

  it("keeps ambient Linear updates out unless they are high priority", () => {
    expect(buildQueue([linear({ type: "linear.issue.updated", priority: "low" })], { now: NOW })).toEqual([]);
    expect(buildQueue([linear({ type: "linear.issue.updated", priority: "high" })], { now: NOW })).toHaveLength(1);
  });

  it("groups recent signal per source without special-casing either", () => {
    const groups = buildRecentSignal([github(), linear()], [], NOW);
    expect(groups.map((group) => group.service).sort()).toEqual(["github", "linear"]);
  });

  it("identifies a Linear item by its issue identifier", () => {
    expect(itemKey(linear())).toBe("linear:DEV-18");
    expect(itemKey(github())).toBe("github:acme/api#42");
  });

  it("gathers a Linear item's history without crossing into GitHub", () => {
    const subject = linear();
    const later = linear({ id: "linear-2", type: "linear.issue.started" });
    const related = relatedEvents([subject, later, github()], subject);
    expect(related.map((event) => event.id).sort()).toEqual(["linear-1", "linear-2"]);
  });

  it("never lumps together two events that both lack a stable key", () => {
    const looseA = linear({ id: "a", metadata: {} });
    const looseB = linear({ id: "b", metadata: {} });
    expect(relatedEvents([looseA, looseB], looseA)).toHaveLength(1);
  });
});
