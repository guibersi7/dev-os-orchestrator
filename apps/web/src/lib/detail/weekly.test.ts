import { describe, expect, it } from "vitest";
import type { WorkEvent } from "@/lib/work-event";
import { emptyDashboard } from "@/lib/dashboard-view-model";
import { buildWeeklyView } from "@/lib/detail/weekly";

function event(timeToFirstReviewHours?: number): WorkEvent {
  return {
    id: `evt-${timeToFirstReviewHours ?? "x"}`,
    workspaceId: "ws-1",
    service: "github",
    type: "review.requested",
    title: "#1",
    summary: "",
    actor: "ana",
    source: "acme/api",
    priority: "medium",
    occurredAt: new Date().toISOString(),
    metadata: timeToFirstReviewHours ? { metrics: { timeToFirstReviewHours } } : {},
  };
}

describe("buildWeeklyView", () => {
  it("names review latency as the cause when it is high", () => {
    const view = buildWeeklyView(emptyDashboard(), [event(30), event(32)]);
    expect(view.synthesis).toBe(
      "O gargalo não foi capacidade — foi latência de review: em média 31h até alguém olhar cada PR.",
    );
  });

  it("highlights exactly one statistic", () => {
    const view = buildWeeklyView(emptyDashboard(), [event(30), event(32)]);
    expect(view.stats.filter((stat) => stat.highlighted)).toHaveLength(1);
  });

  it("highlights nothing when latency is healthy", () => {
    const view = buildWeeklyView(emptyDashboard(), [event(2)]);
    expect(view.stats.some((stat) => stat.highlighted)).toBe(false);
  });

  it("omits a statistic the events cannot support", () => {
    const view = buildWeeklyView(emptyDashboard(), [event()]);
    expect(view.stats.map((stat) => stat.label)).not.toContain("Latência de review");
  });

  it("says there is nothing to summarize on an empty week", () => {
    const view = buildWeeklyView(emptyDashboard(), []);
    expect(view.synthesis).toBe("Nenhum evento chegou nesta semana, então não há o que resumir.");
  });
});
