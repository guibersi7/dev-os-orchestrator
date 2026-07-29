import type { IntegrationKind, WorkEvent } from "@/lib/product-data";

export type IntegrationCapability =
  | "oauth"
  | "webhooks"
  | "initial_sync"
  | "polling"
  | "semantic_context"
  | "write_back";

export type ExternalRecord = {
  id: string;
  externalUrl: string;
  title: string;
  actor: string;
  updatedAt: string;
  payload: Record<string, string | number | boolean | string[]>;
};

export type SyncResult = {
  service: IntegrationKind;
  status: "connected" | "needs_auth" | "syncing";
  recordsScanned: number;
  eventsCreated: number;
  nextCursor: string | null;
  events: WorkEvent[];
};

export type IntegrationConnector = {
  id: IntegrationKind;
  name: string;
  authStrategy: "oauth" | "api_token";
  capabilities: IntegrationCapability[];
  syncMode: "webhook_first" | "polling_first" | "hybrid";
  objects: string[];
  connectUrl: string;
  fetchRecentRecords: () => Promise<ExternalRecord[]>;
  normalize: (records: ExternalRecord[]) => WorkEvent[];
  sync: () => Promise<SyncResult>;
};
