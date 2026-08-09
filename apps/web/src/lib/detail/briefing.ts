import { ageInHours, formatAge, metadataMetrics, metadataNumber, metadataString } from "@/lib/work-event";
import type { WorkEvent } from "@/lib/work-event";
import { laneFor } from "@/lib/queue/lane";
import type { Lane, ViewerPredicate } from "@/lib/queue/lane";

/**
 * Standup is not a clone of the source tool — it is a briefing about it. The
 * detail screens answer why something matters, who is behind it and what it
 * unblocks, then hand the user off through a button.
 *
 * Everything here is derived from events the connectors actually sent. Where a
 * fact is not available, the briefing says so rather than filling the gap.
 */
export type WaitingParty = {
  name: string;
  since: string;
};

export type Briefing = {
  subject: WorkEvent;
  lane: Lane;
  /** One sentence: the verdict, in past-tense facts. */
  verdict: string;
  /** Every event Standup holds about the same external item, newest first. */
  history: WorkEvent[];
  waitingOn: WaitingParty[];
  checks: { name: string; conclusion: string; age: string }[];
  metrics: { label: string; value: string }[];
  /** Facts the connector does not currently supply, stated out loud. */
  omissions: string[];
  externalUrl?: string;
};

/** Events about the same PR, issue or card, regardless of which event type produced them. */
export function relatedEvents(events: WorkEvent[], subject: WorkEvent): WorkEvent[] {
  const repository = metadataString(subject.metadata, "repository");
  const number = metadataNumber(subject.metadata, "number") ?? metadataNumber(subject.metadata, "pullNumber");

  return events
    .filter((event) => {
      if (event.id === subject.id) return true;
      if (event.service !== subject.service) return false;
      if (metadataString(event.metadata, "repository") !== repository) return false;

      const candidate = metadataNumber(event.metadata, "number") ?? metadataNumber(event.metadata, "pullNumber");
      return candidate !== undefined && candidate === number;
    })
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}

function toStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function buildVerdict(subject: WorkEvent, history: WorkEvent[], lane: Lane, now: number): string {
  const age = formatAge(subject.occurredAt, now);
  const failed = history.find((event) => event.type === "check.failed");

  if (failed) {
    const name = metadataString(failed.metadata, "checkName");
    return name
      ? `${name} falhou há ${formatAge(failed.occurredAt, now)} e o merge não avança até passar.`
      : `Um check falhou há ${formatAge(failed.occurredAt, now)} e o merge não avança até passar.`;
  }

  const metrics = metadataMetrics(subject.metadata);
  const reviewCount = metadataNumber(metrics, "reviewCount") ?? 0;

  if (lane === "waiting") {
    return `Aberto há ${age}. Nada a fazer aqui até outra pessoa responder.`;
  }

  if (reviewCount === 0) {
    return `Aberto há ${age} e ninguém revisou até agora.`;
  }

  return `Aberto há ${age}, com ${reviewCount} ${reviewCount === 1 ? "review" : "reviews"} registradas.`;
}

function buildMetrics(subject: WorkEvent): { label: string; value: string }[] {
  const metrics = metadataMetrics(subject.metadata);
  const out: { label: string; value: string }[] = [];

  const timeToFirstReview = metadataNumber(metrics, "timeToFirstReviewHours");
  if (timeToFirstReview !== undefined && timeToFirstReview > 0) {
    out.push({ label: "Até a primeira review", value: `${Math.round(timeToFirstReview)}h` });
  }

  const leadTime = metadataNumber(metrics, "leadTimeHours");
  if (leadTime !== undefined && leadTime > 0) {
    out.push({ label: "Lead time", value: `${Math.round(leadTime)}h` });
  }

  const reviewComments = metadataNumber(metrics, "reviewCommentCount");
  if (reviewComments !== undefined) {
    out.push({ label: "Comentários de review", value: String(reviewComments) });
  }

  const state = metadataString(subject.metadata, "state");
  if (state) {
    out.push({ label: "Estado", value: state });
  }

  return out;
}

export function buildBriefing(
  events: WorkEvent[],
  subject: WorkEvent,
  options: { isViewer?: ViewerPredicate; now?: number } = {},
): Briefing {
  const { isViewer, now = Date.now() } = options;
  const history = relatedEvents(events, subject);
  const lane = laneFor(subject, isViewer);
  const metrics = metadataMetrics(subject.metadata);

  const waitingOn = toStringList(metrics.reviewers).map((reviewer) => ({
    name: reviewer,
    since: formatAge(subject.occurredAt, now),
  }));

  const checks = history
    .filter((event) => event.type === "check.failed")
    .map((event) => ({
      name: metadataString(event.metadata, "checkName") ?? "Check",
      conclusion: metadataString(event.metadata, "conclusion") ?? "failure",
      age: formatAge(event.occurredAt, now),
    }));

  const omissions: string[] = [];
  const reviewComments = metadataNumber(metrics, "reviewCommentCount") ?? 0;
  if (reviewComments > 0) {
    // Stating what was hidden is a feature; silently truncating is not.
    omissions.push(
      `${reviewComments} ${reviewComments === 1 ? "comentário de review foi contado" : "comentários de review foram contados"}, mas o conteúdo não é sincronizado.`,
    );
  }

  if (ageInHours(subject.occurredAt, now) >= 24 && waitingOn.length === 0) {
    omissions.push("Nenhum revisor foi designado, então não há quem cobrar.");
  }

  return {
    subject,
    lane,
    verdict: buildVerdict(subject, history, lane, now),
    history,
    waitingOn,
    checks,
    metrics: buildMetrics(subject),
    omissions,
    externalUrl: subject.externalUrl,
  };
}
