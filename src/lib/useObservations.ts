import { useQuery } from "@tanstack/react-query";
import { fetchObservations, type InatObservation } from "./inaturalist";

/**
 * Cached query for a user's iNaturalist observations within a radius.
 *
 * The query key captures every input, so changing the username, center,
 * radius, or page cap produces a distinct cache entry (and previously fetched
 * combinations are served instantly from cache).
 */
export function useObservations(
  username: string,
  center: [number, number],
  radiusKm: number,
  maxPages: number,
  year: number | null,
  categories: string[],
) {
  return useQuery<InatObservation[]>({
    queryKey: [
      "inat-observations",
      username,
      center[0],
      center[1],
      radiusKm,
      maxPages,
      year,
      categories.join(","),
    ],
    queryFn: () => fetchObservations(username, center, radiusKm, maxPages, year, categories),
    enabled: Boolean(username),
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
  });
}
