import { createConnector, mockRecord } from "../connector-factory";

export const notionConnector = createConnector({
  id: "notion",
  name: "Notion",
  authStrategy: "oauth",
  capabilities: ["oauth", "initial_sync", "polling", "semantic_context"],
  syncMode: "polling_first",
  objects: ["pages", "databases", "specs", "decisions", "comments"],
  connectUrl: "/api/auth/notion/start",
  fetchRecentRecords: async () => [
    mockRecord("notion-adr-09", "WorkEvent model accepted as integration boundary", "Rafa", {
      workspace: "Architecture decisions",
      decision: "Normalize every provider into WorkEvent",
    }),
  ],
  normalize: (records) =>
    records.map((record) => ({
      id: `evt-${record.id}`,
      type: "notion.decision.logged",
      title: record.title,
      source: `Notion · ${record.payload.workspace}`,
      actor: record.actor,
      occurredAt: "Just now",
      priority: "medium",
      summary: "A Notion decision or spec changed and is now searchable from workspace chat.",
    })),
});
