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

export type ChangedFile = {
  filename: string;
  status: string;
  changes: number;
  /** Files that carry logic, as opposed to docs, lockfiles and fixtures. */
  carriesLogic: boolean;
};

export type ReviewComment = {
  author: string;
  body: string;
  path?: string;
  url?: string;
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
  /** Only the files that carry logic; the rest are counted in `omissions`. */
  changedFiles: ChangedFile[];
  totalFiles: number;
  /** The comments worth reading, not all of them. */
  comments: ReviewComment[];
  totalComments: number;
  /** Facts the briefing deliberately left out, stated out loud. */
  omissions: string[];
  externalUrl?: string;
};

const NON_LOGIC = /\.(md|mdx|txt|lock|snap|svg|png|jpg|jpeg|gif|ico|csv|ya?ml|json)$|^(docs|fixtures|testdata)\//i;

export function carriesLogic(filename: string): boolean {
  return !NON_LOGIC.test(filename);
}

function toChangedFiles(metadata: Record<string, unknown>): ChangedFile[] {
  const raw = Array.isArray(metadata.files) ? metadata.files : [];

  return raw
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .map((entry) => {
      const filename = typeof entry.filename === "string" ? entry.filename : "";
      return {
        filename,
        status: typeof entry.status === "string" ? entry.status : "modified",
        changes: typeof entry.changes === "number" ? entry.changes : 0,
        carriesLogic: carriesLogic(filename),
      };
    })
    .filter((file) => file.filename.length > 0);
}

/**
 * A blocking comment or a decision is what the reader needs; a nit is not.
 * Length is the only signal available, so it stands in for substance — and the
 * count of what was dropped is always stated.
 */
function toComments(metadata: Record<string, unknown>): ReviewComment[] {
  const raw = Array.isArray(metadata.comments) ? metadata.comments : [];

  return raw
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .map((entry) => ({
      author: typeof entry.author === "string" ? entry.author : "",
      body: typeof entry.body === "string" ? entry.body.trim() : "",
      path: typeof entry.path === "string" ? entry.path : undefined,
      url: typeof entry.url === "string" ? entry.url : undefined,
    }))
    .filter((comment) => comment.body.length > 0);
}

function substantial(comments: ReviewComment[]): ReviewComment[] {
  return [...comments].sort((a, b) => b.body.length - a.body.length).slice(0, 3);
}

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

  const allFiles = toChangedFiles(subject.metadata);
  const logicFiles = allFiles.filter((file) => file.carriesLogic);
  const totalFiles = metadataNumber(metrics, "fileCount") ?? allFiles.length;

  const allComments = toComments(subject.metadata);
  const shownComments = substantial(allComments);
  const totalComments = metadataNumber(metrics, "reviewCommentCount") ?? allComments.length;

  // Stating what was hidden is a feature; silently truncating is not.
  const omissions: string[] = [];

  const skippedFiles = totalFiles - logicFiles.length;
  if (logicFiles.length > 0 && skippedFiles > 0) {
    omissions.push(
      `${skippedFiles} ${skippedFiles === 1 ? "arquivo sem lógica foi omitido" : "arquivos sem lógica foram omitidos"} — docs, fixtures e assets.`,
    );
  }

  const skippedComments = totalComments - shownComments.length;
  if (skippedComments > 0) {
    omissions.push(
      `${skippedComments} ${skippedComments === 1 ? "comentário mais curto foi omitido" : "comentários mais curtos foram omitidos"}.`,
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
    changedFiles: logicFiles,
    totalFiles,
    comments: shownComments,
    totalComments,
    omissions,
    externalUrl: subject.externalUrl,
  };
}
