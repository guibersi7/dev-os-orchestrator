import { describe, expect, it } from "vitest";
import type { WorkEvent } from "@/lib/work-event";
import { REASON_MAX_LENGTH, buildReason, fitReason } from "@/lib/queue/reason";

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
    occurredAt: new Date(NOW - 2 * 24 * 3_600_000).toISOString(),
    metadata: {},
    ...overrides,
  };
}

describe("buildReason", () => {
  it("names who asked and how long it has been silent", () => {
    expect(buildReason(event(), NOW)).toBe("ana pediu review há 2d e ninguém respondeu desde então.");
  });

  it("names the failing check and the pull request it holds", () => {
    const reason = buildReason(
      event({ type: "check.failed", metadata: { checkName: "integration", pullNumber: 42 } }),
      NOW,
    );
    expect(reason).toBe("integration falhou no PR #42 há 2d. O merge não avança até passar.");
  });

  it("degrades gracefully when the check name is missing", () => {
    const reason = buildReason(event({ type: "check.failed" }), NOW);
    expect(reason).toBe("Um check falhou há 2d. O merge não avança até passar.");
  });

  it("falls back to the connector summary for services without a builder", () => {
    const reason = buildReason(
      event({ service: "slack", type: "message.posted", summary: "Rafa fez uma pergunta direta." }),
      NOW,
    );
    expect(reason).toBe("Rafa fez uma pergunta direta. Parado há 2d.");
  });

  it("returns empty when there is nothing factual to say", () => {
    expect(buildReason(event({ service: "trello", type: "card.moved", summary: "" }), NOW)).toBe("");
  });

  it("never exceeds the line budget", () => {
    const reason = buildReason(
      event({
        type: "check.failed",
        metadata: { checkName: "a".repeat(200), pullNumber: 42 },
      }),
      NOW,
    );
    expect(reason.length).toBeLessThanOrEqual(REASON_MAX_LENGTH);
  });
});

describe("fitReason", () => {
  it("picks the first candidate that fits", () => {
    expect(fitReason(["a".repeat(200), "curto"])).toBe("curto");
  });

  it("skips empty candidates", () => {
    expect(fitReason(["", "  ", "válido"])).toBe("válido");
  });
});
