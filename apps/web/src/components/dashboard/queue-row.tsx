import { BrandIcon } from "@/features/integrations/icons";
import type { QueueItem } from "@/lib/queue/build";
import type { Lane } from "@/lib/queue/lane";
import { cn } from "@/lib/utils";

const LANE_STYLE: Record<Lane, { label: string; className: string }> = {
  action: {
    label: "ação",
    className: "text-[var(--standup-accent-text)] bg-[var(--standup-accent-surface)] border-[#1C4A31]",
  },
  waiting: { label: "esperando", className: "text-[#79839B] bg-[#161C2B] border-[#212938]" },
  blocked: { label: "bloqueado", className: "text-[#FF8FA6] bg-[#22141C] border-[#3A2130]" },
};

export function QueueRow({ item }: { item: QueueItem }) {
  const lane = LANE_STYLE[item.lane];
  // The priority bar is the only row emphasis on this screen, so it stays rare.
  const accent =
    item.priority === "high" ? (item.lane === "blocked" ? "border-l-[#FF6B8A]" : "border-l-[var(--standup-accent)]") : "border-l-transparent";

  return (
    <article
      className={cn(
        "grid gap-3 border-l-2 px-[18px] py-4 transition-colors hover:bg-[#141B2A] sm:grid-cols-[1fr_auto] sm:items-center sm:gap-5",
        accent,
      )}
    >
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-[5px] border px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.03em]",
              lane.className,
            )}
          >
            {lane.label}
          </span>
          <span className={cn(item.lane === "blocked" ? "text-[#8C96AD]" : "text-[#9AA4BA]")}>
            <BrandIcon service={item.service} size={13} />
          </span>
          <span className="font-mono truncate text-[11px] text-[#79839B]">{item.source}</span>
          <span className="font-mono text-[11px] text-[#79839B]">· {item.age}</span>
        </div>
        <h3 className="truncate text-[14px] font-medium tracking-[-0.011em]">{item.title}</h3>
        <p className="mt-1 line-clamp-2 text-[12.5px] leading-[1.45] text-[#8C96AD]">{item.reason}</p>
      </div>

      <a
        className={cn(
          "inline-flex h-8 shrink-0 items-center justify-center rounded-[7px] border px-[13px] text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(29,156,76,.32)] sm:w-auto",
          item.action.primary
            ? "border-[var(--standup-accent)] bg-[var(--standup-accent)] text-[#F4F7FF] hover:bg-[var(--standup-accent-hover)]"
            : "border-[#2E3849] bg-transparent text-[#9AA4BA] hover:border-[#39435A]",
        )}
        href={item.action.href}
      >
        {item.action.label}
      </a>
    </article>
  );
}
