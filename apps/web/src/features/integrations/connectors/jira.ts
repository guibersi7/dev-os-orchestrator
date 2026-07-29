import { createConnector, mockRecord } from "../connector-factory";

export const jiraConnector = createConnector({
  id: "jira",
  name: "Jira",
  authStrategy: "oauth",
  capabilities: ["oauth", "webhooks", "initial_sync", "polling", "write_back"],
  syncMode: "hybrid",
  objects: ["projects", "epics", "tickets", "sprints", "comments", "statuses"],
  connectUrl: "/api/auth/jira/start",
  fetchRecentRecords: async () => [
    mockRecord("jira-platform-421", "Release epic has a blocked dependency", "Platform Bot", {
      project: "PLAT",
      ticket: "PLAT-421",
      status: "Blocked",
    }),
  ],
  normalize: (records) =>
    records.map((record) => ({
      id: `evt-${record.id}`,
      type: "jira.ticket.blocked",
      title: record.title,
      source: `Jira · ${record.payload.project}`,
      actor: record.actor,
      occurredAt: "Just now",
      priority: "high",
      summary: "A Jira ticket is blocked and should be correlated with code and communication signals.",
    })),
});
