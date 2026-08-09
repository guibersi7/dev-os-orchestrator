import { describe, expect, it } from "vitest";
import type { SourceDef } from "@/features/wave-one/design-data";
import {
  defaultSelection,
  searchResources,
  selectActiveOnly,
  summarize,
  toggleResource,
} from "@/features/setup/resource-selection";

const github: SourceDef = {
  id: "github",
  tag: "gh",
  name: "GitHub",
  unlocks: "Pull requests",
  resLabel: "Repositories",
  owner: "guibersi7",
  count: 2,
  items: [
    { id: "api", name: "acme/api", meta: "Go · 3 open PRs", signal: "high activity", hot: true, est: 300 },
    { id: "docs", name: "acme/docs", meta: "MDX · quiet", signal: "low activity", hot: false, est: 20 },
  ],
};

const linear: SourceDef = {
  ...github,
  id: "linear",
  name: "Linear",
  resLabel: "Teams and projects",
  // Same resource id as GitHub's, on purpose: selection must be keyed per source.
  items: [{ id: "api", name: "DEV · Platform", meta: "Sprint 1", signal: "active cycle", hot: true, est: 100 }],
};

describe("defaultSelection", () => {
  it("starts from what the connector marked active", () => {
    expect(defaultSelection([github])).toEqual({ github: ["api"] });
  });
});

describe("toggleResource", () => {
  it("adds and removes without touching other sources", () => {
    const added = toggleResource({ github: ["api"], linear: ["api"] }, "github", "docs");
    expect(added.github).toEqual(["api", "docs"]);
    expect(added.linear).toEqual(["api"]);

    const removed = toggleResource(added, "github", "api");
    expect(removed.github).toEqual(["docs"]);
  });

  it("does not collide across sources sharing a resource id", () => {
    const next = toggleResource({ github: ["api"], linear: [] }, "linear", "api");
    expect(next.github).toEqual(["api"]);
    expect(next.linear).toEqual(["api"]);
  });
});

describe("selectActiveOnly", () => {
  it("replaces the selection with the active resources", () => {
    expect(selectActiveOnly({ github: ["docs"] }, github).github).toEqual(["api"]);
  });
});

describe("searchResources", () => {
  it("matches name and meta", () => {
    expect(searchResources(github.items, "mdx").map((item) => item.id)).toEqual(["docs"]);
    expect(searchResources(github.items, "acme").map((item) => item.id)).toEqual(["api", "docs"]);
  });

  it("returns everything for a blank query", () => {
    expect(searchResources(github.items, "   ")).toHaveLength(2);
  });
});

describe("summarize", () => {
  it("sums resources and estimated events across sources", () => {
    const summary = summarize([github, linear], { github: ["api", "docs"], linear: ["api"] });
    expect(summary.totalSelected).toBe(3);
    expect(summary.estimatedEvents).toBe(420);
    expect(summary.perSource).toEqual([
      { id: "github", name: "GitHub", selected: 2, total: 2 },
      { id: "linear", name: "Linear", selected: 1, total: 1 },
    ]);
  });

  it("reports zero for a source with nothing selected", () => {
    const summary = summarize([github], {});
    expect(summary.totalSelected).toBe(0);
    expect(summary.estimatedEvents).toBe(0);
  });
});
