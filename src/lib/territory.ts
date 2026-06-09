import {
  CELL_SIZE_KM,
  DEFAULT_CELL_SIZE,
  DEFAULT_RADIUS,
  defaultUnits,
} from "@/config"
import { toKm } from "./units"

export type Units = "mi" | "km"
export type CellSize = "small" | "medium" | "large"

/** Which observation years to include. Stored as a choice (not a concrete year)
 * so "current"/"last" stay correct as time passes; resolved via {@link resolveYear}. */
export type YearFilter = "all" | "current" | "last"

/** iNaturalist iconic taxa we expose as filterable categories. */
export type Category =
  | "Aves"
  | "Amphibia"
  | "Reptilia"
  | "Mammalia"
  | "Actinopterygii"
  | "Mollusca"
  | "Arachnida"
  | "Insecta"
  | "Plantae"
  | "Fungi"
  | "Protozoa"

/**
 * The categories shown in the editor, mirroring iNaturalist's iconic-taxa
 * filter (order and labels included, minus its "Unknown" option). The `value`
 * is an iNaturalist `iconic_taxa` value passed straight to the API.
 */
export const CATEGORIES: { value: Category; label: string }[] = [
  { value: "Aves", label: "Birds" },
  { value: "Amphibia", label: "Amphibians" },
  { value: "Reptilia", label: "Reptiles" },
  { value: "Mammalia", label: "Mammals" },
  { value: "Actinopterygii", label: "Ray-Finned Fishes" },
  { value: "Mollusca", label: "Mollusks" },
  { value: "Arachnida", label: "Arachnids" },
  { value: "Insecta", label: "Insects" },
  { value: "Plantae", label: "Plants" },
  { value: "Fungi", label: "Fungi Including Lichens" },
  { value: "Protozoa", label: "Protozoans" },
]

const CATEGORY_VALUES = CATEGORIES.map((c) => c.value)
const CATEGORY_LABELS = new Map(CATEGORIES.map((c) => [c.value, c.label]))

/** Common-name label for a category value (falls back to the raw value). */
export function categoryLabel(value: Category): string {
  return CATEGORY_LABELS.get(value) ?? value
}

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
  /** Which years of observations to include. */
  year: YearFilter
  /** iconic-taxa filter; empty means all categories. */
  categories: Category[]
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
  year: YearFilter
  categories: Category[]
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
    year: "all",
    categories: [],
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

/**
 * Resolve the year filter to a concrete year, or null for "all years".
 * `currentYear` is passed in (rather than read here) to keep this pure.
 */
export function resolveYear(t: Territory, currentYear: number): number | null {
  if (t.year === "all") return null
  return t.year === "current" ? currentYear : currentYear - 1
}

// --- Equality ------------------------------------------------------------

const EPSILON = 1e-6

function numEq(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON
}

/** Order-insensitive equality for the category set. */
function categoriesEqual(a: Category[], b: Category[]): boolean {
  if (a.length !== b.length) return false
  const sortedB = [...b].sort()
  return [...a].sort().every((v, i) => v === sortedB[i])
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
    a.cellSize === b.cellSize &&
    a.year === b.year &&
    categoriesEqual(a.categories, b.categories)
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

  const y = p.get("y")
  const year: YearFilter = y === "current" || y === "last" ? y : "all"

  const catRaw = p.get("cat")
  const categories: Category[] = catRaw
    ? catRaw
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is Category => CATEGORY_VALUES.includes(s as Category))
    : []

  return { lat: ll.lat, lng: ll.lng, username, units, radius, cellSize, year, categories }
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
  // Only encode non-default filters to keep shared URLs tidy.
  if (t.year !== "all") p.set("y", t.year)
  if (t.categories.length) p.set("cat", t.categories.join(","))
  return `?${p.toString()}`
}
