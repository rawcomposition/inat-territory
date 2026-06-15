import * as turf from "@turf/turf"
import * as h3 from "h3-js"
import type {
  Feature,
  FeatureCollection,
  MultiLineString,
  MultiPolygon,
  Polygon,
} from "geojson"
import type { InatObservation } from "./inaturalist"

export interface HexCellProps {
  /** Global H3 cell index — deterministic and identical across users, so two
   * overlapping territories share the exact same cell ids. */
  id: string
  /** how many of the user's observations fall inside this cell */
  count: number
  highlighted: boolean
}

export type HexCell = Feature<Polygon, HexCellProps>

export type AreaShape = "circle" | "hexagon"

/**
 * Build the boundary polygon for the area of interest.
 *
 * A "hexagon" boundary shares the honeycomb's 6-fold symmetry, so the grid
 * reads as an intentional hex tile rather than a circle clipped into bumps.
 * `radiusKm` is the center-to-vertex distance (circumradius), so a hexagon and
 * a circle with the same radius are framed the same way.
 *
 * @param center          [lng, lat] center of the area
 * @param radiusKm        circumradius in kilometers
 * @param shape           "circle" or "hexagon"
 * @param hexRotationDeg  rotation of the hexagon boundary (degrees)
 */
export function buildBoundary(
  center: [number, number],
  radiusKm: number,
  shape: AreaShape,
  hexRotationDeg = 0,
): Feature<Polygon> {
  if (shape === "hexagon") {
    const ring: number[][] = []
    for (let i = 0; i < 6; i++) {
      const bearing = hexRotationDeg + i * 60
      const vertex = turf.destination(center, radiusKm, bearing, { units: "kilometers" })
      ring.push(vertex.geometry.coordinates)
    }
    ring.push(ring[0]) // close the ring
    return turf.polygon([ring])
  }
  // High step count keeps the arc smooth when perimeter cells are clipped to it.
  return turf.circle(center, radiusKm, { units: "kilometers", steps: 256 })
}

/** Polygon for an H3 cell, as a closed GeoJSON ring in [lng, lat] order. */
function h3CellPolygon(index: string): Feature<Polygon> {
  // `true` → GeoJSON form: [lng, lat] order, ring closed (last point == first).
  return turf.polygon([h3.cellToBoundary(index, true)])
}

/**
 * Select the H3 cells for a territory: those whose center falls inside a
 * hexagon of circumradius `radiusKm`, centered on the center cell and rotated
 * to match the cells' own orientation.
 *
 * Aligning the bounding hexagon to the local cell tilt (rather than to north)
 * makes the macro shape *mirror* the unit cells — flat where the cells are flat
 * — so the territory reads as a big hexagon-of-hexagons in the same orientation
 * as its cells, instead of the 30°-rotated, pointy-topped diamond a plain
 * grid-disk produces. The hexagon is centered on the center cell so the result
 * stays symmetric about the middle. Because the cells come from H3's fixed
 * global tiling the result is deterministic: overlapping territories share
 * identical cell ids.
 *
 * @param center      [lng, lat] center of the territory
 * @param radiusKm    circumradius of the bounding hexagon in kilometers
 * @param resolution  H3 resolution (higher = smaller cells)
 */
export function buildHexGrid(
  center: [number, number],
  radiusKm: number,
  resolution: number,
): HexCell[] {
  const [lng, lat] = center
  const centerCell = h3.latLngToCell(lat, lng, resolution)

  // The cells' orientation: the bearing from the center cell's middle to its
  // first vertex. Rotating the bounding hexagon to this angle lines its edges
  // up with the cell edges, so the macro shape mirrors the cells.
  const [cLat, cLng] = h3.cellToLatLng(centerCell)
  const cellCenter: [number, number] = [cLng, cLat]
  const rotation = turf.bearing(cellCenter, h3.cellToBoundary(centerCell, true)[0])

  // Center the hexagon on the cell (not the raw point) to keep the disk
  // symmetric about the middle cell.
  const boundary = buildBoundary(cellCenter, radiusKm, "hexagon", rotation)

  // polygonToCells keeps cells whose center is inside; union the center cell so
  // a radius smaller than one cell still yields the single covering cell.
  const indices = new Set<string>([
    centerCell,
    ...h3.polygonToCells(boundary.geometry.coordinates, resolution, true),
  ])

  return [...indices].map((index) => ({
    type: "Feature",
    geometry: h3CellPolygon(index).geometry,
    properties: { id: index, count: 0, highlighted: false },
  }))
}

/**
 * Largest number of cells a place boundary may tile into. A whole country or
 * state at a fine cell size would otherwise generate millions of cells and hang
 * the page, so {@link buildPlaceHexGrid} refuses past this and the UI asks for a
 * larger cell size.
 */
export const PLACE_CELL_CAP = 60_000

/** Thrown by {@link buildPlaceHexGrid} when a place tiles into too many cells. */
export class PlaceTooLargeError extends Error {
  constructor() {
    super(
      "This place is too detailed for this cell size. Choose a larger cell size.",
    )
    this.name = "PlaceTooLargeError"
  }
}

/** The loop arrays (outer ring + holes) for each polygon in a geometry. */
function polygonRings(geometry: Polygon | MultiPolygon): number[][][][] {
  return geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates
}

/**
 * Tile an arbitrary place boundary (an iNaturalist Standard place polygon) into
 * the same global H3 cells used by radius territories — so a county or state
 * reads as the same honeycomb, with cells shared across overlapping territories.
 *
 * Keeps every cell whose center falls inside the polygon (holes respected).
 * Guards against runaway sizes: if the boundary would tile into more than
 * {@link PLACE_CELL_CAP} cells it throws {@link PlaceTooLargeError} rather than
 * locking up the page.
 *
 * @param geometry    GeoJSON Polygon or MultiPolygon in [lng, lat] order
 * @param resolution  H3 resolution (higher = smaller cells)
 */
export function buildPlaceHexGrid(
  geometry: Polygon | MultiPolygon,
  resolution: number,
): HexCell[] {
  const rings = polygonRings(geometry)

  // Cheap pre-check before generating anything: the boundary's area divided by
  // the average cell area approximates the eventual cell count closely enough to
  // reject a too-large request without hanging the page.
  const areaKm2 = turf.area(geometry) / 1e6
  const cellAreaKm2 = h3.getHexagonAreaAvg(resolution, h3.UNITS.km2)
  if (areaKm2 / cellAreaKm2 > PLACE_CELL_CAP) throw new PlaceTooLargeError()

  const indices = new Set<string>()
  for (const poly of rings) {
    for (const index of h3.polygonToCells(poly, resolution, true)) {
      indices.add(index)
    }
    if (indices.size > PLACE_CELL_CAP) throw new PlaceTooLargeError()
  }

  return [...indices].map((index) => ({
    type: "Feature",
    geometry: h3CellPolygon(index).geometry,
    properties: { id: index, count: 0, highlighted: false },
  }))
}

/**
 * Trace the outer contour of the kept cells as a frame outline.
 *
 * A polygon union (turf.union) is unreliable here: adjacent hexagons' shared
 * vertices differ by floating-point noise, so the union leaves sliver gaps that
 * render as spurious interior lines. Instead we work at the edge level — an
 * interior edge is shared by exactly two cells, so it appears twice; a perimeter
 * edge appears once. Keeping the once-only edges and chaining them into closed
 * rings yields a clean outline that hugs the jagged hex border with no interior
 * strokes. Depends only on grid geometry, so it's stable across observation
 * updates and the incomplete-cells toggle.
 */
export function buildCellsOutline(
  cells: HexCell[],
): FeatureCollection<MultiLineString> {
  if (cells.length === 0) return turf.featureCollection([])

  // Quantize coordinates to ~1cm so floating-point-equal vertices collapse to
  // the same key (distinct hex vertices are tens of metres apart, so they don't
  // collide).
  const key = (p: number[]) => `${Math.round(p[0] * 1e7)}|${Math.round(p[1] * 1e7)}`

  // Count each undirected edge.
  const edges = new Map<string, { a: number[]; b: number[]; n: number }>()
  for (const cell of cells) {
    const ring = cell.geometry.coordinates[0]
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i]
      const b = ring[i + 1]
      const ka = key(a)
      const kb = key(b)
      const id = ka < kb ? `${ka}/${kb}` : `${kb}/${ka}`
      const seen = edges.get(id)
      if (seen) seen.n++
      else edges.set(id, { a, b, n: 1 })
    }
  }

  const boundary = [...edges.values()].filter((e) => e.n === 1)
  if (boundary.length === 0) return turf.featureCollection([])

  // Chain boundary edges into closed rings so the stroke joins cleanly at
  // corners (each boundary vertex meets exactly two boundary edges).
  const adj = new Map<string, number[]>()
  boundary.forEach((e, i) => {
    for (const p of [e.a, e.b]) {
      const k = key(p)
      const arr = adj.get(k)
      if (arr) arr.push(i)
      else adj.set(k, [i])
    }
  })

  const used = new Array(boundary.length).fill(false)
  const lines: number[][][] = []
  for (let start = 0; start < boundary.length; start++) {
    if (used[start]) continue
    used[start] = true
    const path = [boundary[start].a, boundary[start].b]
    for (;;) {
      const tail = path[path.length - 1]
      const tk = key(tail)
      const next = (adj.get(tk) ?? []).find((i) => !used[i])
      if (next == null) break
      used[next] = true
      const e = boundary[next]
      path.push(key(e.a) === tk ? e.b : e.a)
    }
    lines.push(path)
  }

  return turf.featureCollection([turf.multiLineString(lines)])
}

/**
 * Tag each cell with the number of observations that fall inside it.
 *
 * Observations outside every cell (i.e. outside the hexagon boundary) are
 * dropped: they're excluded from `matched`, so they neither render on the map
 * nor count toward the stats. Returns the marked grid plus the matched subset.
 */
export function markObservedCells(
  cells: HexCell[],
  observations: InatObservation[],
): { grid: FeatureCollection<Polygon, HexCellProps>; matched: InatObservation[] } {
  // Reset counts (in case of re-run).
  for (const cell of cells) {
    cell.properties.count = 0
    cell.properties.highlighted = false
  }

  // Map cells by their H3 index for O(1) lookup. The resolution is read back
  // from a kept cell, so this needs no extra parameter.
  const byId = new Map(cells.map((c) => [c.properties.id, c]))
  const resolution = cells.length ? h3.getResolution(cells[0].properties.id) : null

  const matched: InatObservation[] = []
  if (resolution != null) {
    for (const obs of observations) {
      const [lng, lat] = obs.coords
      const cell = byId.get(h3.latLngToCell(lat, lng, resolution))
      if (cell) {
        cell.properties.count += 1
        cell.properties.highlighted = true
        matched.push(obs)
      }
    }
  }

  return { grid: { type: "FeatureCollection", features: cells }, matched }
}
