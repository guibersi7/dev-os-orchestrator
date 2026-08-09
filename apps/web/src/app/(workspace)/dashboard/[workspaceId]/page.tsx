import { TodayScreen } from "@/components/dashboard/today-screen";
import { parseLane } from "@/lib/dashboard/lane-param";

type DashboardWorkspacePageProps = {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The same screen as `/today`, addressed by an explicit workspace. Useful when
 * someone belongs to more than one; `/today` is the canonical entry point.
 */
export default async function DashboardWorkspacePage({ params, searchParams }: DashboardWorkspacePageProps) {
  const { workspaceId } = await params;
  const query = await searchParams;

  return <TodayScreen lane={parseLane(query.lane)} workspaceId={workspaceId} />;
}
