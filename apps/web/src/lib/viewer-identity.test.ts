import { describe, expect, it } from "vitest";
import type { ConnectionStatus } from "@/lib/api-client";
import type { WorkEvent } from "@/lib/work-event";
import { buildViewerIdentity, isViewerActor } from "@/lib/viewer-identity";

function connection(overrides: Partial<ConnectionStatus> = {}): ConnectionStatus {
  return {
    service: "github",
    status: "connected",
    providerConfigured: true,
    hasToken: true,
    hasRefreshToken: true,
    selectionStatus: "selected",
    selectedResourceCount: 1,
    scopes: [],
    lastSyncRecordsScanned: 0,
    lastSyncEventsCreated: 0,
    ...overrides,
  };
}

function event(actor: string, service: WorkEvent["service"] = "github"): WorkEvent {
  return {
    id: `evt-${actor}`,
    workspaceId: "ws-1",
    service,
    type: "review.requested",
    title: "#42",
    summary: "",
    actor,
    source: "acme/api",
    priority: "medium",
    occurredAt: new Date().toISOString(),
    metadata: {},
  };
}

describe("buildViewerIdentity", () => {
  it("trusts the account each connection authorized as", () => {
    const identity = buildViewerIdentity(null, [connection({ providerAccountId: "guibersi7" })]);
    expect(identity.resolved).toBe(true);
    expect(identity.byService.github).toBe("guibersi7");
  });

  it("derives a handle from the email local part", () => {
    const identity = buildViewerIdentity(
      { name: "Guilherme", email: "guilherme@bersi.dev" },
      [],
      [event("guilherme")],
    );
    expect(identity.resolved).toBe(true);
    expect(identity.handles.has("guilherme")).toBe(true);
  });

  it("normalizes case and a leading @", () => {
    const identity = buildViewerIdentity(null, [connection({ providerAccountId: "@GuiBersi7" })]);
    expect(identity.byService.github).toBe("guibersi7");
  });

  it("stays unresolved when nothing matches anyone in the payload", () => {
    const identity = buildViewerIdentity({ name: "Guilherme", email: "g@bersi.dev" }, [], [event("tainá")]);
    expect(identity.resolved).toBe(false);
  });

  it("stays unresolved with no user and no connections", () => {
    expect(buildViewerIdentity(null, [], [event("ana")]).resolved).toBe(false);
  });
});

describe("isViewerActor", () => {
  it("matches the per-service account first", () => {
    const identity = buildViewerIdentity(null, [connection({ providerAccountId: "guibersi7" })]);
    expect(isViewerActor(event("guibersi7"), identity)).toBe(true);
    expect(isViewerActor(event("ana"), identity)).toBe(false);
  });

  it("never claims an event when the identity is unresolved", () => {
    const identity = buildViewerIdentity(null, [], []);
    expect(isViewerActor(event("anybody"), identity)).toBe(false);
  });

  it("ignores an empty actor", () => {
    const identity = buildViewerIdentity(null, [connection({ providerAccountId: "guibersi7" })]);
    expect(isViewerActor(event(""), identity)).toBe(false);
  });
});
