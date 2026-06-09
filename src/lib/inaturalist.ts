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
 * Pages through results up to `maxPages` (200 results/page).
 */
export async function fetchObservations(
  username: string,
  center: [number, number],
  radiusKm: number,
  maxPages: number,
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

    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`iNaturalist API error ${res.status}: ${res.statusText}`)
    }
    const data = await res.json()
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
