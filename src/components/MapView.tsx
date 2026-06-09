import { useEffect, useRef } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import * as turf from "@turf/turf"
import type { FeatureCollection, Point, Polygon } from "geojson"

import {
  AREA_HEX_ROTATION_DEG,
  AREA_SHAPE,
  CENTER_LNGLAT,
  HEX_BORDER_STYLE,
  MAP_STYLE,
  MAPBOX_TOKEN,
  RADIUS_KM,
  RADIUS_STYLE,
  SHOW_RADIUS,
} from "@/config"
import { buildBoundary, type HexCellProps } from "@/lib/hexgrid"

const GRID_SOURCE = "hex-grid"
const POINTS_SOURCE = "inat-points"
const BOUNDARY_SOURCE = "area-boundary"

interface MapViewProps {
  grid: FeatureCollection<Polygon, HexCellProps>
  points: FeatureCollection<Point>
}

export function MapView({ grid, points }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const loadedRef = useRef(false)

  // Keep the latest data in refs so the (mount-only) load handler can seed the
  // sources with whatever is current when the style finishes loading.
  const gridRef = useRef(grid)
  const pointsRef = useRef(points)
  gridRef.current = grid
  pointsRef.current = points

  // Init the map once.
  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return

    mapboxgl.accessToken = MAPBOX_TOKEN
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: CENTER_LNGLAT,
      zoom: 11,
    })
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl(), "top-right")

    map.on("load", () => {
      // Honeycomb grid — drawn right away, before observations load.
      map.addSource(GRID_SOURCE, { type: "geojson", data: gridRef.current })
      map.addLayer({
        id: "hex-fill",
        type: "fill",
        source: GRID_SOURCE,
        paint: {
          "fill-color": ["case", ["get", "highlighted"], "#16a34a", "#94a3b8"],
          "fill-opacity": ["case", ["get", "highlighted"], 0.55, 0.06],
        },
      })
      map.addLayer({
        id: "hex-outline",
        type: "line",
        source: GRID_SOURCE,
        paint: {
          "line-color": HEX_BORDER_STYLE.color,
          "line-width": HEX_BORDER_STYLE.width,
          "line-opacity": HEX_BORDER_STYLE.opacity,
        },
      })

      // Observation points.
      map.addSource(POINTS_SOURCE, { type: "geojson", data: pointsRef.current })
      map.addLayer({
        id: "inat-points",
        type: "circle",
        source: POINTS_SOURCE,
        paint: {
          "circle-radius": 3,
          "circle-color": "#065f46",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
        },
      })

      // Boundary of the area of interest (circle or hexagon).
      const boundary = buildBoundary(
        CENTER_LNGLAT,
        RADIUS_KM,
        AREA_SHAPE,
        AREA_HEX_ROTATION_DEG,
      )

      // Optional boundary outline.
      if (SHOW_RADIUS) {
        map.addSource(BOUNDARY_SOURCE, { type: "geojson", data: boundary })
        map.addLayer({
          id: "area-outline",
          type: "line",
          source: BOUNDARY_SOURCE,
          paint: {
            "line-color": RADIUS_STYLE.color,
            "line-width": RADIUS_STYLE.width,
            "line-opacity": RADIUS_STYLE.opacity,
            ...(RADIUS_STYLE.dash.length
              ? { "line-dasharray": RADIUS_STYLE.dash }
              : {}),
          },
        })
      }

      // Frame the area.
      map.fitBounds(turf.bbox(boundary) as [number, number, number, number], {
        padding: 40,
        duration: 0,
      })

      loadedRef.current = true
    })

    return () => {
      loadedRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Push grid updates (e.g. once observations arrive) to the live source.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    const src = map.getSource(GRID_SOURCE) as mapboxgl.GeoJSONSource | undefined
    src?.setData(grid)
  }, [grid])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    const src = map.getSource(POINTS_SOURCE) as mapboxgl.GeoJSONSource | undefined
    src?.setData(points)
  }, [points])

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
        Set VITE_MAPBOX_TOKEN in .env to load the map.
      </div>
    )
  }

  return <div ref={containerRef} className="h-full w-full" />
}
