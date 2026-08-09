import type { DashboardPayload } from "@/lib/api-client";
import { metadataMetrics, metadataNumber } from "@/lib/work-event";
import type { WorkEvent } from "@/lib/work-event";

/**
 * The weekly summary leads with a cause, not a scoreboard. Only the statistic
 * that explains the week is colored; the rest are context.
 */
export type WeeklyStat = {
  label: string;
  value: string;
  /** True for the single number that carries the explanation. */
  highlighted: boolean;
  note?: string;
};

export type WeeklyView = {
  synthesis: string;
  stats: WeeklyStat[];
  shipped: string[];
  slipped: { title: string; why: string }[];
};

function averageHours(events: WorkEvent[], key: string): number | null {
  const values = events
    .map((event) => metadataNumber(metadataMetrics(event.metadata), key))
    .filter((value): value is number => value !== undefined && value > 0);

  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function buildWeeklyView(dashboard: DashboardPayload, events: WorkEvent[]): WeeklyView {
  const merged = dashboard.weeklySummary.mergedPrs.length;
  const closed = dashboard.weeklySummary.closedIssues.length;
  const blockers = dashboard.weeklySummary.blockers.length;

  const reviewLatency = averageHours(events, "timeToFirstReviewHours");
  const leadTime = averageHours(events, "leadTimeHours");

  // Review latency is the number most likely to explain a slow week, so it is
  // the one that gets highlighted — but only when there is data behind it.
  const latencyIsCause = reviewLatency !== null && reviewLatency >= 8;

  const stats: WeeklyStat[] = [
    { label: "PRs merged", value: String(merged), highlighted: false },
    { label: "Issues fechadas", value: String(closed), highlighted: false },
  ];

  if (reviewLatency !== null) {
    stats.push({
      label: "Latência de review",
      value: `${Math.round(reviewLatency)}h`,
      highlighted: latencyIsCause,
      note: latencyIsCause ? "média até a primeira review" : undefined,
    });
  }

  if (leadTime !== null) {
    stats.push({ label: "Lead time", value: `${Math.round(leadTime)}h`, highlighted: false });
  }

  let synthesis: string;
  if (events.length === 0) {
    synthesis = "Nenhum evento chegou nesta semana, então não há o que resumir.";
  } else if (latencyIsCause) {
    synthesis = `O gargalo não foi capacidade — foi latência de review: em média ${Math.round(reviewLatency)}h até alguém olhar cada PR.`;
  } else if (blockers > 0) {
    synthesis = `${blockers === 1 ? "Um bloqueio atravessou" : `${blockers} bloqueios atravessaram`} a semana e ${blockers === 1 ? "segurou" : "seguraram"} trabalho de outras pessoas.`;
  } else {
    synthesis = `${merged} ${merged === 1 ? "PR foi integrada" : "PRs foram integradas"} sem que nada ficasse parado esperando review.`;
  }

  return {
    synthesis,
    stats,
    shipped: dashboard.weeklySummary.completedWork,
    slipped: dashboard.weeklySummary.blockers.map((event) => ({
      title: event.title,
      why: event.summary || "Sem causa registrada na última sync.",
    })),
  };
}
