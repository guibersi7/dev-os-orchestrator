import { createConnector, mockRecord } from "../connector-factory";

export const slackConnector = createConnector({
  id: "slack",
  name: "Slack",
  authStrategy: "oauth",
  capabilities: ["oauth", "webhooks", "initial_sync", "semantic_context"],
  syncMode: "hybrid",
  objects: ["channels", "threads", "mentions", "decisions", "blockers"],
  connectUrl: "/api/auth/slack/start",
  fetchRecentRecords: async () => [
    mockRecord("slack-thread-77", "Release scope narrowed in #mobile-release", "Marina", {
      channel: "#mobile-release",
      decision: "Hold beta until OAuth refresh is reviewed",
      linkedPr: "1482",
    }),
    mockRecord("slack-blocker-12", "Backfill timeout called out in standup", "Diego", {
      channel: "#eng-standup",
      blocker: "Large workspace sync",
    }),
  ],
  normalize: (records) =>
    records.map((record) => ({
      id: `evt-${record.id}`,
      type: record.id.includes("blocker") ? "slack.blocker" : "slack.decision",
      title: record.title,
      source: `Slack · ${record.payload.channel}`,
      actor: record.actor,
      occurredAt: "Just now",
      priority: record.id.includes("blocker") ? "high" : "medium",
      summary:
        "A Slack conversation was condensed into a durable work event with decision or blocker context.",
    })),
});
