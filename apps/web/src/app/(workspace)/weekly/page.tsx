import { Card } from "@/components/ui/card";
import { getActiveWorkspaceId, getDashboardState } from "@/lib/api-client";
import { normalizeDashboardPayload } from "@/lib/dashboard-view-model";
import { normalizeWorkEvents } from "@/lib/work-event";
import { buildWeeklyView } from "@/lib/detail/weekly";
import { cn } from "@/lib/utils";

export default async function WeeklyPage() {
  const workspaceId = await getActiveWorkspaceId();
  const dashboardState = await getDashboardState(workspaceId);
  const dashboard = normalizeDashboardPayload(dashboardState.data?.dashboard);
  const events = normalizeWorkEvents(dashboard.events, workspaceId);
  const weekly = buildWeeklyView(dashboard, events);

  return (
    <div className="mx-auto min-w-0 max-w-[900px] px-5 pb-[72px] pt-[26px]">
      <h1 className="text-[24px] font-semibold leading-[1.25] tracking-[-0.028em]">Semana</h1>

      <p className="text-balance mt-5 max-w-[760px] text-[19px] leading-[1.5] tracking-[-0.018em] text-[#E9EDF7]">
        {weekly.synthesis}
      </p>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {weekly.stats.map((stat) => (
          <div key={stat.label}>
            <p
              className={cn(
                "font-mono text-[24px] font-medium leading-none",
                stat.highlighted ? "text-[#FF8FA6]" : "text-[#E9EDF7]",
              )}
            >
              {stat.value}
            </p>
            <p className="mt-2 text-[12.5px] text-[#8C96AD]">{stat.label}</p>
            {stat.note ? <p className="mt-0.5 text-[11.5px] text-[#79839B]">{stat.note}</p> : null}
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <Card className="border-[#212938] p-[18px]">
          <h2 className="text-[13.5px] font-semibold">Entregue</h2>
          {weekly.shipped.length === 0 ? (
            <p className="mt-2 text-[12.5px] leading-[1.45] text-[#8C96AD]">
              Nenhum trabalho concluído foi registrado nesta semana.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {weekly.shipped.map((entry) => (
                <li key={entry} className="text-[13px] leading-[1.45] text-[#9AA4BA]">
                  {entry}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="border-[#212938] p-[18px]">
          <h2 className="text-[13.5px] font-semibold">Ficou para trás</h2>
          {weekly.slipped.length === 0 ? (
            <p className="mt-2 text-[12.5px] leading-[1.45] text-[#8C96AD]">
              Nada ficou bloqueado nesta semana.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {weekly.slipped.map((entry) => (
                <li key={entry.title} className="border-l-2 border-[#3A3220] pl-3">
                  <p className="text-[13px] font-medium">{entry.title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-[1.45] text-[#8C96AD]">{entry.why}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
