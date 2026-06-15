/**
 * Minimal iNaturalist API client for the prototype.
 * Docs: https://api.inaturalist.org/v2/docs/
 *
 * Uses the v2 endpoint, which supports `fields` to limit the response to only
 * what we need (id + geojson). v1 has no field selection and always returns the
 * full observation object. No auth is required for field selection; the only
 * thing auth affects is visibility of obscured coordinates, which we don't need.
 */

export interface InatObservation {
  id: number
  /** [longitude, latitude] */
  coords: [number, number]
}

const API = "https://api.inaturalist.org/v2/observations"

// v2 returns only `uuid` per record by default; opt into exactly the fields we
// consume. `geojson` carries the (obscured-when-applicable) point coordinates.
const FIELDS = "id,geojson"

/**
 * The area a territory's observations are drawn from: either a circle (radius
 * territory) or an iNaturalist Standard place (place territory). Maps directly
 * to the matching observation-query params.
 */
export type ObsArea =
  | { kind: "radius"; center: [number, number]; radiusKm: number }
  | { kind: "place"; placeId: number }

/** Apply an {@link ObsArea} to the observation query's search params. */
function applyArea(params: URLSearchParams, area: ObsArea): void {
  if (area.kind === "place") {
    params.set("place_id", String(area.placeId))
    return
  }
  const [lng, lat] = area.center
  params.set("lat", String(lat))
  params.set("lng", String(lng))
  params.set("radius", String(area.radiusKm)) // km
}

/**
 * Fetch a user's georeferenced observations within `area` (a radius circle or
 * an iNaturalist place). Pages through results up to `maxPages` (200
 * results/page). `year` (when not null) limits results to that observation
 * year; `categories` (when non-empty) limits to those iconic taxa.
 */
export async function fetchObservations(
  username: string,
  area: ObsArea,
  maxPages: number,
  year: number | null,
  categories: string[],
): Promise<InatObservation[]> {
  const perPage = 200
  const all: InatObservation[] = []

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(API)
    url.searchParams.set("user_login", username)
    applyArea(url.searchParams, area)
    url.searchParams.set("geo", "true")
    url.searchParams.set("geoprivacy", "open")
    url.searchParams.set("taxon_geoprivacy", "open")
    url.searchParams.set("per_page", String(perPage))
    url.searchParams.set("page", String(page))
    url.searchParams.set("order_by", "observed_on")
    url.searchParams.set("fields", FIELDS)
    if (year != null) url.searchParams.set("year", String(year))
    if (categories.length) url.searchParams.set("iconic_taxa", categories.join(","))

    const res = await fetch(url)
    if (!res.ok) {
      // iNat v2 returns a JSON body with an `errors` array (e.g. an unknown
      // username yields
      // `{"status":"422","errors":[{"message":"Unknown user_id <name>"}]}`).
      // Surface a clear message rather than the bare HTTP status.
      const apiError = await res
        .clone()
        .json()
        .then((b) => {
          const msg = b?.errors?.[0]?.message
          return typeof msg === "string" ? msg : null
        })
        .catch(() => null)

      if (apiError?.startsWith("Unknown user_id")) {
        throw new Error(`No iNaturalist user found with username "${username}".`)
      }
      throw new Error(
        apiError
          ? `iNaturalist API error ${res.status}: ${apiError}`
          : `iNaturalist API error ${res.status}: ${res.statusText}`,
      )
    }
    const data = await res.json()

    // Fail fast: page 1 reports the full match count. If the user has more
    // observations here than we can page through, throw before returning a
    // misleadingly partial set — the caller surfaces this as an error.
    if (page === 1) {
      const total: number = data.total_results ?? 0
      const cap = maxPages * perPage
      if (total > cap) {
        throw new Error(
          `This area has ${total.toLocaleString()} matching observations, ` +
            `more than the ${cap.toLocaleString()} we can load at once. ` +
            `Try a smaller area or a year filter.`,
        )
      }
    }

    const results: any[] = data.results ?? []

    for (const r of results) {
      const coords = r.geojson?.coordinates as [number, number] | undefined
      if (coords) {
        all.push({ id: r.id, coords })
      }
    }

    // Stop early if we've drained the result set.
    if (results.length < perPage) break
  }

  return all
}
