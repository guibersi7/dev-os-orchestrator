import { createConnector, mockRecord } from "../connector-factory";

export const calendarConnector = createConnector({
  id: "calendar",
  name: "Calendar",
  authStrategy: "oauth",
  capabilities: ["oauth", "initial_sync", "polling", "semantic_context"],
  syncMode: "polling_first",
  objects: ["meetings", "attendees", "descriptions", "follow_ups"],
  connectUrl: "/api/auth/calendar/start",
  fetchRecentRecords: async () => [
    mockRecord("calendar-release-sync", "Mobile beta release sync ended", "Calendar", {
      calendar: "Engineering",
      attendees: ["Guilherme", "Marina", "Diego"],
      followUp: "Review OAuth blocker",
    }),
  ],
  normalize: (records) =>
    records.map((record) => ({
      id: `evt-${record.id}`,
      type: "calendar.meeting.ended",
      title: record.title,
      source: `Calendar · ${record.payload.calendar}`,
      actor: record.actor,
      occurredAt: "Just now",
      priority: "medium",
      summary: "A meeting ended with follow-ups that should be connected to tickets, PRs, and decisions.",
    })),
});
