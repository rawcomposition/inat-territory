import {
  CELL_SIZE_KM,
  DEFAULT_CELL_SIZE,
  DEFAULT_RADIUS,
  defaultUnits,
} from "@/config"
import { toKm } from "./units"

export type Units = "mi" | "km"
export type CellSize = "small" | "medium" | "large"

/**
 * A user's "territory" — everything editable in the UI. Stored in display units
 * (km derivations happen at the geometry/API edge). Persisted to the territory
 * store and round-tripped through the URL for sharing.
 */
export interface Territory {
  /** User-facing [lat, lng] convention. */
  lat: number
  lng: number
  username: string
  units: Units
  /** Radius expressed in `units`. */
  radius: number
  cellSize: CellSize
}

const CELL_SIZES: CellSize[] = ["small", "medium", "large"]

/**
 * A not-yet-complete territory used to seed the editor for a brand-new entry.
 * `lat`/`lng` are null and `username` is empty until the user fills them in —
 * these can't be saved, but they give the form valid starting units/radius/cell
 * size. A full {@link Territory} is structurally assignable to this.
 */
export interface TerritoryDraft {
  lat: number | null
  lng: number | null
  username: string
  units: Units
  radius: number
  cellSize: CellSize
}

/**
 * Starting point for creating a territory from scratch: no location or
 * username yet, with the locale's default units and a round default radius.
 */
export function defaultDraft(): TerritoryDraft {
  const units = defaultUnits()
  return {
    lat: null,
    lng: null,
    username: "",
    units,
    radius: DEFAULT_RADIUS[units],
    cellSize: DEFAULT_CELL_SIZE,
  }
}

// --- Derivations (never stored) ------------------------------------------

/** [lng, lat] form for Mapbox / Turf / GeoJSON. */
export function centerLngLat(t: Territory): [number, number] {
  return [t.lng, t.lat]
}

/** Radius in kilometers, for geometry and the iNat API. */
export function radiusKm(t: Territory): number {
  return toKm(t.radius, t.units)
}

/** Cell edge length in kilometers for the chosen category. */
export function cellSideKm(t: Territory): number {
  return CELL_SIZE_KM[t.cellSize]
}

// --- Equality ------------------------------------------------------------

const EPSILON = 1e-6

function numEq(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON
}

/**
 * Field-by-field equality with an epsilon for numeric fields, so a mi↔km
 * round-trip that nets back to the same value doesn't read as "different".
 */
export function territoryEquals(a: Territory, b: Territory): boolean {
  return (
    numEq(a.lat, b.lat) &&
    numEq(a.lng, b.lng) &&
    a.username === b.username &&
    a.units === b.units &&
    numEq(a.radius, b.radius) &&
    a.cellSize === b.cellSize
  )
}

// --- Parsing / validation ------------------------------------------------

/**
 * Parse the combined "lat, lng" field. Returns null on anything invalid.
 * Order is [lat, lng] (the user-facing convention).
 */
export function parseLatLng(raw: string): { lat: number; lng: number } | null {
  const parts = raw.split(",")
  if (parts.length !== 2) return null
  const lat = Number(parts[0].trim())
  const lng = Number(parts[1].trim())
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

// --- URL round-trip ------------------------------------------------------

function round(value: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(value * f) / f
}

/**
 * Read a complete territory from a URL query string. Requires a valid `lat`,
 * `lng`, AND `username` (the three fields with no default) — if any is missing
 * the link doesn't encode a renderable territory and this returns null. The
 * remaining fields fall back per-field to the locale/config defaults.
 */
export function parseTerritoryFromUrl(search: string): Territory | null {
  const p = new URLSearchParams(search)
  const ll = parseLatLng(`${p.get("lat") ?? ""}, ${p.get("lng") ?? ""}`)
  if (!ll) return null

  const username = p.get("u")?.trim()
  if (!username) return null

  const un = p.get("un")
  const units: Units = un === "mi" || un === "km" ? un : defaultUnits()

  const rRaw = p.get("r")
  const r = rRaw == null ? NaN : Number(rRaw)
  const radius = Number.isFinite(r) && r > 0 ? r : DEFAULT_RADIUS[units]

  const c = p.get("c")
  const cellSize: CellSize = CELL_SIZES.includes(c as CellSize)
    ? (c as CellSize)
    : DEFAULT_CELL_SIZE

  return { lat: ll.lat, lng: ll.lng, username, units, radius, cellSize }
}

/** Serialize a territory to a query string (leading "?"), with tidy precision. */
export function serializeTerritoryToUrl(t: Territory): string {
  const p = new URLSearchParams({
    lat: String(round(t.lat, 5)),
    lng: String(round(t.lng, 5)),
    u: t.username,
    un: t.units,
    r: String(round(t.radius, 2)),
    c: t.cellSize,
  })
  return `?${p.toString()}`
}
