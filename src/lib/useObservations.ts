import { useQuery } from "@tanstack/react-query"
import { fetchObservations, type InatObservation } from "./inaturalist"

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
) {
  return useQuery<InatObservation[]>({
    queryKey: ["inat-observations", username, center[0], center[1], radiusKm, maxPages],
    queryFn: () => fetchObservations(username, center, radiusKm, maxPages),
    enabled: Boolean(username),
  })
}
