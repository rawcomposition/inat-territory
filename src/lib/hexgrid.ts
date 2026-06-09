import * as turf from "@turf/turf"
import type {
  Feature,
  FeatureCollection,
  MultiLineString,
  Polygon,
} from "geojson"
import type { InatObservation } from "./inaturalist"

export interface HexCellProps {
  id: number
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

/**
 * Build a honeycomb grid covering the area defined by `shape`.
 *
 * Cells are kept whole (never clipped). A boundary cell is kept when the
 * fraction of its area inside the boundary is at least `fillThreshold`:
 *   - lower threshold  → fuller, chunkier disk (keeps cells barely touching)
 *   - ~0.5             → balanced, hugs the circle smoothly
 *   - higher threshold → tighter disk (only mostly-inside cells)
 * Selecting by area fraction (rather than centroid distance) breaks up the
 * flat runs a centroid test produces, so the edge reads more naturally round.
 *
 * @param center          [lng, lat] center of the area
 * @param radiusKm        circumradius of the area in kilometers
 * @param cellSideKm      length of one hexagon cell edge in kilometers
 * @param shape           overall area shape ("circle" or "hexagon")
 * @param hexRotationDeg  rotation of the hexagon boundary (degrees)
 * @param fillThreshold   fraction of a cell that must lie inside to keep it
 */
export function buildHexGrid(
  center: [number, number],
  radiusKm: number,
  cellSideKm: number,
  shape: AreaShape = "circle",
  hexRotationDeg = 0,
  fillThreshold = 0.5,
): HexCell[] {
  const boundary = buildBoundary(center, radiusKm, shape, hexRotationDeg)
  const bbox = turf.bbox(boundary)

  const grid = turf.hexGrid(bbox, cellSideKm, { units: "kilometers" })

  const cells: HexCell[] = []
  let id = 0
  for (const hex of grid.features) {
    const ring = hex.geometry.coordinates[0]
    const vertices = ring.slice(0, -1) // drop the closing duplicate
    const inside = vertices.map((v) => turf.booleanPointInPolygon(v, boundary))
    const allIn = inside.every(Boolean)
    const anyIn = inside.some(Boolean)

    let keep = false
    if (allIn) {
      keep = true
    } else if (anyIn) {
      // Boundary cell — keep the whole cell if enough of it is inside.
      const overlap = turf.intersect(turf.featureCollection([hex, boundary]))
      if (overlap) {
        keep = turf.area(overlap) / turf.area(hex) >= fillThreshold
      }
    }

    if (keep) {
      cells.push({
        type: "Feature",
        geometry: hex.geometry as Polygon,
        properties: { id: id++, count: 0, highlighted: false },
      })
    }
  }
  return cells
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

  const matched: InatObservation[] = []
  for (const obs of observations) {
    const pt = turf.point(obs.coords)
    // Linear scan is fine for prototype-scale grids/observation counts.
    for (const cell of cells) {
      if (turf.booleanPointInPolygon(pt, cell)) {
        cell.properties.count += 1
        cell.properties.highlighted = true
        matched.push(obs)
        break
      }
    }
  }

  return { grid: { type: "FeatureCollection", features: cells }, matched }
}
