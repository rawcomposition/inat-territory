import { useQuery } from "@tanstack/react-query"
import {
  fetchPlaceGeometry,
  searchPlaces,
  type PlaceGeometry,
  type PlaceResult,
} from "./places"

/** Min query length before we hit the autocomplete endpoint. */
const MIN_QUERY = 2

/**
 * Debounced-ish autocomplete for Standard places. The caller passes the live
 * input value; react-query keys on it, so each distinct query caches its
 * results and repeat searches are instant. `enabled` gates short queries.
 */
export function usePlaceSearch(query: string) {
  const trimmed = query.trim()
  return useQuery<PlaceResult[]>({
    queryKey: ["inat-places-search", trimmed],
    queryFn: ({ signal }) => searchPlaces(trimmed, signal),
    enabled: trimmed.length >= MIN_QUERY,
    staleTime: 1000 * 60 * 60, // 1 hour — place names don't change
    gcTime: 1000 * 60 * 60,
  })
}

/**
 * Fetch and cache a place's boundary geometry by id. Standard boundaries change
 * very rarely, so this caches aggressively — a place fetched once stays cached
 * for the session and is reused across territories that share the same place.
 */
export function usePlaceGeometry(id: number | null | undefined) {
  return useQuery<PlaceGeometry | null>({
    queryKey: ["inat-place-geometry", id],
    queryFn: ({ signal }) => fetchPlaceGeometry(id as number, signal),
    enabled: id != null,
    staleTime: 1000 * 60 * 60 * 24, // 1 day
    gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
  })
}
