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

describe("buildReason for Linear", () => {
  function linear(overrides: Partial<WorkEvent> = {}): WorkEvent {
    return event({
      service: "linear",
      type: "linear.issue.blocked",
      title: "DEV-18 Rate limit strategy",
      summary: "A Linear issue appears blocked or waiting on a dependency.",
      source: "Linear · DEV",
      metadata: { identifier: "DEV-18", cycle: "Sprint 1", state: "Blocked" },
      ...overrides,
    });
  }

  it("names the cycle a blocked issue is holding up", () => {
    expect(buildReason(linear(), NOW)).toBe("Parada há 2d e o ciclo Sprint 1 segue correndo.");
  });

  it("counts linked references when the connector found them", () => {
    const reason = buildReason(
      linear({ metadata: { identifier: "DEV-18", cycle: "Sprint 1", linkedRefs: ["#42", "#44"] } }),
      NOW,
    );
    expect(reason).toBe("Parada há 2d em Sprint 1, com 2 referências ligadas.");
  });

  it("degrades when there is no cycle", () => {
    expect(buildReason(linear({ metadata: { identifier: "DEV-18" } }), NOW)).toBe(
      "Parada há 2d esperando uma dependência.",
    );
  });

  it("uses the priority label for a prioritized issue", () => {
    const reason = buildReason(
      linear({
        type: "linear.issue.prioritized",
        metadata: { identifier: "DEV-21", priorityLabel: "Urgent", cycle: "Sprint 1" },
      }),
      NOW,
    );
    expect(reason).toBe("Urgent em Sprint 1, sem movimento há 2d.");
  });

  it("never falls back to the connector's English summary", () => {
    const reason = buildReason(linear(), NOW);
    expect(reason).not.toContain("Linear issue");
  });
});
