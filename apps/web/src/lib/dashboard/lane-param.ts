import type { LaneFilter } from "@/components/dashboard/action-queue";

const LANES: LaneFilter[] = ["action", "waiting", "blocked"];

/** Anything the URL cannot justify falls back to the full queue. */
export function parseLane(value: string | string[] | undefined): LaneFilter {
  const candidate = Array.isArray(value) ? value[0] : value;
  return LANES.includes(candidate as LaneFilter) ? (candidate as LaneFilter) : "all";
}
