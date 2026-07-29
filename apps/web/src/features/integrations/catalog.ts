import {
  BookOpenText,
  CalendarDays,
  Columns3,
  GitPullRequest,
  ListTodo,
  MessageSquareText,
  type LucideIcon,
} from "lucide-react";
import type { Service } from "@/lib/api-client";

export type IntegrationCatalogItem = {
  id: Service;
  name: string;
  scope: string;
  authStrategy: string;
  syncMode: string;
  objects: string[];
  icon: LucideIcon;
};

export const integrationCatalog: IntegrationCatalogItem[] = [
  {
    id: "github",
    name: "GitHub",
    scope: "Repositories, PRs, issues, reviews, checks, releases, commits, and contributors.",
    authStrategy: "oauth",
    syncMode: "incremental_webhook",
    objects: ["pull_requests", "issues", "commits", "reviews", "review_comments", "releases", "checks"],
    icon: GitPullRequest,
  },
  {
    id: "slack",
    name: "Slack",
    scope: "Engineering channels, threads, decisions, questions, and blockers.",
    authStrategy: "oauth",
    syncMode: "incremental_polling",
    objects: ["channels", "messages", "threads", "decisions", "blockers"],
    icon: MessageSquareText,
  },
  {
    id: "linear",
    name: "Linear",
    scope: "Cycles, projects, issues, labels, assignees, estimates, and blockers.",
    authStrategy: "oauth",
    syncMode: "incremental_polling",
    objects: ["teams", "projects", "cycles", "issues", "labels", "comments"],
    icon: ListTodo,
  },
  {
    id: "jira",
    name: "Jira",
    scope: "Projects, epics, tickets, sprint status, comments, and blockers.",
    authStrategy: "oauth",
    syncMode: "incremental_polling",
    objects: ["projects", "epics", "issues", "sprints", "comments", "statuses"],
    icon: ListTodo,
  },
  {
    id: "trello",
    name: "Trello",
    scope: "Boards, lists, cards, labels, due dates, comments, and card movements.",
    authStrategy: "oauth",
    syncMode: "incremental_polling",
    objects: ["boards", "lists", "cards", "labels", "comments", "members"],
    icon: Columns3,
  },
  {
    id: "notion",
    name: "Notion",
    scope: "Specs, decisions, project notes, documentation, and searchable document chunks.",
    authStrategy: "oauth",
    syncMode: "incremental_polling",
    objects: ["databases", "pages", "blocks", "documents", "decisions", "chunks"],
    icon: BookOpenText,
  },
  {
    id: "calendar",
    name: "Calendar",
    scope: "Meetings, attendees, descriptions, follow-ups, decision traces, and risks.",
    authStrategy: "oauth",
    syncMode: "scheduled_polling",
    objects: ["calendars", "events", "attendees", "follow_ups", "decisions"],
    icon: CalendarDays,
  },
];

export const integrationCatalogById = Object.fromEntries(
  integrationCatalog.map((integration) => [integration.id, integration]),
) as Record<Service, IntegrationCatalogItem>;

export function getIntegrationCatalogItem(service: string) {
  return integrationCatalog.find((integration) => integration.id === service);
}
