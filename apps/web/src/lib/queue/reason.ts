import { ageInHours, formatAge, metadataMetrics, metadataNumber, metadataString } from "@/lib/work-event";
import type { WorkEvent } from "@/lib/work-event";

/**
 * `reason` is the product: one sentence, past-tense facts, naming who is waiting
 * and what sits downstream. Everything here is derived from data the connector
 * actually sent — nothing is guessed, and nothing claims to be an inference.
 */
export const REASON_MAX_LENGTH = 110;

/** Picks the richest sentence that still fits the line. Never truncates mid-word. */
export function fitReason(candidates: string[]): string {
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (trimmed.length > 0 && trimmed.length <= REASON_MAX_LENGTH) {
      return trimmed;
    }
  }

  return candidates[candidates.length - 1]?.trim() ?? "";
}

function agePhrase(event: WorkEvent, now: number): string {
  return `há ${formatAge(event.occurredAt, now)}`;
}

function githubReason(event: WorkEvent, now: number): string {
  const metrics = metadataMetrics(event.metadata);
  const reviewCount = metadataNumber(metrics, "reviewCount") ?? 0;
  const reviewerCount = metadataNumber(metrics, "reviewerCount") ?? 0;
  const age = agePhrase(event, now);

  if (event.type === "check.failed") {
    const checkName = metadataString(event.metadata, "checkName");
    const pullNumber = metadataNumber(event.metadata, "pullNumber");
    return fitReason([
      checkName && pullNumber
        ? `${checkName} falhou no PR #${pullNumber} ${age}. O merge não avança até passar.`
        : "",
      checkName ? `${checkName} falhou ${age}. O merge não avança até passar.` : "",
      `Um check falhou ${age}. O merge não avança até passar.`,
    ]);
  }

  if (event.type === "review.requested") {
    return fitReason([
      reviewCount === 0 && event.actor
        ? `${event.actor} pediu review ${age} e ninguém respondeu desde então.`
        : "",
      reviewCount === 0 ? `Review pedido ${age}, ainda sem resposta.` : "",
      `Review pedido ${age}. ${reviewCount} ${reviewCount === 1 ? "resposta" : "respostas"} até agora.`,
    ]);
  }

  if (event.type === "pull_request.opened") {
    return fitReason([
      reviewerCount === 0 && event.actor
        ? `Aberto por ${event.actor} ${age} e ainda sem revisor designado.`
        : "",
      reviewerCount === 0 ? `Aberto ${age} e ainda sem revisor designado.` : "",
      `Aberto ${age}, com ${reviewerCount} ${reviewerCount === 1 ? "revisor" : "revisores"}.`,
    ]);
  }

  if (event.type === "issue.assigned") {
    return fitReason([
      event.actor ? `Atribuída por ${event.actor} ${age}. Sem prazo declarado.` : "",
      `Atribuída ${age}. Sem prazo declarado.`,
    ]);
  }

  return "";
}

/**
 * Falls back to the connector's own summary rather than inventing a sentence.
 * A row that cannot say why it is on screen does not belong on screen, so an
 * empty reason is a signal to the caller to drop the item.
 */
export function buildReason(event: WorkEvent, now: number = Date.now()): string {
  const specific = event.service === "github" ? githubReason(event, now) : "";
  if (specific) {
    return specific;
  }

  const summary = event.summary.trim();
  if (!summary) {
    return "";
  }

  const age = agePhrase(event, now);
  const stale = ageInHours(event.occurredAt, now) >= 24;
  return fitReason([stale ? `${summary} Parado ${age}.` : summary, summary]);
}
