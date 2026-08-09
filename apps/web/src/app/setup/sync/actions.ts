"use server";

import type { Service } from "@/lib/api-client";
import { syncIntegration } from "@/lib/api-client";

export type SourceSyncOutcome = {
  ok: boolean;
  eventsCreated: number;
  error?: string;
};

/**
 * The gateway client reads cookies, so it only runs on the server. The sync
 * screen drives one call per source from the browser and this action is the
 * boundary between the two.
 */
export async function runSourceSync(service: Service): Promise<SourceSyncOutcome> {
  const state = await syncIntegration(service);

  if (state.error || !state.data) {
    return { ok: false, eventsCreated: 0, error: state.error ?? "The sync did not complete." };
  }

  return { ok: true, eventsCreated: state.data.result?.eventsCreated ?? 0 };
}
