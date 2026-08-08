"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";
import { BrandIcon } from "@/features/integrations/icons";
import type { SourceDef } from "@/features/wave-one/design-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { runSourceSync } from "@/app/setup/sync/actions";
import {
  completionHeadline,
  completionSummary,
  isSettled,
  overallPercent,
  readyCount,
  stageLine,
  totalEvents,
} from "@/features/setup/sync-progress";
import type { SourceSyncStatus } from "@/features/setup/sync-progress";
import { cn } from "@/lib/utils";

/**
 * Every source syncs at once and reports on its own. The gateway answers a
 * single request per service today, so progress is per-source rather than
 * streamed — a source is queued, reading, then done or failed. When the
 * backend grows an SSE endpoint this component is where it plugs in.
 */
export function SyncRunner({ sources }: { sources: SourceDef[] }) {
  const [statuses, setStatuses] = useState<SourceSyncStatus[]>(() =>
    sources.map((source) => ({ service: source.id, name: source.name, state: "queued", eventsCreated: 0 })),
  );
  const started = useRef(false);

  function update(service: string, patch: Partial<SourceSyncStatus>) {
    setStatuses((current) =>
      current.map((status) => (status.service === service ? { ...status, ...patch } : status)),
    );
  }

  async function run(service: SourceDef["id"]) {
    update(service, { state: "reading", error: undefined });

    try {
      const outcome = await runSourceSync(service);
      if (!outcome.ok) {
        update(service, { state: "failed", error: outcome.error });
        return;
      }

      update(service, { state: "done", eventsCreated: outcome.eventsCreated });
    } catch {
      update(service, { state: "failed", error: "The sync could not be reached." });
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Fired together, settled independently: a slow source never holds up a
    // fast one, and a failing source never holds up either.
    void Promise.allSettled(sources.map((source) => run(source.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const percent = overallPercent(statuses);
  const settled = isSettled(statuses);
  const ready = readyCount(statuses);
  const events = totalEvents(statuses);

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.03em]">
            {settled ? completionHeadline(statuses) : "Reading your work"}
          </h1>
          <p className="mt-3 text-[15px] leading-normal text-[#9AA4BA]">
            {settled
              ? "Every source that finished now speaks the same language. From here, nothing is a GitHub thing or a Slack thing — it is a work event."
              : `Pulling 30 days from ${sources.length} ${sources.length === 1 ? "source" : "sources"} in parallel, then translating each item into a work event.`}
          </p>
        </div>
        <span className="font-mono text-sm text-[#E9EDF7]">{percent}%</span>
      </div>

      <div
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        className="mt-6 h-1 overflow-hidden rounded-full bg-[#212938]"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-[var(--standup-accent)] transition-[width] duration-500 ease-[cubic-bezier(.4,0,.2,1)]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p aria-live="polite" className="mt-3 text-[12.5px] text-[#8C96AD]">
        {settled ? "Ranking your first morning" : stageLine(percent)}
      </p>

      <Card className="mt-6 overflow-hidden border-[#212938]">
        {statuses.map((status) => {
          const source = sources.find((item) => item.id === status.service);
          return (
            <div key={status.service} className="border-b border-[#161C2B] p-4 last:border-b-0">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-md bg-[#1A2130]",
                      status.state === "done"
                        ? "text-[var(--standup-accent-text)]"
                        : status.state === "failed"
                          ? "text-[#FF8FA6]"
                          : "text-[#9AA4BA]",
                    )}
                  >
                    <BrandIcon service={status.service} size={16} />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{status.name}</p>
                    <p className="text-[12px] text-[#79839B]">
                      {status.state === "failed"
                        ? status.error
                        : status.eventsCreated > 0
                          ? `${status.eventsCreated.toLocaleString("en-US")} events`
                          : `${source?.count ?? 0} ${source?.resLabel.toLowerCase() ?? "resources"}`}
                    </p>
                  </div>
                </div>
                {status.state === "failed" ? (
                  <button
                    className="flex items-center gap-1.5 rounded-full border border-[#3A2130] bg-[#22141C] px-2.5 py-1 font-mono text-[11px] text-[#FF8FA6] hover:border-[#39435A]"
                    onClick={() => void run(status.service)}
                    type="button"
                  >
                    <RotateCw className="h-3 w-3" />
                    retry
                  </button>
                ) : (
                  <span
                    className={cn(
                      "font-mono text-[11px]",
                      status.state === "done" ? "text-[var(--standup-accent-text)]" : "text-[#79839B]",
                    )}
                  >
                    {status.state}
                  </span>
                )}
              </div>
              <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-[#212938]">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500 ease-[cubic-bezier(.4,0,.2,1)]",
                    status.state === "failed" ? "bg-[#FF6B8A]" : "bg-[var(--standup-accent)]",
                  )}
                  style={{
                    width: status.state === "done" || status.state === "failed" ? "100%" : status.state === "reading" ? "55%" : "0%",
                  }}
                />
              </div>
            </div>
          );
        })}
        <div className="bg-[#0F1421] p-4">
          <p className="text-[12.5px] text-[#9AA4BA]">
            {settled ? "Ranked" : "Normalizing"} ·{" "}
            <span className="font-mono font-medium text-[#E9EDF7]">
              {events.toLocaleString("en-US")} work events
            </span>
          </p>
        </div>
      </Card>

      {settled ? (
        <Card
          className={cn(
            "mt-5 p-5",
            ready === statuses.length ? "border-[var(--standup-accent-border)] bg-[#1A2130]" : "border-[#3A3220] bg-[#231D12]",
          )}
        >
          <h2 className="text-sm font-semibold">
            {ready === statuses.length ? "Your morning is ready" : "Open with what finished"}
          </h2>
          <p className="mt-2 text-[13px] leading-normal text-[#9AA4BA]">
            {completionSummary(statuses)}{" "}
            {ready < statuses.length
              ? "The sources that failed can be retried above, or later from Settings — the queue works without them."
              : ""}
          </p>
          <Button asChild className="mt-5">
            <Link href="/today">{ready === statuses.length ? "Open Standup" : "Open anyway"}</Link>
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
