import Link from "next/link";
import { Card } from "@/components/ui/card";
import { QueueRow } from "@/components/dashboard/queue-row";
import type { QueueItem } from "@/lib/queue/build";
import type { Lane } from "@/lib/queue/lane";
import { cn } from "@/lib/utils";

export type LaneFilter = Lane | "all";

const FILTERS: { id: LaneFilter; label: string }[] = [
  { id: "all", label: "Tudo" },
  { id: "action", label: "Ação" },
  { id: "waiting", label: "Esperando" },
  { id: "blocked", label: "Bloqueado" },
];

/**
 * The list arrives ranked by urgency and lanes interleave — it is never grouped
 * and never carries section dividers. The lane lives in the row chip only.
 */
export function ActionQueue({
  items,
  all,
  active,
  trailingNote,
}: {
  items: QueueItem[];
  all: QueueItem[];
  active: LaneFilter;
  trailingNote: string;
}) {
  const counts: Record<LaneFilter, number> = {
    all: all.length,
    action: all.filter((item) => item.lane === "action").length,
    waiting: all.filter((item) => item.lane === "waiting").length,
    blocked: all.filter((item) => item.lane === "blocked").length,
  };

  return (
    <Card className="overflow-hidden border-[#212938] p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1B2230] px-[18px] py-4">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em]">Fila de foco</h2>
        <span className="font-mono text-[11px] text-[#79839B]">
          {items.length === all.length ? `${all.length} itens` : `${items.length} de ${all.length}`}
        </span>
      </div>

      <nav aria-label="Filtrar a fila" className="flex flex-wrap gap-2 border-b border-[#1B2230] px-[18px] py-3">
        {FILTERS.map((filter) => {
          const isActive = filter.id === active;
          return (
            <Link
              key={filter.id}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1 text-[12.5px] transition-colors",
                isActive
                  ? "border-[#39435A] bg-[#1A2130] text-[#E9EDF7]"
                  : "border-[#212938] bg-transparent text-[#8C96AD] hover:border-[#39435A]",
              )}
              href={filter.id === "all" ? "?" : `?lane=${filter.id}`}
            >
              {filter.label}
              <span className={cn("font-mono text-[11px]", isActive ? "text-[#9AA4BA]" : "text-[#79839B]")}>
                {counts[filter.id]}
              </span>
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <div className="px-[18px] py-6">
          <p className="text-[13.5px] font-medium">
            {all.length === 0 ? "Nada exige sua ação agora." : "Nenhum item nesta faixa."}
          </p>
          {all.length > 0 ? (
            <Link
              className="mt-2 inline-block text-[12.5px] text-[var(--standup-accent-text)] hover:text-[#7FE3A8]"
              href="?"
            >
              Ver a fila completa ({all.length})
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="divide-y divide-[#161C2B]">
          {items.map((item) => (
            <QueueRow key={item.id} item={item} />
          ))}
        </div>
      )}

      {trailingNote ? (
        <p className="border-t border-[#1B2230] bg-[#0F1421] px-[18px] py-3 text-[12.5px] text-[#8C96AD]">
          {trailingNote}
        </p>
      ) : null}
    </Card>
  );
}
