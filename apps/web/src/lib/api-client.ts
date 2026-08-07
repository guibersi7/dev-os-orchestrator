import { cookies } from "next/headers";
import { getGatewayUserId } from "@/lib/auth/server";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspace-session";

export type Service = "github" | "slack" | "linear" | "jira" | "trello" | "notion" | "calendar";

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  role?: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkspacesPayload = {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  workspaceCount: number;
  isolationStrategy: "workspace_id" | string;
  integrationScope: "per_workspace" | string;
  crossWorkspaceData: boolean;
};

export type WorkEvent = {
  id: string;
  externalId?: string;
  service: Service;
  type: string;
  title: string;
  source: string;
  actor: string;
  priority: "low" | "medium" | "high" | string;
  summary: string;
  occurredAt: string;
  raw?: Record<string, unknown>;
};

export type DashboardMetrics = {
  connectedSources: number;
  waitingReview: number;
  crossToolBlockers: number;
  decisionsFound: number;
};

export type SourceHealth = {
  service: Service;
  status: string;
  lastSyncedAt?: string | null;
};

export type ConnectionStatus = {
  service: Service;
  status: string;
  providerConfigured: boolean;
  hasToken: boolean;
  hasRefreshToken: boolean;
  selectionStatus: string;
  selectedResourceCount: number;
  providerAccountId?: string;
  expiresAt?: string | null;
  scopes: string[];
  lastSyncedAt?: string | null;
  lastSyncError?: string;
  lastSyncRecordsScanned: number;
  lastSyncEventsCreated: number;
  updatedAt?: string | null;
};

export type SelectableResource = {
  id: string;
  type: string;
  name: string;
  externalUrl?: string;
  metadata?: Record<string, unknown>;
};

export type ResourceSelection = {
  service: Service;
  status: string;
  resources: SelectableResource[];
  selectedAt: string;
  selectedBy: string;
  resourceIds: string[];
};

export type SelectableResourcesPayload = {
  service: Service;
  status: string;
  resources: SelectableResource[];
  selectedResourceIds: string[];
};

export type OAuthStartResponse = {
  service: Service;
  status: "ready" | "needs_config" | string;
  authorizationUrl?: string;
  state?: string;
  scopes?: string[];
  missing?: string[];
};

export type DashboardPayload = {
  workspaceId: string;
  generatedAt: string;
  metrics: DashboardMetrics;
  today: DashboardToday;
  focus: FocusItem[];
  weeklySummary: WeeklySummary;
  events: WorkEvent[];
  sourceHealth: SourceHealth[];
};

export type DashboardToday = {
  prsWaitingForReview: WorkEvent[];
  blockedPrs: WorkEvent[];
  failedChecks: WorkEvent[];
  assignedIssues: WorkEvent[];
  recentImportantChanges: WorkEvent[];
};

export type FocusItem = {
  id: string;
  title: string;
  reason: string;
  action: string;
  priority: "low" | "medium" | "high" | string;
  service: Service;
  sources: string[];
  eventIds: string[];
  createdAt: string;
};

export type WeeklySummary = {
  completedWork: string[];
  mergedPrs: WorkEvent[];
  closedIssues: WorkEvent[];
  activeWork: WorkEvent[];
  risks: string[];
  blockers: WorkEvent[];
  summaryStrategy: string;
};

export type ConnectorInfo = {
  id: Service;
  name: string;
  authStrategy: string;
  syncMode: string;
  capabilities: string[];
  objects: string[];
};

export type SyncResult = {
  service: Service;
  status: string;
  recordsScanned: number;
  eventsCreated: number;
  nextCursor?: string | null;
  events: WorkEvent[];
};

export type UserConfig = {
  workspaceId: string;
  userId: string;
  dashboardPreferences: {
    defaultView: string;
    visibleSources: Service[];
  };
  notificationPreferences: {
    blockers: boolean;
    failedChecks: boolean;
    decisions: boolean;
  };
};

export type GatewayState<T> = {
  data: T | null;
  error: string | null;
};

type APIError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

type APIEnvelope<T> = {
  version: string;
  requestId: string;
  data?: T;
  error?: APIError | null;
};

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const WORKSPACE_ID = process.env.NEXT_PUBLIC_WORKSPACE_ID ?? "00000000-0000-4000-8000-000000000001";

type GatewayRequestOptions = RequestInit & {
  workspaceId?: string;
};

class GatewayError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export async function getActiveWorkspaceId() {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? WORKSPACE_ID;
}

async function requestGateway<T>(path: string, init: GatewayRequestOptions = {}): Promise<T> {
  const userId = await getGatewayUserId();
  const { workspaceId, ...requestInit } = init;
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("x-workspace-id", workspaceId ?? (await getActiveWorkspaceId()));
  headers.set("x-user-id", userId);
  headers.set("x-request-id", `web_${Date.now().toString(36)}`);

  if (process.env.API_GATEWAY_SECRET) {
    headers.set("authorization", `Bearer ${process.env.API_GATEWAY_SECRET}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestInit,
    headers,
    cache: "no-store",
  });

  let envelope: APIEnvelope<T>;
  try {
    envelope = (await response.json()) as APIEnvelope<T>;
  } catch {
    throw new GatewayError("API Gateway returned an invalid response.", response.status);
  }

  if (!response.ok || envelope.error) {
    throw new GatewayError(
      envelope.error?.message ?? "API Gateway request failed.",
      response.status,
      envelope.error?.code,
    );
  }

  if (!envelope.data) {
    throw new GatewayError("API Gateway returned an empty response.", response.status);
  }

  return envelope.data;
}

async function captureGatewayState<T>(request: () => Promise<T>): Promise<GatewayState<T>> {
  try {
    return { data: await request(), error: null };
  } catch (error) {
    if (error instanceof GatewayError) {
      const suffix = error.code ? ` (${error.code})` : "";
      return { data: null, error: `${error.message}${suffix}` };
    }

    return { data: null, error: "Unable to reach the API Gateway." };
  }
}

export function getDashboardState(workspaceId?: string) {
  return captureGatewayState(() =>
    requestGateway<{ gateway: string; dashboard: DashboardPayload }>("/v1/dashboard", { workspaceId }),
  );
}

export function getWorkspacesState(workspaceId?: string) {
  return captureGatewayState(() => requestGateway<WorkspacesPayload>("/v1/workspaces", { workspaceId }));
}

export function createWorkspace(name: string, slug?: string, workspaceId?: string) {
  return captureGatewayState(() =>
    requestGateway<{
      workspace: Workspace;
      isolationStrategy: string;
      integrationScope: string;
      crossWorkspaceData: boolean;
    }>("/v1/workspaces", {
      method: "POST",
      workspaceId,
      body: JSON.stringify({ name, slug }),
    }),
  );
}

export function getConfigState() {
  return captureGatewayState(() => requestGateway<{ config: UserConfig }>("/v1/config"));
}

export function getConnectionsState() {
  return captureGatewayState(() => requestGateway<{ connections: ConnectionStatus[] }>("/v1/connections"));
}

export function disconnectConnection(service: Service) {
  return captureGatewayState(() =>
    requestGateway<{ connection: ConnectionStatus }>(`/v1/connections/${service}`, {
      method: "DELETE",
    }),
  );
}

export function getSelectableResourcesState(service: Service) {
  return captureGatewayState(() =>
    requestGateway<SelectableResourcesPayload>(`/v1/connections/${service}/resources`),
  );
}

export function saveResourceSelection(service: Service, resources: SelectableResource[]) {
  return captureGatewayState(() =>
    requestGateway<{ selection: ResourceSelection }>(`/v1/connections/${service}/selection`, {
      method: "PUT",
      body: JSON.stringify({ resources }),
    }),
  );
}

export function startOAuthConnection(service: Service, redirectUri?: string) {
  const callbackUri = redirectUri ?? `${API_BASE_URL}/v1/oauth/${service}/callback`;
  return captureGatewayState(() =>
    requestGateway<OAuthStartResponse>(`/v1/oauth/${service}/start?redirectUri=${encodeURIComponent(callbackUri)}`),
  );
}

export function completeOAuthConnection(service: Service, code: string, state: string) {
  return captureGatewayState(() =>
    requestGateway<{
      service: Service;
      status: string;
      providerAccountId: string;
      expiresAt?: string | null;
      scopes: string[];
    }>(`/v1/oauth/${service}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`),
  );
}

export function syncIntegration(service: Service) {
  return captureGatewayState(() =>
    requestGateway<{ connector: ConnectorInfo; result: SyncResult }>("/v1/sync", {
      method: "POST",
      body: JSON.stringify({ service }),
    }),
  );
}

export function updateConfig(config: UserConfig) {
  return captureGatewayState(() =>
    requestGateway<{ persisted: boolean }>("/v1/config", {
      method: "PUT",
      body: JSON.stringify(config),
    }),
  );
}
