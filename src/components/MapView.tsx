import { useEffect, useRef } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import * as turf from "@turf/turf"
import type { FeatureCollection, MultiLineString, Point, Polygon } from "geojson"

import {
  AREA_HEX_ROTATION_DEG,
  AREA_SHAPE,
  HEX_BORDER_STYLE,
  HEX_FRAME_STYLE,
  MAP_STYLE,
  MAPBOX_TOKEN,
  RADIUS_STYLE,
  SHOW_RADIUS,
} from "@/config"
import { buildBoundary, type HexCellProps } from "@/lib/hexgrid"

const GRID_SOURCE = "hex-grid"
const FRAME_SOURCE = "hex-frame"
const POINTS_SOURCE = "inat-points"
const BOUNDARY_SOURCE = "area-boundary"

// Framing used before there's any territory to show — centered on Central
// America, [lng, lat].
const WORLD_CENTER: [number, number] = [-85, 12]
const WORLD_ZOOM = 1.2

const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] }

interface MapViewProps {
  grid: FeatureCollection<Polygon, HexCellProps>
  /** Outer contour of the whole grid, drawn as a frame. */
  outline: FeatureCollection<MultiLineString>
  points: FeatureCollection<Point>
  /** When false, cells without any finds are hidden. */
  showIncomplete: boolean
  /** Area center, [lng, lat]. Null when there's no active territory. */
  center: [number, number] | null
  /** Area radius / circumradius in kilometers. Null when there's no territory. */
  radiusKm: number | null
}

// Only show cells with a find. Used as a layer filter when incomplete cells
// are toggled off; `null` clears the filter (show everything).
const HIGHLIGHTED_ONLY: mapboxgl.FilterSpecification = ["get", "highlighted"]

export function MapView({ grid, outline, points, showIncomplete, center, radiusKm }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const loadedRef = useRef(false)

  // Keep the latest data in refs so the (mount-only) load handler can seed the
  // sources with whatever is current when the style finishes loading.
  const gridRef = useRef(grid)
  const outlineRef = useRef(outline)
  const pointsRef = useRef(points)
  const showIncompleteRef = useRef(showIncomplete)
  const centerRef = useRef(center)
  const radiusKmRef = useRef(radiusKm)
  gridRef.current = grid
  outlineRef.current = outline
  pointsRef.current = points
  showIncompleteRef.current = showIncomplete
  centerRef.current = center
  radiusKmRef.current = radiusKm

  // Init the map once.
  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return

    mapboxgl.accessToken = MAPBOX_TOKEN
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: centerRef.current ?? WORLD_CENTER,
      zoom: centerRef.current ? 11 : WORLD_ZOOM,
    })
    mapRef.current = map
    // Hide the compass (the double-arrow below the zoom buttons) everywhere.
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right")

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

      // Honour the current incomplete-cells toggle as soon as layers exist.
      if (!showIncompleteRef.current) {
        map.setFilter("hex-fill", HIGHLIGHTED_ONLY)
        map.setFilter("hex-outline", HIGHLIGHTED_ONLY)
      }

      // Frame tracing the outer contour of the whole grid. Sits above the cell
      // outlines and is never filtered — it always frames the full territory.
      map.addSource(FRAME_SOURCE, { type: "geojson", data: outlineRef.current })
      map.addLayer({
        id: "hex-frame",
        type: "line",
        source: FRAME_SOURCE,
        layout: { "line-join": "round" },
        paint: {
          "line-color": HEX_FRAME_STYLE.color,
          "line-width": HEX_FRAME_STYLE.width,
          "line-opacity": HEX_FRAME_STYLE.opacity,
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

      // Open the observation on iNaturalist when its point is clicked, and show
      // a pointer cursor while hovering one.
      map.on("click", "inat-points", (e) => {
        const id = e.features?.[0]?.properties?.id
        if (id != null) {
          window.open(
            `https://www.inaturalist.org/observations/${id}`,
            "_blank",
            "noopener,noreferrer",
          )
        }
      })
      map.on("mouseenter", "inat-points", () => {
        map.getCanvas().style.cursor = "pointer"
      })
      map.on("mouseleave", "inat-points", () => {
        map.getCanvas().style.cursor = ""
      })

      // Boundary of the area of interest (circle or hexagon). Always added as a
      // source — empty until there's a territory — so the center/radius effect
      // can update it; the outline layer is still gated on SHOW_RADIUS.
      const initialCenter = centerRef.current
      const initialRadius = radiusKmRef.current
      const boundary =
        initialCenter && initialRadius != null
          ? buildBoundary(
              initialCenter,
              initialRadius,
              AREA_SHAPE,
              AREA_HEX_ROTATION_DEG,
            )
          : EMPTY_FC
      map.addSource(BOUNDARY_SOURCE, { type: "geojson", data: boundary })

      if (SHOW_RADIUS) {
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

      // Frame the area, if there is one.
      if (initialCenter && initialRadius != null) {
        map.fitBounds(turf.bbox(boundary) as [number, number, number, number], {
          padding: 40,
          duration: 0,
        })
      }

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

  // Push outline (frame) updates to the live source on a territory change.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    const src = map.getSource(FRAME_SOURCE) as mapboxgl.GeoJSONSource | undefined
    src?.setData(outline)
  }, [outline])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    const src = map.getSource(POINTS_SOURCE) as mapboxgl.GeoJSONSource | undefined
    src?.setData(points)
  }, [points])

  // Show/hide cells without finds when the toggle changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    const filter = showIncomplete ? null : HIGHLIGHTED_ONLY
    map.setFilter("hex-fill", filter)
    map.setFilter("hex-outline", filter)
  }, [showIncomplete])

  // Rebuild the boundary and reframe the map when the territory's center or
  // radius changes (e.g. after the user saves an edit). `center`/`radiusKm` are
  // memoized upstream, so this only fires on a real territory change.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    const src = map.getSource(BOUNDARY_SOURCE) as mapboxgl.GeoJSONSource | undefined
    if (!center || radiusKm == null) {
      src?.setData(EMPTY_FC)
      return
    }
    const boundary = buildBoundary(center, radiusKm, AREA_SHAPE, AREA_HEX_ROTATION_DEG)
    src?.setData(boundary)
    map.fitBounds(turf.bbox(boundary) as [number, number, number, number], {
      padding: 40,
      duration: 600,
    })
  }, [center, radiusKm])

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
        Set VITE_MAPBOX_TOKEN in .env to load the map.
      </div>
    )
  }

  return <div ref={containerRef} className="h-full w-full" />
}
