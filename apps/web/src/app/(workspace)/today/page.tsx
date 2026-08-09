import { TodayScreen } from "@/components/dashboard/today-screen";
import { parseLane } from "@/lib/dashboard/lane-param";
import { getActiveWorkspaceId } from "@/lib/api-client";

type TodayPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The canonical entry point. This used to be a fixture-driven demo of the same
 * screen, which meant the product had two Todays — one real and one that only
 * looked real. It resolves the active workspace and renders the real one.
 */
export default async function TodayPage({ searchParams }: TodayPageProps) {
  const query = await searchParams;
  const workspaceId = await getActiveWorkspaceId();

  return <TodayScreen lane={parseLane(query.lane)} workspaceId={workspaceId} />;
}
