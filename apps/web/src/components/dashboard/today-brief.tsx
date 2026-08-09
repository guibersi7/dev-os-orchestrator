import Link from "next/link";
import type { DashboardNarrative } from "@/lib/dashboard/narrative";
import { cn } from "@/lib/utils";

export function TodayBrief({
  workspaceName,
  syncLabel,
  syncTone,
  narrative,
  viewerResolved,
}: {
  workspaceName: string;
  syncLabel: string;
  syncTone: "green" | "amber" | "red";
  narrative: DashboardNarrative;
  viewerResolved: boolean;
}) {
  const dot =
    syncTone === "green" ? "bg-[var(--standup-accent)]" : syncTone === "amber" ? "bg-[#D9B871]" : "bg-[#FF6B8A]";
  const label =
    syncTone === "green"
      ? "text-[var(--standup-accent-text)]"
      : syncTone === "amber"
        ? "text-[#D9B871]"
        : "text-[#FF8FA6]";

  return (
    <header>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[24px] font-semibold leading-[1.25] tracking-[-0.028em]">{workspaceName}</h1>
        <span className="flex items-center gap-2">
          <span className={cn("h-1.5 w-1.5 rounded-full", dot, syncTone === "green" && "animate-pulse")} />
          <span className={cn("font-mono text-[11.5px]", label)}>{syncLabel}</span>
        </span>
      </div>

      <p className="text-balance mt-5 max-w-[850px] text-[26px] font-semibold leading-[1.18] tracking-[-0.03em]">
        {narrative.lead}
        <span className="text-[#79839B]">{narrative.tail}</span>
      </p>

      {!viewerResolved ? (
        <p className="mt-3 text-[12.5px] leading-[1.45] text-[#D9B871]">
          Standup não reconheceu você nas fontes conectadas — mostrando o workspace inteiro.
        </p>
      ) : null}

      <p className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] leading-[1.6] text-[#8C96AD]">
        {narrative.metrics.map((metric, index) => {
          const body = (
            <>
              <span className="font-mono font-medium text-[var(--standup-accent-text)]">{metric.value}</span>{" "}
              {metric.noun} <span className="text-[#79839B]">{metric.consequence}</span>
            </>
          );

          return (
            <span key={metric.id} className="flex items-baseline gap-2">
              {metric.href ? (
                <Link
                  className="underline decoration-[#2E3849] decoration-1 underline-offset-4 hover:decoration-[#39435A]"
                  href={metric.href}
                >
                  {body}
                </Link>
              ) : (
                <span>{body}</span>
              )}
              {index < narrative.metrics.length - 1 ? <span className="text-[#4A5468]">·</span> : null}
            </span>
          );
        })}
      </p>
    </header>
  );
}
