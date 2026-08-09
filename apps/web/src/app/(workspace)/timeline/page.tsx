import Link from "next/link";
import { BrandIcon } from "@/features/integrations/icons";
import { Card } from "@/components/ui/card";
import { getActiveWorkspaceId, getDashboardState } from "@/lib/api-client";
import type { Service } from "@/lib/api-client";
import { normalizeDashboardPayload } from "@/lib/dashboard-view-model";
import { normalizeWorkEvents } from "@/lib/work-event";
import { buildTimelineFilters, groupByDay } from "@/lib/detail/timeline";
import { cn } from "@/lib/utils";

const SERVICES: Service[] = ["github", "slack", "linear", "jira", "trello", "notion", "calendar"];

type TimelinePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TimelinePage({ searchParams }: TimelinePageProps) {
  const query = await searchParams;
  const raw = Array.isArray(query.source) ? query.source[0] : query.source;
  const active = SERVICES.includes(raw as Service) ? (raw as Service) : "all";

  const workspaceId = await getActiveWorkspaceId();
  const dashboardState = await getDashboardState(workspaceId);
  const dashboard = normalizeDashboardPayload(dashboardState.data?.dashboard);
  const events = normalizeWorkEvents(dashboard.events, workspaceId);

  const filters = buildTimelineFilters(events, active);
  const shown = active === "all" ? events : events.filter((event) => event.service === active);
  const days = groupByDay(shown);

  return (
    <div className="mx-auto min-w-0 max-w-[980px] px-5 pb-[72px] pt-[26px]">
      <h1 className="text-[24px] font-semibold leading-[1.25] tracking-[-0.028em]">Timeline</h1>
      <p className="mt-2 text-[13px] leading-[1.55] text-[#8C96AD]">
        O registro cru, sem ranking e sem interpretação. Tudo o que chegou, na ordem em que aconteceu.
      </p>

      <nav aria-label="Filtrar por fonte" className="mt-6 flex flex-wrap gap-2">
        {filters.map((filter) => (
          <Link
            key={filter.service}
            aria-current={filter.active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1 text-[12.5px] transition-colors",
              filter.active
                ? "border-[#39435A] bg-[#1A2130] text-[#E9EDF7]"
                : "border-[#212938] text-[#8C96AD] hover:border-[#39435A]",
            )}
            href={filter.href}
          >
            {filter.service !== "all" ? <BrandIcon service={filter.service} size={13} /> : null}
            {filter.label}
            <span className="font-mono text-[11px] text-[#79839B]">{filter.count}</span>
          </Link>
        ))}
      </nav>

      {days.length === 0 ? (
        <Card className="mt-6 border-[#212938] p-[18px]">
          <p className="text-[13.5px] font-medium">Nenhum evento nesta fonte.</p>
          <Link className="mt-2 inline-block text-[12.5px] text-[var(--standup-accent-text)]" href="/timeline">
            Ver todas as fontes
          </Link>
        </Card>
      ) : null}

      <div className="mt-6 space-y-6">
        {days.map((day) => (
          <section key={day.key}>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.06em] text-[#79839B]">{day.label}</h2>
            <Card className="mt-2 overflow-hidden border-[#212938] p-0">
              <div className="divide-y divide-[#161C2B]">
                {day.entries.map(({ event, time }) => (
                  <div key={event.id} className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-baseline gap-3 px-[18px] py-3">
                    <span className="font-mono text-[11px] text-[#79839B]">{time}</span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2">
                        <span className="text-[#9AA4BA]">
                          <BrandIcon service={event.service} size={12} />
                        </span>
                        <span className="truncate text-[13px] text-[#E9EDF7]">{event.title}</span>
                      </p>
                      {event.summary ? (
                        <p className="mt-0.5 line-clamp-1 text-[12px] text-[#8C96AD]">{event.summary}</p>
                      ) : null}
                    </div>
                    <span className="font-mono rounded bg-[#161C2B] px-1.5 py-0.5 text-[10.5px] text-[#79839B]">
                      {event.type}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </section>
        ))}
      </div>
    </div>
  );
}
