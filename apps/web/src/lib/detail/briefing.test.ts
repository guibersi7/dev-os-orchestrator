import { describe, expect, it } from "vitest";
import type { WorkEvent } from "@/lib/work-event";
import { buildBriefing, relatedEvents } from "@/lib/detail/briefing";

const NOW = new Date("2026-08-09T12:00:00Z").getTime();

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
    metadata: { repository: "acme/api", number: 42 },
    ...overrides,
  };
}

describe("relatedEvents", () => {
  it("gathers every event about the same pull request", () => {
    const subject = event();
    const check = event({
      id: "evt-check",
      type: "check.failed",
      metadata: { repository: "acme/api", pullNumber: 42, checkName: "integration" },
    });
    const other = event({ id: "evt-other", metadata: { repository: "acme/api", number: 7 } });

    const related = relatedEvents([subject, check, other], subject);
    expect(related.map((entry) => entry.id).sort()).toEqual(["evt-1", "evt-check"]);
  });

  it("does not cross repositories", () => {
    const subject = event();
    const elsewhere = event({ id: "evt-elsewhere", metadata: { repository: "acme/web", number: 42 } });
    expect(relatedEvents([subject, elsewhere], subject)).toHaveLength(1);
  });

  it("does not cross services", () => {
    const subject = event();
    const linear = event({ id: "evt-linear", service: "linear" });
    expect(relatedEvents([subject, linear], subject)).toHaveLength(1);
  });
});

describe("buildBriefing", () => {
  it("leads with the failing check when there is one", () => {
    const subject = event();
    const check = event({
      id: "evt-check",
      type: "check.failed",
      occurredAt: new Date(NOW - 3_600_000).toISOString(),
      metadata: { repository: "acme/api", pullNumber: 42, checkName: "integration", conclusion: "failure" },
    });

    const briefing = buildBriefing([subject, check], subject, { now: NOW });
    expect(briefing.verdict).toBe("integration falhou há 1h e o merge não avança até passar.");
    expect(briefing.checks).toEqual([{ name: "integration", conclusion: "failure", age: "1h" }]);
  });

  it("states that review comments exist but are not synced", () => {
    const subject = event({ metadata: { repository: "acme/api", number: 42, metrics: { reviewCommentCount: 14 } } });
    const briefing = buildBriefing([subject], subject, { now: NOW });
    expect(briefing.omissions).toContain("14 comentários de review foram contados, mas o conteúdo não é sincronizado.");
  });

  it("says nobody was assigned when an old item has no reviewers", () => {
    const briefing = buildBriefing([event()], event(), { now: NOW });
    expect(briefing.omissions).toContain("Nenhum revisor foi designado, então não há quem cobrar.");
  });

  it("lists reviewers as the people waiting", () => {
    const subject = event({
      metadata: { repository: "acme/api", number: 42, metrics: { reviewers: ["taina", "rafa"] } },
    });
    const briefing = buildBriefing([subject], subject, { now: NOW });
    expect(briefing.waitingOn.map((party) => party.name)).toEqual(["taina", "rafa"]);
  });

  it("reports no review activity plainly", () => {
    const briefing = buildBriefing([event()], event(), { now: NOW });
    expect(briefing.verdict).toBe("Aberto há 2d e ninguém revisou até agora.");
  });

  it("omits metrics the connector did not send", () => {
    const briefing = buildBriefing([event()], event(), { now: NOW });
    expect(briefing.metrics.map((metric) => metric.label)).not.toContain("Lead time");
  });
});
