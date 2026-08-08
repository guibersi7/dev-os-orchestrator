import { describe, expect, it } from "vitest";
import type { SourceSyncStatus, SyncState } from "@/features/setup/sync-progress";
import {
  completionHeadline,
  completionSummary,
  isSettled,
  overallPercent,
  readyCount,
  stageLine,
  totalEvents,
} from "@/features/setup/sync-progress";

function status(state: SyncState, eventsCreated = 0): SourceSyncStatus {
  return { service: "github", name: "GitHub", state, eventsCreated };
}

describe("overallPercent", () => {
  it("is zero before anything starts", () => {
    expect(overallPercent([status("queued"), status("queued")])).toBe(0);
  });

  it("moves while a source is mid-flight", () => {
    expect(overallPercent([status("reading"), status("queued")])).toBe(25);
  });

  it("counts a failed source as settled", () => {
    expect(overallPercent([status("done"), status("failed")])).toBe(100);
  });

  it("does not divide by zero on an empty run", () => {
    expect(overallPercent([])).toBe(0);
  });
});

describe("stageLine", () => {
  it("walks the four stages", () => {
    expect(stageLine(0)).toBe("Reading history from each source");
    expect(stageLine(45)).toBe("Resolving people, repositories and references");
    expect(stageLine(80)).toBe("Normalizing everything into work events");
    expect(stageLine(100)).toBe("Ranking your first morning");
  });
});

describe("completion copy", () => {
  it("says sync complete only when every source finished", () => {
    expect(completionHeadline([status("done"), status("done")])).toBe("Sync complete");
  });

  it("states partial failure plainly", () => {
    expect(completionHeadline([status("done"), status("done"), status("failed")])).toBe("2 of 3 sources ready");
  });

  it("does not claim readiness when nothing finished", () => {
    expect(completionHeadline([status("failed"), status("failed")])).toBe("No source finished syncing");
  });

  it("agrees in number", () => {
    expect(completionSummary([status("done", 1)])).toBe("1 work event normalized across 1 source.");
    expect(completionSummary([status("done", 512), status("done", 300)])).toBe(
      "812 work events normalized across 2 sources.",
    );
  });
});

describe("settlement", () => {
  it("is not settled while a source is still reading", () => {
    expect(isSettled([status("done"), status("reading")])).toBe(false);
  });

  it("is settled once every source is done or failed", () => {
    expect(isSettled([status("done"), status("failed")])).toBe(true);
  });

  it("an empty run is never settled", () => {
    expect(isSettled([])).toBe(false);
  });

  it("counts only the sources that succeeded", () => {
    expect(readyCount([status("done"), status("failed"), status("done")])).toBe(2);
  });

  it("sums events across sources", () => {
    expect(totalEvents([status("done", 12), status("done", 30), status("failed")])).toBe(42);
  });
});
