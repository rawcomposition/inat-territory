import { useEffect, useRef } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import * as turf from "@turf/turf"
import type { FeatureCollection, MultiLineString, Point, Polygon } from "geojson"

import {
  AREA_HEX_ROTATION_DEG,
  AREA_SHAPE,
  HEX_BORDER_STYLE,
  HEX_BORDER_STYLE_SATELLITE,
  HEX_FRAME_STYLE,
  HEX_FRAME_STYLE_SATELLITE,
  HEX_SATELLITE_CASING,
  MAP_STYLE,
  MAPBOX_TOKEN,
  RADIUS_STYLE,
  SATELLITE_STYLE,
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
  /** Area center, [lng, lat]. Null when there's no active territory. */
  center: [number, number] | null
  /** Area radius / circumradius in kilometers. Null when there's no territory. */
  radiusKm: number | null
}

// Inline "layers" icon (lucide) — a stacked-sheets glyph that reads as "map
// layers", shown on the control regardless of which base style is active.
const ICON_LAYERS =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/></svg>'

// A Mapbox control button that toggles between the base map and satellite
// imagery. Lives in the bottom-right control stack alongside the geolocate
// button; the icon stays the same in both states.
class StyleToggleControl implements mapboxgl.IControl {
  private container!: HTMLDivElement
  private satellite = false
  private onChange: (satellite: boolean) => void

  // `onChange` is fired with the new satellite state *before* setStyle, so the
  // style.load handler that re-adds layers can pick the matching border colors.
  constructor(onChange: (satellite: boolean) => void) {
    this.onChange = onChange
  }

  onAdd(map: mapboxgl.Map) {
    this.container = document.createElement("div")
    this.container.className = "mapboxgl-ctrl mapboxgl-ctrl-group"
    const button = document.createElement("button")
    button.type = "button"
    button.title = "Toggle satellite imagery"
    button.setAttribute("aria-label", "Toggle satellite imagery")
    button.style.display = "flex"
    button.style.alignItems = "center"
    button.style.justifyContent = "center"
    button.innerHTML = ICON_LAYERS
    button.addEventListener("click", () => {
      this.satellite = !this.satellite
      button.setAttribute("aria-pressed", String(this.satellite))
      this.onChange(this.satellite)
      map.setStyle(this.satellite ? SATELLITE_STYLE : MAP_STYLE)
    })
    this.container.appendChild(button)
    return this.container
  }

  onRemove() {
    this.container.parentNode?.removeChild(this.container)
  }
}

// How long a touch must stay (roughly) still before it counts as a long-press,
// and how far the finger may drift before we treat it as a pan instead.
const LONG_PRESS_MS = 450
const LONG_PRESS_MOVE_PX = 10

// Build the little menu shown at a tapped/right-clicked spot: a "view in
// Google Maps" link and a "copy coordinates" button.
function buildContextMenu(lngLat: mapboxgl.LngLat): HTMLElement {
  const lat = lngLat.lat.toFixed(6)
  const lng = lngLat.lng.toFixed(6)

  const root = document.createElement("div")
  root.style.display = "flex"
  root.style.flexDirection = "column"
  root.style.gap = "6px"
  root.style.minWidth = "180px"

  const coords = document.createElement("div")
  coords.textContent = `${lat}, ${lng}`
  coords.style.fontFamily = "ui-monospace, monospace"
  coords.style.fontSize = "12px"
  coords.style.color = "#475569"

  // View: a search query of the coords drops a pin at the spot in Google Maps
  // (app on mobile, web on desktop) without starting directions.
  const navLink = document.createElement("a")
  navLink.textContent = "View in Google Maps"
  navLink.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
  navLink.target = "_blank"
  navLink.rel = "noopener noreferrer"
  navLink.style.cssText =
    "display:block;padding:6px 8px;border-radius:6px;background:#16a34a;color:#fff;font-size:13px;text-align:center;text-decoration:none;"

  const copyBtn = document.createElement("button")
  copyBtn.type = "button"
  copyBtn.textContent = "Copy coordinates"
  copyBtn.style.cssText =
    "padding:6px 8px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;font-size:13px;cursor:pointer;"
  copyBtn.addEventListener("click", () => {
    void navigator.clipboard?.writeText(`${lat}, ${lng}`)
    copyBtn.textContent = "Copied!"
  })

  root.append(coords, navLink, copyBtn)
  return root
}

export function MapView({ grid, outline, points, center, radiusKm }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const loadedRef = useRef(false)

  // Keep the latest data in refs so the (mount-only) load handler can seed the
  // sources with whatever is current when the style finishes loading.
  const gridRef = useRef(grid)
  const outlineRef = useRef(outline)
  const pointsRef = useRef(points)
  const centerRef = useRef(center)
  const radiusKmRef = useRef(radiusKm)
  gridRef.current = grid
  outlineRef.current = outline
  pointsRef.current = points
  centerRef.current = center
  radiusKmRef.current = radiusKm
  // Whether satellite imagery is currently active — read by addLayers to pick
  // border colors that stay legible over the imagery.
  const satelliteRef = useRef(false)

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
    // Keep the map north-up: disable drag-to-rotate and the rotate/pitch
    // gesture on the two-finger touch handler (pinch-zoom stays enabled).
    map.dragRotate.disable()
    map.touchZoomRotate.disableRotation()
    map.touchPitch.disable()
    map.keyboard.disableRotation()
    // Hide the compass (the double-arrow below the zoom buttons) everywhere.
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right")
    // "Show my location" button — tracks the user's device location and keeps
    // the dot centered while they move. Bottom-right, away from the nav buttons.
    map.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
      }),
      "bottom-right",
    )
    // Toggle between the base map and satellite imagery. Bottom-right (below the
    // geolocate button) so it stays clear of the top-left info panel and isn't
    // swept up by the mobile rule that hides the top-right zoom controls.
    map.addControl(
      new StyleToggleControl((satellite) => {
        satelliteRef.current = satellite
      }),
      "bottom-right",
    )

    // (Re)add our sources and layers from the latest ref data. Runs on the
    // initial style load and again after every base-map ↔ satellite switch,
    // since setStyle wipes any custom sources/layers.
    function addLayers() {
      // Border/frame colors that stay legible against whichever base style is
      // active — the dark defaults vanish on satellite imagery, so swap to red.
      const borderStyle = satelliteRef.current
        ? HEX_BORDER_STYLE_SATELLITE
        : HEX_BORDER_STYLE
      const frameStyle = satelliteRef.current
        ? HEX_FRAME_STYLE_SATELLITE
        : HEX_FRAME_STYLE

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
      // Dark casing beneath the cell borders — satellite only, where the thin
      // lines would otherwise wash out against the imagery.
      if (satelliteRef.current) {
        map.addLayer({
          id: "hex-outline-casing",
          type: "line",
          source: GRID_SOURCE,
          layout: { "line-join": "round" },
          paint: {
            "line-color": HEX_SATELLITE_CASING.color,
            "line-width": borderStyle.width + HEX_SATELLITE_CASING.widthDelta,
            "line-opacity": HEX_SATELLITE_CASING.opacity,
          },
        })
      }
      map.addLayer({
        id: "hex-outline",
        type: "line",
        source: GRID_SOURCE,
        paint: {
          "line-color": borderStyle.color,
          "line-width": borderStyle.width,
          "line-opacity": borderStyle.opacity,
        },
      })

      // Frame tracing the outer contour of the whole grid. Sits above the cell
      // outlines and always frames the full territory.
      map.addSource(FRAME_SOURCE, { type: "geojson", data: outlineRef.current })
      if (satelliteRef.current) {
        map.addLayer({
          id: "hex-frame-casing",
          type: "line",
          source: FRAME_SOURCE,
          layout: { "line-join": "round" },
          paint: {
            "line-color": HEX_SATELLITE_CASING.color,
            "line-width": frameStyle.width + HEX_SATELLITE_CASING.widthDelta,
            "line-opacity": HEX_SATELLITE_CASING.opacity,
          },
        })
      }
      map.addLayer({
        id: "hex-frame",
        type: "line",
        source: FRAME_SOURCE,
        layout: { "line-join": "round" },
        paint: {
          "line-color": frameStyle.color,
          "line-width": frameStyle.width,
          "line-opacity": frameStyle.opacity,
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

      // Boundary of the area of interest (circle or hexagon). Always added as a
      // source — empty until there's a territory — so the center/radius effect
      // can update it; the outline layer is still gated on SHOW_RADIUS.
      const c = centerRef.current
      const r = radiusKmRef.current
      const boundary =
        c && r != null
          ? buildBoundary(c, r, AREA_SHAPE, AREA_HEX_ROTATION_DEG)
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
    }

    // Open the observation on iNaturalist when its point is clicked, and show a
    // pointer cursor while hovering one. Bound once — these delegate by layer id
    // and keep working when the layer is re-added on a style switch.
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

    // A single reusable popup that acts as the "tap a spot" context menu.
    const menuPopup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: true,
      maxWidth: "none",
    })
    function openContextMenu(lngLat: mapboxgl.LngLat) {
      menuPopup.setLngLat(lngLat).setDOMContent(buildContextMenu(lngLat)).addTo(map)
    }

    // Desktop: right-click. (Mapbox fires `contextmenu` for long-press too on
    // some mobile browsers, but it's unreliable — the touch path below covers
    // mobile explicitly.)
    map.on("contextmenu", (e) => {
      openContextMenu(e.lngLat)
    })

    // Mobile long-press: start a timer on a single-finger touch, cancel it if
    // the finger drifts (a pan) or lifts early. If it fires, the press was a
    // stationary hold — show the menu at that point.
    let pressTimer: ReturnType<typeof setTimeout> | null = null
    let pressStart: mapboxgl.Point | null = null
    const clearPress = () => {
      if (pressTimer) clearTimeout(pressTimer)
      pressTimer = null
      pressStart = null
    }
    map.on("touchstart", (e) => {
      if (e.points.length !== 1) return clearPress()
      pressStart = e.point
      pressTimer = setTimeout(() => {
        openContextMenu(e.lngLat)
        clearPress()
      }, LONG_PRESS_MS)
    })
    map.on("touchmove", (e) => {
      if (pressStart && e.point.dist(pressStart) > LONG_PRESS_MOVE_PX) clearPress()
    })
    map.on("touchend", clearPress)
    map.on("touchcancel", clearPress)

    // Fires on the initial load and after each setStyle. Re-add our layers each
    // time; frame the territory only on the first load.
    map.on("style.load", () => {
      addLayers()
      if (loadedRef.current) return

      // Frame the area, if there is one. Fit to the actual cells (the grid-disk
      // can reach a little past the nominal radius), falling back to the
      // boundary before any cells exist.
      const c = centerRef.current
      const r = radiusKmRef.current
      if (c && r != null) {
        const boundary = buildBoundary(c, r, AREA_SHAPE, AREA_HEX_ROTATION_DEG)
        const frame = outlineRef.current.features.length ? outlineRef.current : boundary
        map.fitBounds(turf.bbox(frame) as [number, number, number, number], {
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
    const frame = outline.features.length ? outline : boundary
    map.fitBounds(turf.bbox(frame) as [number, number, number, number], {
      padding: 40,
      duration: 600,
    })
  }, [center, radiusKm, outline])

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
        Set VITE_MAPBOX_TOKEN in .env to load the map.
      </div>
    )
  }

  return <div ref={containerRef} className="h-full w-full" />
}
