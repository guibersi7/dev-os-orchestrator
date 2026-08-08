import { describe, expect, it } from "vitest";
import type { WorkEvent as GatewayWorkEvent } from "@/lib/api-client";
import { formatAge, normalizeWorkEvent, resolveExternalUrl } from "@/lib/work-event";

const NOW = new Date("2026-08-08T12:00:00Z").getTime();

function gatewayEvent(overrides: Partial<GatewayWorkEvent> = {}): GatewayWorkEvent {
  return {
    id: "evt-1",
    externalId: "github:acme/api:pr:42:review.requested:2026-08-06T12:00:00Z",
    service: "github",
    type: "review.requested",
    title: "#42 Normalize Linear payloads",
    source: "GitHub · acme/api",
    actor: "ana",
    priority: "high",
    summary: "A pull request is waiting for review.",
    occurredAt: "2026-08-06T12:00:00Z",
    ...overrides,
  };
}

describe("normalizeWorkEvent", () => {
  it("carries the gateway raw bag into metadata and stamps the workspace", () => {
    const event = normalizeWorkEvent(gatewayEvent({ raw: { repository: "acme/api" } }), "ws-1");
    expect(event.workspaceId).toBe("ws-1");
    expect(event.metadata).toEqual({ repository: "acme/api" });
  });

  it("hoists the item URL out of raw", () => {
    const event = normalizeWorkEvent(gatewayEvent({ raw: { url: "https://github.com/acme/api/pull/42" } }), "ws-1");
    expect(event.externalUrl).toBe("https://github.com/acme/api/pull/42");
  });

  it("clamps an unknown priority to medium", () => {
    expect(normalizeWorkEvent(gatewayEvent({ priority: "urgent" }), "ws-1").priority).toBe("medium");
  });

  it("survives a missing raw bag", () => {
    const event = normalizeWorkEvent(gatewayEvent(), "ws-1");
    expect(event.metadata).toEqual({});
    expect(event.externalUrl).toBeUndefined();
  });
});

describe("resolveExternalUrl", () => {
  it("accepts every key the connectors use", () => {
    for (const key of ["url", "html_url", "htmlUrl", "permalink", "webUrl", "externalUrl"]) {
      expect(resolveExternalUrl({ [key]: "https://example.com/x" })).toBe("https://example.com/x");
    }
  });

  it("ignores non-string and blank values", () => {
    expect(resolveExternalUrl({ url: 42 })).toBeUndefined();
    expect(resolveExternalUrl({ url: "   " })).toBeUndefined();
  });
});

describe("formatAge", () => {
  it("formats compactly for the mono slot", () => {
    expect(formatAge(new Date(NOW - 20 * 60_000).toISOString(), NOW)).toBe("20m");
    expect(formatAge(new Date(NOW - 4 * 3_600_000).toISOString(), NOW)).toBe("4h");
    expect(formatAge(new Date(NOW - 2 * 24 * 3_600_000).toISOString(), NOW)).toBe("2d");
    expect(formatAge(new Date(NOW - 21 * 24 * 3_600_000).toISOString(), NOW)).toBe("3sem");
  });

  it("does not crash on an unparseable date", () => {
    expect(formatAge("not-a-date", NOW)).toBe("—");
  });
});
