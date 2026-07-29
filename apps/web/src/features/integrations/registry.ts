import type { IntegrationKind } from "@/lib/product-data";
import type { IntegrationConnector } from "./types";
import { calendarConnector } from "./connectors/calendar";
import { githubConnector } from "./connectors/github";
import { jiraConnector } from "./connectors/jira";
import { linearConnector } from "./connectors/linear";
import { notionConnector } from "./connectors/notion";
import { slackConnector } from "./connectors/slack";
import { trelloConnector } from "./connectors/trello";

export const integrationConnectors = {
  github: githubConnector,
  slack: slackConnector,
  linear: linearConnector,
  jira: jiraConnector,
  trello: trelloConnector,
  notion: notionConnector,
  calendar: calendarConnector,
} satisfies Record<IntegrationKind, IntegrationConnector>;

export function getIntegrationConnector(service: string) {
  if (service in integrationConnectors) {
    return integrationConnectors[service as IntegrationKind];
  }

  return null;
}

export async function syncAllIntegrations() {
  return Promise.all(Object.values(integrationConnectors).map((connector) => connector.sync()));
}
