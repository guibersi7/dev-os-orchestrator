import {
  AlertTriangle,
  BookOpenText,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Columns3,
  GitCommitHorizontal,
  GitPullRequest,
  ListTodo,
  MessageSquareText,
  MessagesSquare,
  Radio,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

export type IntegrationKind = "github" | "slack" | "linear" | "jira" | "trello" | "notion" | "calendar";

export type WorkEventType =
  | "pull_request.opened"
  | "pull_request.merged"
  | "review.requested"
  | "check.failed"
  | "issue.assigned"
  | "release.risk"
  | "commit.pushed"
  | "slack.decision"
  | "slack.blocker"
  | "linear.issue.updated"
  | "jira.ticket.blocked"
  | "trello.card.moved"
  | "notion.decision.logged"
  | "calendar.meeting.ended";

export type WorkEvent = {
  id: string;
  type: WorkEventType;
  title: string;
  source: string;
  actor: string;
  occurredAt: string;
  priority: "low" | "medium" | "high";
  summary: string;
};

export type PullRequest = {
  id: string;
  number: number;
  title: string;
  repository: string;
  author: string;
  status: "waiting_review" | "blocked" | "checks_failed" | "ready";
  age: string;
  reviews: number;
  comments: number;
  changedFiles: number;
  blocksRelease?: string;
};

export type Issue = {
  id: string;
  number: number;
  title: string;
  repository: string;
  assignee: string;
  priority: "P0" | "P1" | "P2";
  status: "open" | "in_progress" | "blocked";
};

export type IntegrationSource = {
  id: IntegrationKind;
  name: string;
  connected: boolean;
  scope: string;
  objects: string;
  events: number;
};

export const integrations: IntegrationSource[] = [
  {
    id: "github",
    name: "GitHub",
    connected: true,
    scope: "Repositories, PRs, issues, reviews, checks, releases",
    objects: "28 PRs · 69 issues · 2 releases",
    events: 2508,
  },
  {
    id: "slack",
    name: "Slack",
    connected: true,
    scope: "Engineering channels, threads, decisions, blockers",
    objects: "6 channels · 42 decision threads",
    events: 1184,
  },
  {
    id: "linear",
    name: "Linear",
    connected: true,
    scope: "Cycles, projects, issues, labels, assignees",
    objects: "3 projects · 91 issues",
    events: 932,
  },
  {
    id: "jira",
    name: "Jira",
    connected: false,
    scope: "Epics, tickets, sprint status, blockers",
    objects: "Ready to connect",
    events: 0,
  },
  {
    id: "trello",
    name: "Trello",
    connected: false,
    scope: "Boards, cards, lists, due dates",
    objects: "Ready to connect",
    events: 0,
  },
  {
    id: "notion",
    name: "Notion",
    connected: true,
    scope: "Specs, decisions, project notes, docs",
    objects: "14 specs · 8 decision docs",
    events: 276,
  },
  {
    id: "calendar",
    name: "Calendar",
    connected: false,
    scope: "Meetings, attendees, follow-ups",
    objects: "Ready to connect",
    events: 0,
  },
];

export const repositories = [
  { name: "devos-web", owner: "acme", selected: true, prs: 18, issues: 42, events: 1340 },
  { name: "mobile-core", owner: "acme", selected: true, prs: 7, issues: 19, events: 640 },
  { name: "billing-api", owner: "acme", selected: false, prs: 4, issues: 11, events: 320 },
  { name: "infra", owner: "acme", selected: true, prs: 3, issues: 8, events: 208 },
];

export const pullRequests: PullRequest[] = [
  {
    id: "auth-session-refresh",
    number: 1482,
    title: "Add session refresh flow for GitHub OAuth",
    repository: "devos-web",
    author: "Guilherme",
    status: "blocked",
    age: "2d",
    reviews: 1,
    comments: 14,
    changedFiles: 12,
    blocksRelease: "Mobile beta 0.8",
  },
  {
    id: "normalize-review-events",
    number: 1475,
    title: "Normalize review comments into work events",
    repository: "devos-web",
    author: "Marina",
    status: "waiting_review",
    age: "18h",
    reviews: 0,
    comments: 6,
    changedFiles: 9,
  },
  {
    id: "fix-check-run-ingestion",
    number: 322,
    title: "Retry failed check-run ingestion jobs",
    repository: "infra",
    author: "Diego",
    status: "checks_failed",
    age: "7h",
    reviews: 2,
    comments: 3,
    changedFiles: 5,
  },
];

export const issues: Issue[] = [
  {
    id: "sync-backfill-timeout",
    number: 884,
    title: "Initial sync times out on repositories with 10k+ events",
    repository: "devos-web",
    assignee: "Guilherme",
    priority: "P1",
    status: "in_progress",
  },
  {
    id: "release-risk-copy",
    number: 251,
    title: "Clarify release risk reasons in Focus cards",
    repository: "mobile-core",
    assignee: "Guilherme",
    priority: "P2",
    status: "open",
  },
];

export const workEvents: WorkEvent[] = [
  {
    id: "evt-1",
    type: "check.failed",
    title: "Auth session refresh checks failed",
    source: "GitHub · devos-web",
    actor: "GitHub Actions",
    occurredAt: "24 min ago",
    priority: "high",
    summary: "The e2e login suite failed after a callback state validation change.",
  },
  {
    id: "evt-2",
    type: "slack.decision",
    title: "Release scope narrowed in #mobile-release",
    source: "Slack · #mobile-release",
    actor: "Marina",
    occurredAt: "42 min ago",
    priority: "high",
    summary: "The team agreed to hold Mobile beta 0.8 until OAuth refresh is reviewed and backfill risk is resolved.",
  },
  {
    id: "evt-3",
    type: "review.requested",
    title: "Review requested on normalized review events",
    source: "GitHub · devos-web",
    actor: "Marina",
    occurredAt: "1h ago",
    priority: "medium",
    summary: "This PR unlocks review-comment intelligence for the dashboard and chat.",
  },
  {
    id: "evt-4",
    type: "linear.issue.updated",
    title: "Large repository sync moved into Current cycle",
    source: "Linear · Developer OS",
    actor: "Triage",
    occurredAt: "2h ago",
    priority: "high",
    summary: "Initial sync needs chunked backfill before onboarding larger workspaces.",
  },
  {
    id: "evt-5",
    type: "notion.decision.logged",
    title: "WorkEvent model accepted as integration boundary",
    source: "Notion · Architecture decisions",
    actor: "Rafa",
    occurredAt: "Yesterday",
    priority: "medium",
    summary: "Future services will map external objects into internal work events before reaching product features.",
  },
  {
    id: "evt-6",
    type: "trello.card.moved",
    title: "Customer onboarding board card moved to Blocked",
    source: "Trello · GTM launch board",
    actor: "Ana",
    occurredAt: "Yesterday",
    priority: "medium",
    summary: "The public beta checklist now depends on OAuth callback copy and support docs.",
  },
];

export const focusItems = [
  {
    title: "Unblock OAuth before beta scope freezes",
    reason:
      "GitHub shows PR #1482 waiting for review, Slack confirmed it blocks Mobile beta 0.8, and Linear moved the backfill fix into the current cycle.",
    action: "Open release context",
    severity: "high",
  },
  {
    title: "Resolve large workspace onboarding risk",
    reason:
      "Linear issue #884, GitHub check failures, and Notion onboarding notes point to the same first-run sync bottleneck.",
    action: "Continue implementation",
    severity: "high",
  },
  {
    title: "Capture the architecture decision",
    reason:
      "A Notion decision references PR #1475, but the Slack thread still has unanswered questions about event retention.",
    action: "Summarize thread",
    severity: "medium",
  },
];

export const weeklySummary = {
  completed: ["Connected GitHub, Slack, Linear, and Notion", "Created WorkEvent normalization contract"],
  mergedPrs: 6,
  closedIssues: 9,
  decisions: 8,
  activeWork: ["OAuth session refresh", "Backfill chunking", "Review event ingestion", "Slack decision extraction"],
  risks: ["Large repository onboarding", "Failed auth e2e checks", "Release scope still spread across Slack and Linear"],
};

export const eventIcon = {
  "pull_request.opened": GitPullRequest,
  "pull_request.merged": CheckCircle2,
  "review.requested": MessageSquareText,
  "check.failed": AlertTriangle,
  "issue.assigned": CircleDot,
  "release.risk": ShieldAlert,
  "commit.pushed": GitCommitHorizontal,
  "slack.decision": MessagesSquare,
  "slack.blocker": MessageSquareText,
  "linear.issue.updated": ListTodo,
  "jira.ticket.blocked": ClipboardList,
  "trello.card.moved": Columns3,
  "notion.decision.logged": BookOpenText,
  "calendar.meeting.ended": CalendarDays,
} satisfies Record<WorkEventType, typeof Sparkles>;

export const integrationIcon = {
  github: GitPullRequest,
  slack: MessagesSquare,
  linear: ListTodo,
  jira: ClipboardList,
  trello: Columns3,
  notion: BookOpenText,
  calendar: CalendarDays,
} satisfies Record<IntegrationKind, typeof Radio>;
