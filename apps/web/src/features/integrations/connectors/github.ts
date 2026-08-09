import { createConnector, mockRecord } from "../connector-factory";

export const githubConnector = createConnector({
  id: "github",
  name: "GitHub",
  authStrategy: "oauth",
  capabilities: ["oauth", "webhooks", "initial_sync", "semantic_context"],
  syncMode: "webhook_first",
  objects: ["pull_requests", "issues", "commits", "reviews", "checks", "releases", "contributors"],
  connectUrl: "/api/auth/github/start",
  fetchRecentRecords: async () => [
    mockRecord("gh-pr-1482", "Add session refresh flow for GitHub OAuth", "Guilherme", {
      repository: "standup-web",
      number: 1482,
      status: "blocked",
      blockedBy: "failing_checks",
    }),
    mockRecord("gh-check-991", "Auth session refresh checks failed", "GitHub Actions", {
      repository: "standup-web",
      checkSuite: "e2e-login",
      conclusion: "failure",
    }),
  ],
  normalize: (records) =>
    records.map((record) => ({
      id: `evt-${record.id}`,
      type: record.id.includes("check") ? "check.failed" : "pull_request.opened",
      title: record.title,
      source: `GitHub · ${record.payload.repository}`,
      actor: record.actor,
      occurredAt: "Just now",
      priority: record.payload.status === "blocked" || record.payload.conclusion === "failure" ? "high" : "medium",
      summary:
        record.payload.conclusion === "failure"
          ? "A GitHub check failed and should be correlated with release or ticket blockers."
          : "A pull request changed state and was normalized into the shared work-event stream.",
    })),
});
