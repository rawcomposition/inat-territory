/**
 * Minimal iNaturalist API client for the prototype.
 * Docs: https://api.inaturalist.org/v1/docs/
 */

export interface InatObservation {
  id: number
  /** [longitude, latitude] */
  coords: [number, number]
  speciesGuess: string | null
}

const API = "https://api.inaturalist.org/v1/observations"

/**
 * Fetch a user's georeferenced observations within `radiusKm` of `center`.
 * Pages through results up to `maxPages` (200 results/page). `year` (when not
 * null) limits results to that observation year; `categories` (when non-empty)
 * limits to those iconic taxa.
 */
export async function fetchObservations(
  username: string,
  center: [number, number],
  radiusKm: number,
  maxPages: number,
  year: number | null,
  categories: string[],
): Promise<InatObservation[]> {
  const [lng, lat] = center
  const perPage = 200
  const all: InatObservation[] = []

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(API)
    url.searchParams.set("user_login", username)
    url.searchParams.set("lat", String(lat))
    url.searchParams.set("lng", String(lng))
    url.searchParams.set("radius", String(radiusKm)) // km
    url.searchParams.set("geo", "true")
    url.searchParams.set("per_page", String(perPage))
    url.searchParams.set("page", String(page))
    url.searchParams.set("order_by", "observed_on")
    if (year != null) url.searchParams.set("year", String(year))
    if (categories.length) url.searchParams.set("iconic_taxa", categories.join(","))

    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`iNaturalist API error ${res.status}: ${res.statusText}`)
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
            `Try a smaller radius or a year filter.`,
        )
      }
    }

    const results: any[] = data.results ?? []

    for (const r of results) {
      const coords = r.geojson?.coordinates as [number, number] | undefined
      if (coords) {
        all.push({
          id: r.id,
          coords,
          speciesGuess: r.species_guess ?? r.taxon?.name ?? null,
        })
      }
    }

    // Stop early if we've drained the result set.
    if (results.length < perPage) break
  }

  return all
}
