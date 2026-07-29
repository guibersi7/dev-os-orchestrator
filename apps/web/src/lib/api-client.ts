export type Service = "github" | "slack" | "linear" | "jira" | "trello" | "notion" | "calendar";

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

export type DashboardPayload = {
  workspaceId: string;
  generatedAt: string;
  metrics: DashboardMetrics;
  events: WorkEvent[];
  sourceHealth: SourceHealth[];
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
const USER_ID = process.env.NEXT_PUBLIC_USER_ID ?? "00000000-0000-4000-8000-000000000002";

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

async function requestGateway<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("x-workspace-id", WORKSPACE_ID);
  headers.set("x-user-id", USER_ID);
  headers.set("x-request-id", `web_${Date.now().toString(36)}`);

  if (process.env.API_GATEWAY_SECRET) {
    headers.set("authorization", `Bearer ${process.env.API_GATEWAY_SECRET}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
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

export function getDashboardState() {
  return captureGatewayState(() => requestGateway<{ gateway: string; dashboard: DashboardPayload }>("/v1/dashboard"));
}

export function getConfigState() {
  return captureGatewayState(() => requestGateway<{ config: UserConfig }>("/v1/config"));
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
