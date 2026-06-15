/**
 * iNaturalist Places API client.
 * Docs: https://api.inaturalist.org/v1/docs/#!/Places
 *
 * Two-step flow: autocomplete search → fetch the chosen place's boundary
 * geometry. No auth required (public GET endpoints).
 *
 * Both official administrative boundaries (countries, states, counties — marked
 * with a non-null `admin_level`) and community-curated places (`admin_level:
 * null`) are returned.
 */

import type { MultiPolygon, Polygon } from "geojson"

const API = "https://api.inaturalist.org/v1/places"

/** A Standard place returned by the autocomplete search. */
export interface PlaceResult {
  id: number
  /** Disambiguated label, e.g. "California, US". */
  displayName: string
  /** Admin level for official boundaries (e.g. 0 country, 10 state, 20 county);
   * null for community-curated places. */
  adminLevel: number | null
  /** Coarse rectangle around the place — enough to frame the map before the
   * full boundary loads. */
  boundingBox: Polygon | null
}

/** A place's full boundary geometry, ready to drop into a Mapbox GeoJSON source. */
export type PlaceGeometry = Polygon | MultiPolygon

interface RawPlace {
  id: number
  display_name?: string
  name?: string
  admin_level: number | null
  bounding_box_geojson?: Polygon | null
  geometry_geojson?: PlaceGeometry | null
}

/**
 * Search places by name. Returns up to `perPage` matches (official and
 * community-curated alike). The boundary itself is omitted by this endpoint —
 * fetch it with {@link fetchPlaceGeometry} once the user picks a result.
 */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  perPage = 20,
): Promise<PlaceResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const url = new URL(`${API}/autocomplete`)
  url.searchParams.set("q", trimmed)
  url.searchParams.set("per_page", String(perPage))

  const res = await fetch(url, { signal })
  if (!res.ok) {
    throw new Error(`iNaturalist Places API error ${res.status}: ${res.statusText}`)
  }
  const data = await res.json()
  const results: RawPlace[] = data.results ?? []

  return results.map((r) => ({
    id: r.id,
    displayName: r.display_name ?? r.name ?? `Place ${r.id}`,
    adminLevel: r.admin_level,
    boundingBox: r.bounding_box_geojson ?? null,
  }))
}

/**
 * Fetch a place's full boundary geometry by id. Returns null if the place is
 * missing or has no geometry.
 */
export async function fetchPlaceGeometry(
  id: number,
  signal?: AbortSignal,
): Promise<PlaceGeometry | null> {
  const url = new URL(`${API}/${id}`)
  const res = await fetch(url, { signal })
  if (!res.ok) {
    throw new Error(`iNaturalist Places API error ${res.status}: ${res.statusText}`)
  }
  const data = await res.json()
  const place: RawPlace | undefined = data.results?.[0]
  return place?.geometry_geojson ?? null
}
