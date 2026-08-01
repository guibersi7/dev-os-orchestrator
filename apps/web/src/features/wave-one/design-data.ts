export type SourceId = "github" | "linear" | "slack" | "calendar" | "jira" | "notion" | "trello";

export type SourceResource = {
  id: string;
  name: string;
  meta: string;
  signal: string;
  hot: boolean;
  est: number;
};

export type SourceDef = {
  id: SourceId;
  tag: string;
  name: string;
  unlocks: string;
  resLabel: string;
  owner: string;
  count: number;
  items: SourceResource[];
};

export const sources: SourceDef[] = [
  {
    id: "github",
    tag: "gh",
    name: "GitHub",
    unlocks: "Pull requests, review requests, checks and merges",
    resLabel: "Repositories",
    owner: "guibersi7",
    count: 14,
    items: [
      { id: "dev-os-orchestrator", name: "guibersi7/dev-os-orchestrator", meta: "TypeScript · 12 open PRs · updated 8m ago", signal: "high activity", hot: true, est: 512 },
      { id: "dev-os-web", name: "guibersi7/dev-os-web", meta: "TypeScript · 5 open PRs · updated 2h ago", signal: "high activity", hot: true, est: 384 },
      { id: "dev-os-connectors", name: "guibersi7/dev-os-connectors", meta: "Go · 3 open PRs · updated yesterday", signal: "high activity", hot: true, est: 388 },
      { id: "orchestrator-infra", name: "guibersi7/orchestrator-infra", meta: "HCL · 1 open PR · updated 3d ago", signal: "low activity", hot: false, est: 96 },
      { id: "design-tokens", name: "guibersi7/design-tokens", meta: "CSS · 0 open PRs · updated 2w ago", signal: "archived soon", hot: false, est: 24 },
      { id: "dev-os-docs", name: "guibersi7/dev-os-docs", meta: "MDX · 1 open PR · updated 5d ago", signal: "low activity", hot: false, est: 61 },
    ],
  },
  {
    id: "linear",
    tag: "li",
    name: "Linear",
    unlocks: "Blocked issues, cycle risk and what your PR unblocks",
    resLabel: "Teams and projects",
    owner: "bersi-labs",
    count: 6,
    items: [
      { id: "dev", name: "DEV · Platform", meta: "Sprint 1 · 38 open issues · 4 blocked", signal: "active cycle", hot: true, est: 302 },
      { id: "mob", name: "MOB · Mobile release", meta: "Sprint 1 · 12 open issues · ships Friday", signal: "active cycle", hot: true, est: 148 },
      { id: "des", name: "DES · Design", meta: "9 open issues · no cycle", signal: "low activity", hot: false, est: 44 },
      { id: "ops", name: "OPS · Infrastructure", meta: "5 open issues · updated 6d ago", signal: "low activity", hot: false, est: 31 },
    ],
  },
  {
    id: "slack",
    tag: "sl",
    name: "Slack",
    unlocks: "Threads waiting on you and decisions nobody answered",
    resLabel: "Channels",
    owner: "bersi-labs.slack.com",
    count: 41,
    items: [
      { id: "platform", name: "#dev-os-platform", meta: "42 messages/day · you are mentioned often", signal: "high signal", hot: true, est: 268 },
      { id: "releases", name: "#releases", meta: "11 messages/day · deploy and incident traffic", signal: "high signal", hot: true, est: 121 },
      { id: "mobile", name: "#mobile", meta: "18 messages/day", signal: "medium", hot: false, est: 96 },
      { id: "random", name: "#random", meta: "77 messages/day · mostly noise", signal: "skip this one", hot: false, est: 12 },
    ],
  },
  {
    id: "calendar",
    tag: "ca",
    name: "Calendar",
    unlocks: "Real focus windows between meetings",
    resLabel: "Calendars",
    owner: "guilherme@bersi.dev",
    count: 3,
    items: [
      { id: "work", name: "Work · guilherme@bersi.dev", meta: "18 events this week", signal: "primary", hot: true, est: 74 },
      { id: "team", name: "Platform team", meta: "Shared · 9 events this week", signal: "shared", hot: true, est: 38 },
      { id: "oncall", name: "On-call rotation", meta: "2 events this week", signal: "low", hot: false, est: 9 },
    ],
  },
  {
    id: "jira",
    tag: "ji",
    name: "Jira",
    unlocks: "Sprint scope and status changes",
    resLabel: "Projects",
    owner: "bersi.atlassian.net",
    count: 4,
    items: [
      { id: "plat", name: "PLAT · Platform", meta: "64 issues · active sprint", signal: "active", hot: true, est: 214 },
      { id: "sup", name: "SUP · Support", meta: "31 issues", signal: "medium", hot: false, est: 88 },
    ],
  },
  {
    id: "notion",
    tag: "no",
    name: "Notion",
    unlocks: "Specs and docs referenced by open work",
    resLabel: "Spaces",
    owner: "bersi-labs",
    count: 5,
    items: [
      { id: "eng", name: "Engineering wiki", meta: "128 pages · 12 edited this week", signal: "active", hot: true, est: 92 },
      { id: "rfc", name: "RFCs", meta: "24 pages · 3 open proposals", signal: "active", hot: true, est: 47 },
    ],
  },
  {
    id: "trello",
    tag: "tr",
    name: "Trello",
    unlocks: "Cards moving without owners",
    resLabel: "Boards",
    owner: "bersi-labs",
    count: 2,
    items: [{ id: "ship", name: "Shipping board", meta: "34 cards · 6 without owner", signal: "active", hot: true, est: 63 }],
  },
];

export const defaultConnectedIds: SourceId[] = ["github", "linear", "slack"];

export const heroQueue = [
  { n: "01", title: "Review Auth OAuth flow · PR #42", reason: "Ana has waited 2 days. DEV-18 is blocked behind it.", src: "github" },
  { n: "02", title: "DEV-18 mobile release is blocked", reason: "Sprint 1 ends Friday. Only your merge unblocks it.", src: "linear" },
  { n: "03", title: "Connector retries thread needs your call", reason: "Rafa asked 4h ago. Two engineers paused on the answer.", src: "slack" },
];

export const setupBeats = [
  { n: "01", time: "20s", title: "Authorize", desc: "OAuth in a popup. Read-only scopes, shown before you approve." },
  { n: "02", time: "30s", title: "Choose resources", desc: "Pick the repositories, projects or channels you actually work in." },
  { n: "03", time: "40s", title: "First sync", desc: "30 days of history pulled and translated into work events." },
  { n: "04", time: "now", title: "Value", desc: "Your queue re-ranks the moment the new source lands." },
];

export const focusQueue = [
  { tag: "blocking 2", tagClass: "bg-[var(--standup-accent-surface)] text-[var(--standup-accent-text)]", src: "guibersi7/dev-os-orchestrator", age: "2d", title: "Review requested · Auth OAuth flow #42", reason: "Ana asked on Monday and has not shipped since. DEV-18 and the mobile release sit behind this merge.", action: "Review" },
  { tag: "failing", tagClass: "bg-[#22141C] text-[#FF9CAF]", src: "guibersi7/dev-os-connectors", age: "40m", title: "Checks failing on your branch · retry-backoff #118", reason: "Two integration tests broke after your last push. Nobody else is touching this branch.", action: "Open" },
  { tag: "decision", tagClass: "bg-[#241F14] text-[#F6C66A]", src: "thread · #dev-os-platform", age: "4h", title: "Retry policy for connector webhooks", reason: "Rafa asked a direct question. Two engineers paused their work waiting for the call.", action: "Reply" },
];
