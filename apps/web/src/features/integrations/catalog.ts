import type { Service } from "@/lib/api-client";

export type IntegrationCatalogItem = {
  id: Service;
  name: string;
  scope: string;
  authStrategy: string;
  syncMode: string;
  objects: string[];
  connect?: {
    preConnectTitle: string;
    preConnectDescription: string;
    permissionBullets: string[];
    oauthCtaLabel: string;
  };
  resources?: {
    title: string;
    description: string;
    resourceSelectionLabel: string;
    firstSyncLabel: string;
    emptyTitle: string;
    emptyDescription: string;
    searchPlaceholder: string;
    setupQuestions: {
      contextScope: string;
      includeRecent: string;
      includeRecentHelp: string;
      extractionTypes: string;
      syncWindow: string;
    };
    extractionOptions: { value: string; label: string }[];
  };
};

export const integrationCatalog: IntegrationCatalogItem[] = [
  {
    id: "github",
    name: "GitHub",
    scope: "Repositories, PRs, issues, reviews, checks, releases, commits, and contributors.",
    authStrategy: "oauth",
    syncMode: "incremental_webhook",
    objects: ["pull_requests", "issues", "commits", "reviews", "review_comments", "releases", "checks"],
  },
  {
    id: "slack",
    name: "Slack",
    scope: "Engineering channels, DMs, threads, decisions, questions, and blockers.",
    authStrategy: "oauth",
    syncMode: "incremental_polling",
    objects: ["channels", "direct_messages", "messages", "threads", "decisions", "blockers"],
    connect: {
      preConnectTitle: "Vamos conectar seu workspace Slack.",
      preConnectDescription:
        "Standup reads selected Slack conversations to detect decisions, blockers, mentions, and relevant threads. You will choose channels and DMs after authorizing Slack.",
      permissionBullets: [
        "Read selected Slack channels, DMs, and threads.",
        "Detect decisions, blockers, mentions, and threads with links.",
        "Keep conversation selection under your control before the first sync.",
      ],
      oauthCtaLabel: "Continue to Slack",
    },
    resources: {
      title: "Choose Slack conversations",
      description: "Select the channels and DMs Standup should read for decisions, blockers, mentions, and relevant threads.",
      resourceSelectionLabel: "Slack conversations",
      firstSyncLabel: "Start first sync",
      emptyTitle: "No Slack conversations are available",
      emptyDescription:
        "Standup could not find channels or DMs for this token. Private channels and DMs only appear when Slack grants the required scopes and the app has access.",
      searchPlaceholder: "Search Slack conversations",
      setupQuestions: {
        contextScope: "Quais conversas devem virar contexto?",
        includeRecent: "Incluir canais privados e DMs?",
        includeRecentHelp:
          "Private channels and DMs appear only when Slack grants the required scopes and the app has access to those conversations.",
        extractionTypes: "Que tipo de informação extrair?",
        syncWindow: "A partir de quando sincronizar?",
      },
      extractionOptions: [
        { value: "decisions", label: "Decisions" },
        { value: "blockers", label: "Blockers" },
        { value: "mentions", label: "Mentions" },
        { value: "threads_with_links", label: "Threads with links" },
      ],
    },
  },
  {
    id: "linear",
    name: "Linear",
    scope: "Cycles, projects, issues, labels, assignees, estimates, and blockers.",
    authStrategy: "oauth",
    syncMode: "incremental_polling",
    objects: ["teams", "projects", "cycles", "issues", "labels", "comments"],
    connect: {
      preConnectTitle: "Connect Linear",
      preConnectDescription:
        "Authorize Linear so Standup can read issues, cycles, projects, labels, comments, assignees, estimates, and blockers.",
      permissionBullets: [
        "Read teams, projects, cycles, and issues",
        "Find blockers, ownership, priorities, and delivery context",
        "Choose which teams or projects should feed Standup after authorization",
      ],
      oauthCtaLabel: "Continue to Linear",
    },
    resources: {
      title: "Choose Linear scope",
      description:
        "Select the Linear teams or projects Standup should read for blockers, cycle risk, assignments, comments, and delivery changes.",
      resourceSelectionLabel: "Linear teams and projects",
      firstSyncLabel: "Start first sync",
      emptyTitle: "No Linear teams or projects are available",
      emptyDescription:
        "Standup could not find Linear teams or projects for this token. Check that the authorized Linear user can access the workspace resources.",
      searchPlaceholder: "Search Linear teams or projects",
      setupQuestions: {
        contextScope: "Quais times/projetos devem virar contexto?",
        includeRecent: "Incluir issues arquivadas/fechadas recentes?",
        includeRecentHelp: "Recent closed or archived issues can help Standup identify completed work and delivery risk.",
        extractionTypes: "Que tipo de contexto extrair?",
        syncWindow: "A partir de quando sincronizar?",
      },
      extractionOptions: [
        { value: "blockers", label: "Blockers" },
        { value: "cycle_risk", label: "Cycle risk" },
        { value: "assignments", label: "Assignments" },
        { value: "comments", label: "Comments" },
        { value: "delivery_changes", label: "Delivery changes" },
      ],
    },
  },
  {
    id: "jira",
    name: "Jira",
    scope: "Projects, epics, tickets, sprint status, comments, and blockers.",
    authStrategy: "oauth",
    syncMode: "incremental_polling",
    objects: ["projects", "epics", "issues", "sprints", "comments", "statuses"],
    connect: {
      preConnectTitle: "Connect Jira",
      preConnectDescription:
        "Authorize Jira so Standup can read projects, epics, issues, sprint status, comments, and blockers.",
      permissionBullets: [
        "Read projects, boards/sprints, epics, and issues",
        "Find blockers, status changes, assignments, and delivery risk",
        "Choose which Jira projects should feed Standup after authorization",
      ],
      oauthCtaLabel: "Continue to Jira",
    },
    resources: {
      title: "Choose Jira projects",
      description:
        "Select the Jira projects Standup should read for blockers, status changes, comments, sprint risk, and assignments.",
      resourceSelectionLabel: "Jira projects",
      firstSyncLabel: "Start first sync",
      emptyTitle: "No Jira projects are available",
      emptyDescription:
        "Standup could not find Jira projects for this token. Check that the authorized Jira user can browse projects on the configured site.",
      searchPlaceholder: "Search Jira projects",
      setupQuestions: {
        contextScope: "Quais projetos devem virar contexto?",
        includeRecent: "Incluir sprints ativos e recentes?",
        includeRecentHelp: "Active and recent sprint context helps Standup identify sprint risk and delivery changes.",
        extractionTypes: "Que tipo de contexto extrair?",
        syncWindow: "A partir de quando sincronizar?",
      },
      extractionOptions: [
        { value: "blockers", label: "Blockers" },
        { value: "status_changes", label: "Status changes" },
        { value: "comments", label: "Comments" },
        { value: "sprint_risk", label: "Sprint risk" },
        { value: "assignments", label: "Assignments" },
      ],
    },
  },
  {
    id: "trello",
    name: "Trello",
    scope: "Boards, lists, cards, labels, due dates, comments, and card movements.",
    authStrategy: "oauth",
    syncMode: "incremental_polling",
    objects: ["boards", "lists", "cards", "labels", "comments", "members"],
  },
  {
    id: "notion",
    name: "Notion",
    scope: "Specs, decisions, project notes, documentation, and searchable document chunks.",
    authStrategy: "oauth",
    syncMode: "incremental_polling",
    objects: ["databases", "pages", "blocks", "documents", "decisions", "chunks"],
  },
  {
    id: "calendar",
    name: "Calendar",
    scope: "Meetings, attendees, descriptions, follow-ups, decision traces, and risks.",
    authStrategy: "oauth",
    syncMode: "scheduled_polling",
    objects: ["calendars", "events", "attendees", "follow_ups", "decisions"],
  },
];

export const integrationCatalogById = Object.fromEntries(
  integrationCatalog.map((integration) => [integration.id, integration]),
) as Record<Service, IntegrationCatalogItem>;

export function getIntegrationCatalogItem(service: string) {
  return integrationCatalog.find((integration) => integration.id === service);
}
