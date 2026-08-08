import { describe, expect, it } from "vitest";
import { advanceHref, buildQueueHref, parseOAuthQueue, retryHref } from "@/features/setup/oauth-queue";

describe("parseOAuthQueue", () => {
  it("resumes at the recorded position", () => {
    const queue = parseOAuthQueue({ queue: "github,linear,slack", i: "1" });
    expect(queue.current).toBe("linear");
    expect(queue.next).toBe("slack");
    expect(queue.position).toBe(2);
    expect(queue.isLast).toBe(false);
  });

  it("drops unknown and repeated services instead of crashing", () => {
    const queue = parseOAuthQueue({ queue: "github,myspace,github,linear", i: "0" });
    expect(queue.services).toEqual(["github", "linear"]);
  });

  it("clamps an out-of-range index", () => {
    expect(parseOAuthQueue({ queue: "github,linear", i: "99" }).current).toBe("linear");
    expect(parseOAuthQueue({ queue: "github,linear", i: "-4" }).current).toBe("github");
  });

  it("survives a missing or malformed index", () => {
    expect(parseOAuthQueue({ queue: "github" }).index).toBe(0);
    expect(parseOAuthQueue({ queue: "github", i: "abc" }).index).toBe(0);
  });

  it("reports an empty queue rather than inventing one", () => {
    const queue = parseOAuthQueue({});
    expect(queue.services).toEqual([]);
    expect(queue.current).toBeUndefined();
    expect(queue.position).toBe(0);
  });

  it("marks the final position as last", () => {
    expect(parseOAuthQueue({ queue: "github,linear", i: "1" }).isLast).toBe(true);
  });
});

describe("advanceHref", () => {
  it("walks to the next source", () => {
    const queue = parseOAuthQueue({ queue: "github,linear,slack", i: "0" });
    expect(advanceHref(queue)).toBe("/setup/oauth?queue=github%2Clinear%2Cslack&i=1");
  });

  it("leaves the queue for resource selection at the end", () => {
    const queue = parseOAuthQueue({ queue: "github,linear", i: "1" });
    expect(advanceHref(queue)).toBe("/setup/resources");
  });

  it("skipping the only source still finishes the flow", () => {
    expect(advanceHref(parseOAuthQueue({ queue: "github", i: "0" }))).toBe("/setup/resources");
  });
});

describe("retryHref", () => {
  it("keeps queue position so a failure does not restart the flow", () => {
    const queue = parseOAuthQueue({ queue: "github,linear,slack", i: "1" });
    expect(retryHref(queue)).toBe("/setup/oauth?queue=github%2Clinear%2Cslack&i=1");
  });
});

describe("buildQueueHref", () => {
  it("sends an empty selection back to the connection center", () => {
    expect(buildQueueHref([], 0)).toBe("/setup/connect");
  });
});
