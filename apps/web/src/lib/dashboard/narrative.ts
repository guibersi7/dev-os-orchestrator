import type { DashboardPayload } from "@/lib/api-client";
import type { QueueItem } from "@/lib/queue/build";
import { pluralize } from "@/lib/plural";
import type { PluralPair } from "@/lib/plural";

/**
 * The headline is the largest text on screen and the only place the product
 * speaks in full sentences. It is assembled from counts the payload actually
 * carries — never a guess, never a confidence score — and it ends in a
 * recommendation drawn from the top of the queue.
 */
export type BriefMetric = {
  id: string;
  value: string;
  noun: string;
  consequence: string;
  href?: string;
};

export type DashboardNarrative = {
  /** First half, in primary ink. */
  lead: string;
  /** Second half, in text-4. */
  tail: string;
  metrics: BriefMetric[];
};

const BLOCKERS: PluralPair = {
  one: ["bloqueador", "travando outra pessoa"],
  many: ["bloqueadores", "travando outra pessoa"],
};

const REVIEWS: PluralPair = {
  one: ["review", "esperando você"],
  many: ["reviews", "esperando você"],
};

const WAITING: PluralPair = {
  one: ["item", "esperando outra pessoa"],
  many: ["itens", "esperando outra pessoa"],
};

function laneHref(lane: string): string {
  return `?lane=${lane}`;
}

export function buildDashboardNarrative(
  dashboard: DashboardPayload,
  queue: QueueItem[],
  options: { viewerResolved: boolean } = { viewerResolved: false },
): DashboardNarrative {
  const blocked = queue.filter((item) => item.lane === "blocked");
  const action = queue.filter((item) => item.lane === "action");
  const waiting = queue.filter((item) => item.lane === "waiting");

  const metrics: BriefMetric[] = [];

  // Zero-count metrics are removed entirely: never "0 bloqueadores", never a
  // link into an empty lane.
  if (blocked.length > 0) {
    const phrase = pluralize(blocked.length, BLOCKERS);
    metrics.push({
      id: "blocked",
      value: String(blocked.length),
      noun: phrase.noun,
      consequence: phrase.consequence,
      href: laneHref("blocked"),
    });
  }

  if (action.length > 0) {
    const phrase = pluralize(action.length, REVIEWS);
    metrics.push({
      id: "action",
      value: String(action.length),
      noun: phrase.noun,
      consequence: phrase.consequence,
      href: laneHref("action"),
    });
  }

  if (waiting.length > 0) {
    const phrase = pluralize(waiting.length, WAITING);
    metrics.push({
      id: "waiting",
      value: String(waiting.length),
      noun: phrase.noun,
      consequence: phrase.consequence,
      href: laneHref("waiting"),
    });
  }

  const connected = dashboard.sourceHealth.filter((source) => source.status === "connected").length;
  metrics.push({
    id: "sources",
    value: `${connected}/7`,
    noun: "fontes",
    consequence: "conectadas",
  });

  if (queue.length === 0) {
    return {
      lead: options.viewerResolved ? "Nada exige sua ação agora." : "Nada exige ação agora.",
      tail:
        dashboard.events.length > 0
          ? `${dashboard.events.length} ${dashboard.events.length === 1 ? "evento chegou" : "eventos chegaram"} na última sync, e nenhum deles espera por alguém.`
          : "Nenhum evento chegou na última sync.",
      metrics,
    };
  }

  const top = queue[0];
  const lead =
    blocked.length > 0
      ? `${blocked.length === 1 ? "Um trabalho está parado" : `${blocked.length} trabalhos estão parados`} e ${action.length > 0 ? `${action.length === 1 ? "outro item precisa" : `outros ${action.length} itens precisam`} de você` : "ninguém mais está esperando"}. `
      : `${action.length === 1 ? "Um item precisa" : `${action.length} itens precisam`} de você agora. `;

  return {
    lead,
    tail: `Comece por ${top.title}.`,
    metrics,
  };
}
