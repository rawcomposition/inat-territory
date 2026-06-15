import { useQuery } from "@tanstack/react-query";
import { fetchObservations, type InatObservation, type ObsArea } from "./inaturalist";

/** Stable cache-key fragment for the area (distinguishes radius from place). */
function areaKey(area: ObsArea): (string | number)[] {
  return area.kind === "place"
    ? ["place", area.placeId]
    : ["radius", area.center[0], area.center[1], area.radiusKm];
}

/**
 * Cached query for a user's iNaturalist observations within an area (a radius
 * circle or a Standard place).
 *
 * The query key captures every input, so changing the username, area, or page
 * cap produces a distinct cache entry (and previously fetched combinations are
 * served instantly from cache).
 */
export function useObservations(
  username: string,
  area: ObsArea,
  maxPages: number,
  year: number | null,
  categories: string[],
) {
  return useQuery<InatObservation[]>({
    queryKey: [
      "inat-observations",
      username,
      ...areaKey(area),
      maxPages,
      year,
      categories.join(","),
    ],
    queryFn: () => fetchObservations(username, area, maxPages, year, categories),
    enabled: Boolean(username),
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
  });
}
