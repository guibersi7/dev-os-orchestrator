import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BrandIcon } from "@/features/integrations/icons";
import { Card } from "@/components/ui/card";
import type { Briefing } from "@/lib/detail/briefing";
import { formatAge } from "@/lib/work-event";
import { cn } from "@/lib/utils";

const LANE_STYLE = {
  action: { label: "ação", className: "text-[var(--standup-accent-text)] bg-[var(--standup-accent-surface)] border-[#1C4A31]" },
  waiting: { label: "esperando", className: "text-[#79839B] bg-[#161C2B] border-[#212938]" },
  blocked: { label: "bloqueado", className: "text-[#FF8FA6] bg-[#22141C] border-[#3A2130]" },
};

export function BriefingView({
  briefing,
  openLabel,
  backHref,
}: {
  briefing: Briefing;
  openLabel: string;
  backHref: string;
}) {
  const lane = LANE_STYLE[briefing.lane];
  const { subject } = briefing;

  return (
    <div className="mx-auto min-w-0 max-w-[1180px] px-5 pb-[72px] pt-[26px]">
      <Link className="font-mono text-[11px] text-[#79839B] hover:text-[#9AA4BA]" href={backHref}>
        ← voltar para a fila
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-[5px] border px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.03em]",
            lane.className,
          )}
        >
          {lane.label}
        </span>
        <span className="text-[#9AA4BA]">
          <BrandIcon service={subject.service} size={13} />
        </span>
        <span className="font-mono text-[11px] text-[#79839B]">{subject.source}</span>
        <span className="font-mono text-[11px] text-[#79839B]">· {formatAge(subject.occurredAt)}</span>
      </div>

      <h1 className="text-balance mt-3 text-[24px] font-semibold leading-[1.25] tracking-[-0.028em]">
        {subject.title}
      </h1>
      <p className="mt-3 max-w-[720px] text-[15px] leading-[1.55] text-[#9AA4BA]">{briefing.verdict}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {briefing.externalUrl ? (
          <a
            className="inline-flex h-9 items-center gap-2 rounded-[9px] border border-[var(--standup-accent)] bg-[var(--standup-accent)] px-4 text-[13px] font-medium text-[#F4F7FF] hover:bg-[var(--standup-accent-hover)]"
            href={briefing.externalUrl}
          >
            {openLabel}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        ) : null}
        <Link
          className="inline-flex h-9 items-center rounded-[9px] border border-[#2E3849] px-4 text-[13px] font-medium text-[#9AA4BA] hover:border-[#39435A]"
          href={`/integrations/${subject.service}`}
        >
          Ver a fonte
        </Link>
      </div>

      <div className="mt-7 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {briefing.changedFiles.length > 0 ? (
            <Card className="border-[#212938] p-[18px]">
              <h2 className="text-[13.5px] font-semibold">O que mudou</h2>
              <p className="mt-1 text-[12.5px] leading-[1.45] text-[#8C96AD]">
                {briefing.changedFiles.length} de {briefing.totalFiles}{" "}
                {briefing.totalFiles === 1 ? "arquivo carrega" : "arquivos carregam"} lógica.
              </p>
              <ul className="mt-3 space-y-1.5">
                {briefing.changedFiles.map((file) => (
                  <li key={file.filename} className="flex items-baseline justify-between gap-3">
                    <span className="font-mono truncate text-[12px] text-[#E9EDF7]">{file.filename}</span>
                    <span className="font-mono shrink-0 text-[11px] text-[#79839B]">
                      {file.status} · {file.changes}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {briefing.comments.length > 0 ? (
            <Card className="border-[#212938] p-[18px]">
              <h2 className="text-[13.5px] font-semibold">A conversa que importa</h2>
              <p className="mt-1 text-[12.5px] leading-[1.45] text-[#8C96AD]">
                {briefing.comments.length} de {briefing.totalComments}{" "}
                {briefing.totalComments === 1 ? "comentário" : "comentários"}.
              </p>
              <ul className="mt-3 space-y-3">
                {briefing.comments.map((comment) => (
                  <li key={`${comment.author}-${comment.body.slice(0, 24)}`} className="border-l-2 border-[#212938] pl-3">
                    <p className="flex flex-wrap items-baseline gap-2">
                      <span className="text-[12.5px] font-medium text-[#E9EDF7]">{comment.author}</span>
                      {comment.path ? (
                        <span className="font-mono truncate text-[11px] text-[#79839B]">{comment.path}</span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-[13px] leading-[1.45] text-[#9AA4BA]">{comment.body}</p>
                    {comment.url ? (
                      <a className="mt-1 inline-block text-[11.5px] text-[var(--standup-accent-text)]" href={comment.url}>
                        ver no GitHub
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card className="border-[#212938] p-[18px]">
            <h2 className="text-[13.5px] font-semibold">O que Standup registrou</h2>
            <p className="mt-1 text-[12.5px] leading-[1.45] text-[#8C96AD]">
              {briefing.history.length === 1
                ? "Um evento sobre este item."
                : `${briefing.history.length} eventos sobre este item, do mais recente ao mais antigo.`}
            </p>
            <ol className="mt-4 space-y-3">
              {briefing.history.map((event) => (
                <li key={event.id} className="border-l-2 border-[#212938] pl-3">
                  <p className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-[11px] text-[#79839B]">{event.type}</span>
                    <span className="font-mono text-[11px] text-[#79839B]">· {formatAge(event.occurredAt)}</span>
                    <span className="font-mono text-[11px] text-[#79839B]">· {event.actor}</span>
                  </p>
                  <p className="mt-1 text-[13px] leading-[1.45] text-[#9AA4BA]">{event.summary || event.title}</p>
                </li>
              ))}
            </ol>
          </Card>

          {briefing.omissions.length > 0 ? (
            <Card className="border-[#1B2230] bg-[#0F1421] p-[18px]">
              <h2 className="text-[13.5px] font-semibold">O que não está aqui</h2>
              <ul className="mt-2 space-y-1.5">
                {briefing.omissions.map((omission) => (
                  <li key={omission} className="text-[12.5px] leading-[1.45] text-[#8C96AD]">
                    {omission}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="min-w-0 space-y-6">
          {briefing.checks.length > 0 ? (
            <Card className="border-[#3A2130] bg-[#121826] p-[18px]">
              <h2 className="text-[13.5px] font-semibold">Checks</h2>
              <ul className="mt-3 space-y-2">
                {briefing.checks.map((check) => (
                  <li key={`${check.name}-${check.age}`} className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[12.5px] text-[#FF8FA6]">{check.name}</span>
                    <span className="font-mono shrink-0 text-[11px] text-[#79839B]">
                      {check.conclusion} · {check.age}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card className="border-[#212938] p-[18px]">
            <h2 className="text-[13.5px] font-semibold">Quem está esperando</h2>
            {briefing.waitingOn.length === 0 ? (
              <p className="mt-2 text-[12.5px] leading-[1.45] text-[#8C96AD]">
                Nenhum revisor designado neste item.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {briefing.waitingOn.map((party) => (
                  <li key={party.name} className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[12.5px] text-[#E9EDF7]">{party.name}</span>
                    <span className="font-mono shrink-0 text-[11px] text-[#79839B]">há {party.since}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {briefing.metrics.length > 0 ? (
            <Card className="border-[#212938] p-[18px]">
              <h2 className="text-[13.5px] font-semibold">Números</h2>
              <dl className="mt-3 space-y-2">
                {briefing.metrics.map((metric) => (
                  <div key={metric.label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-[12.5px] text-[#8C96AD]">{metric.label}</dt>
                    <dd className="font-mono text-[12px] text-[#E9EDF7]">{metric.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
