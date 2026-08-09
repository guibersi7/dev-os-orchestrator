import { describe, expect, it } from "vitest";
import type { QueueItem } from "@/lib/queue/build";
import type { Lane } from "@/lib/queue/lane";
import { emptyDashboard } from "@/lib/dashboard-view-model";
import { buildDashboardNarrative } from "@/lib/dashboard/narrative";

function item(id: string, lane: Lane): QueueItem {
  return {
    id,
    service: "github",
    title: `#${id} Alguma coisa`,
    reason: "porque sim",
    age: "2h",
    source: "acme/api",
    priority: "high",
    lane,
    action: { label: "Revisar", href: "/x", primary: false },
  };
}

describe("buildDashboardNarrative", () => {
  it("removes zero-count metrics entirely", () => {
    const narrative = buildDashboardNarrative(emptyDashboard(), [item("1", "action")]);
    const ids = narrative.metrics.map((metric) => metric.id);
    expect(ids).toContain("action");
    expect(ids).not.toContain("blocked");
    expect(ids).not.toContain("waiting");
  });

  it("never emits a metric that would link into an empty lane", () => {
    const narrative = buildDashboardNarrative(emptyDashboard(), [item("1", "blocked")]);
    for (const metric of narrative.metrics) {
      if (metric.href) {
        expect(metric.value).not.toBe("0");
      }
    }
  });

  it("agrees in number and gender", () => {
    const one = buildDashboardNarrative(emptyDashboard(), [item("1", "blocked")]);
    expect(one.metrics[0].noun).toBe("bloqueador");

    const many = buildDashboardNarrative(emptyDashboard(), [item("1", "blocked"), item("2", "blocked")]);
    expect(many.metrics[0].noun).toBe("bloqueadores");
  });

  it("always keeps the sources metric, even at zero", () => {
    const narrative = buildDashboardNarrative(emptyDashboard(), []);
    const sources = narrative.metrics.find((metric) => metric.id === "sources");
    expect(sources?.value).toBe("0/7");
    expect(sources?.href).toBeUndefined();
  });

  it("ends the headline in a recommendation drawn from the queue", () => {
    const narrative = buildDashboardNarrative(emptyDashboard(), [item("42", "blocked"), item("7", "action")]);
    expect(narrative.tail).toBe("Comece por #42 Alguma coisa.");
  });

  it("states the empty case as a fact, without celebrating", () => {
    const narrative = buildDashboardNarrative(emptyDashboard(), [], { viewerResolved: true });
    expect(narrative.lead).toBe("Nada exige sua ação agora.");
    expect(narrative.tail).toBe("Nenhum evento chegou na última sync.");
  });

  it("drops the possessive when the viewer is unknown", () => {
    const narrative = buildDashboardNarrative(emptyDashboard(), [], { viewerResolved: false });
    expect(narrative.lead).toBe("Nada exige ação agora.");
  });
});
