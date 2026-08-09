import { describe, expect, it } from "vitest";
import { DESTINATIONS, fuzzyScore, groupByKind, searchCommands } from "@/features/command/search";
import type { CommandItem } from "@/features/command/search";

const items: CommandItem[] = [
  ...DESTINATIONS,
  { id: "q1", kind: "queue", label: "#42 Normalize Linear payloads", hint: "acme/api", href: "/x" },
  { id: "s1", kind: "source", label: "GitHub", hint: "812 eventos", href: "/integrations/github" },
];

describe("searchCommands", () => {
  it("lists the destinations before anything is typed", () => {
    const results = searchCommands(items, "");
    expect(results).toHaveLength(DESTINATIONS.length);
    expect(results.every((item) => item.kind === "destination")).toBe(true);
  });

  it("searches destinations, queue items and sources in one list", () => {
    expect(searchCommands(items, "linear").map((item) => item.id)).toContain("q1");
    expect(searchCommands(items, "github").map((item) => item.id)).toContain("s1");
    expect(searchCommands(items, "semana").map((item) => item.id)).toContain("weekly");
  });

  it("matches a subsequence, not just a prefix", () => {
    expect(searchCommands(items, "nrmlz").map((item) => item.id)).toContain("q1");
  });

  it("matches against the hint too", () => {
    expect(searchCommands(items, "acme").map((item) => item.id)).toContain("q1");
  });

  it("returns nothing when the query matches nothing", () => {
    expect(searchCommands(items, "zzzzqq")).toEqual([]);
  });
});

describe("fuzzyScore", () => {
  it("rejects a query whose characters are out of order", () => {
    expect(fuzzyScore("bug", "gub")).toBeNull();
  });

  it("rewards consecutive matches over scattered ones", () => {
    const consecutive = fuzzyScore("fila", "Fila") ?? 0;
    const scattered = fuzzyScore("fila", "Faturamento inicial longo antes") ?? 0;
    expect(consecutive).toBeGreaterThan(scattered);
  });

  it("treats an empty query as neutral rather than a miss", () => {
    expect(fuzzyScore("", "qualquer")).toBe(0);
  });
});

describe("groupByKind", () => {
  it("keeps destinations first and drops empty groups", () => {
    const grouped = groupByKind([items[0], items[items.length - 1]]);
    expect(grouped.map((group) => group.kind)).toEqual(["destination", "source"]);
  });
});
