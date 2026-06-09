import * as turf from "@turf/turf"
import type { Feature, FeatureCollection, Polygon } from "geojson"
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
 * Tag each cell with the number of observations that fall inside it.
 * Returns a FeatureCollection ready to hand to a Mapbox GeoJSON source.
 */
export function markObservedCells(
  cells: HexCell[],
  observations: InatObservation[],
): FeatureCollection<Polygon, HexCellProps> {
  // Reset counts (in case of re-run).
  for (const cell of cells) {
    cell.properties.count = 0
    cell.properties.highlighted = false
  }

  for (const obs of observations) {
    const pt = turf.point(obs.coords)
    // Linear scan is fine for prototype-scale grids/observation counts.
    for (const cell of cells) {
      if (turf.booleanPointInPolygon(pt, cell)) {
        cell.properties.count += 1
        cell.properties.highlighted = true
        break
      }
    }
  }

  return { type: "FeatureCollection", features: cells }
}
