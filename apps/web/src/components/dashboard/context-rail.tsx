import Link from "next/link";
import { BrandIcon } from "@/features/integrations/icons";
import { Card } from "@/components/ui/card";
import { Timeline } from "@/components/workspace/timeline";
import type { SignalGroup, SourceRow } from "@/lib/dashboard/rail";
import type { WorkEvent as GatewayWorkEvent } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export function SignalBoard({ groups }: { groups: SignalGroup[] }) {
  return (
    <Card className="border-[#212938] p-[18px]">
      <h2 className="text-[13.5px] font-semibold">Sinal recente</h2>
      {groups.length === 0 ? (
        <p className="mt-2 text-[12.5px] leading-[1.45] text-[#8C96AD]">
          Nenhum evento fora da fila na última sync.
        </p>
      ) : null}
      <div className="mt-3 space-y-4">
        {groups.map((group) => (
          <div key={group.service}>
            <Link
              className="flex items-center gap-2 text-[#9AA4BA] transition-colors hover:text-[#E9EDF7]"
              href={group.href}
            >
              <BrandIcon service={group.service} size={13} />
              <span className="text-[12.5px] font-medium">{group.name}</span>
              <span className="font-mono text-[11px] text-[#79839B]">{group.count}</span>
            </Link>
            <ul className="mt-2 space-y-2">
              {group.items.map((item) => {
                const body = (
                  <>
                    <span className={cn("block text-[12.5px]", item.href ? "text-[#9AA4BA]" : "text-[#79839B]")}>
                      {item.title}
                    </span>
                    <span className="mt-0.5 flex items-baseline gap-2">
                      <span className="line-clamp-1 text-[11.5px] text-[#79839B]">{item.summary}</span>
                      <span className="font-mono shrink-0 text-[11px] text-[#79839B]">{item.age}</span>
                    </span>
                  </>
                );

                return (
                  <li key={item.id}>
                    {/* Items without a link are plain text — no cursor, no hover. */}
                    {item.href ? (
                      <a className="block transition-colors hover:text-[#E9EDF7]" href={item.href}>
                        {body}
                      </a>
                    ) : (
                      <span className="block">{body}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function WeeklyProgress({
  mergedPrs,
  closedIssues,
  decisions,
  activeWork,
  risks,
}: {
  mergedPrs: number;
  closedIssues: number;
  decisions: number;
  activeWork: number;
  risks: string[];
}) {
  const stats = [
    { value: mergedPrs, label: "PRs merged" },
    { value: closedIssues, label: "issues fechadas" },
    { value: decisions, label: "decisões" },
  ];

  return (
    <Card className="border-[#212938] p-[18px]">
      <h2 className="text-[13.5px] font-semibold">Semana</h2>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div key={stat.label}>
            <p className="font-mono text-[20px] font-medium leading-none">{stat.value}</p>
            <p className="mt-1.5 text-[11.5px] leading-[1.35] text-[#79839B]">{stat.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-[#1B2230] pt-3 text-[12.5px] text-[#8C96AD]">
        {activeWork} {activeWork === 1 ? "item ativo" : "itens ativos"}
      </p>
      <div className="mt-3 space-y-2">
        {risks.length === 0 ? (
          <p className="text-[12.5px] leading-[1.45] text-[#8C96AD]">
            Nenhum risco de alta prioridade na última sync.
          </p>
        ) : null}
        {risks.map((risk) => (
          <p key={risk} className="border-l-2 border-[#3A3220] pl-3 text-[12.5px] leading-[1.45] text-[#D9B871]">
            {risk}
          </p>
        ))}
      </div>
    </Card>
  );
}

export function SourceSignalList({ rows, connected }: { rows: SourceRow[]; connected: number }) {
  return (
    <Card className="border-[#212938] p-[18px]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13.5px] font-semibold">Fontes</h2>
        <span className="font-mono text-[11px] text-[#79839B]">{connected} de 7</span>
      </div>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li key={row.service}>
            <Link className="flex items-center justify-between gap-3 py-0.5" href={row.href}>
              <span className="flex items-center gap-2">
                <span className={row.connected ? "text-[#9AA4BA]" : "text-[#4A5468]"}>
                  <BrandIcon service={row.service} size={13} />
                </span>
                <span className={cn("text-[12.5px]", row.connected ? "text-[#E9EDF7]" : "text-[#79839B]")}>
                  {row.name}
                </span>
              </span>
              <span
                className={cn(
                  "font-mono text-[11px]",
                  row.connected ? "text-[#79839B]" : "text-[var(--standup-accent-text)]",
                )}
              >
                {row.meta}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function AllActivity({ events }: { events: GatewayWorkEvent[] }) {
  return (
    // Timeline brings its own card surface, so this wrapper stays unstyled to
    // avoid nesting one card inside another.
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[13px] border border-[#212938] bg-[#121826] px-[18px] py-4 text-[13.5px] font-semibold marker:hidden group-open:mb-3 hover:border-[#39435A]">
        Toda a atividade
        <span className="font-mono text-[11px] text-[#79839B]">{events.length}</span>
      </summary>
      <Timeline events={events} />
    </details>
  );
}
