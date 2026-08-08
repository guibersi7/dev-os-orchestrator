import { createConnector, mockRecord } from "../connector-factory";

export const linearConnector = createConnector({
  id: "linear",
  name: "Linear",
  authStrategy: "oauth",
  capabilities: ["oauth", "webhooks", "initial_sync", "semantic_context", "write_back"],
  syncMode: "webhook_first",
  objects: ["teams", "projects", "cycles", "issues", "comments", "labels"],
  connectUrl: "/api/auth/linear/start",
  fetchRecentRecords: async () => [
    mockRecord("linear-standup-884", "Large repository sync moved into Current cycle", "Triage", {
      team: "Standup",
      issue: "STD-884",
      status: "In Progress",
    }),
  ],
  normalize: (records) =>
    records.map((record) => ({
      id: `evt-${record.id}`,
      type: "linear.issue.updated",
      title: record.title,
      source: `Linear · ${record.payload.team}`,
      actor: record.actor,
      occurredAt: "Just now",
      priority: "high",
      summary: "A Linear issue changed priority or cycle and now influences the recommended focus queue.",
    })),
});
