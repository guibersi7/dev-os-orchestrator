import { createConnector, mockRecord } from "../connector-factory";

export const trelloConnector = createConnector({
  id: "trello",
  name: "Trello",
  authStrategy: "oauth",
  capabilities: ["oauth", "webhooks", "initial_sync", "polling"],
  syncMode: "hybrid",
  objects: ["boards", "lists", "cards", "checklists", "comments", "due_dates"],
  connectUrl: "/api/auth/trello/start",
  fetchRecentRecords: async () => [
    mockRecord("trello-launch-18", "Customer onboarding card moved to Blocked", "Ana", {
      board: "GTM launch",
      list: "Blocked",
      card: "Public beta support checklist",
    }),
  ],
  normalize: (records) =>
    records.map((record) => ({
      id: `evt-${record.id}`,
      type: "trello.card.moved",
      title: record.title,
      source: `Trello · ${record.payload.board}`,
      actor: record.actor,
      occurredAt: "Just now",
      priority: "medium",
      summary: "A Trello card moved lists and may represent GTM, support, or launch readiness work.",
    })),
});
