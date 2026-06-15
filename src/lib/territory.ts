import {
  CELL_SIZE_RES,
  DEFAULT_CELL_SIZE,
  DEFAULT_RADIUS,
  defaultUnits,
} from "@/config"
import { toKm } from "./units"

export type Units = "mi" | "km"
export type CellSize = "xxsmall" | "xsmall" | "small" | "medium" | "large" | "xlarge"

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
 * Cached coverage stats for a territory, snapshotted from the last time it was
 * the active (on-map) territory. Lets the list show each card's numbers without
 * re-fetching observations for every territory. Absent until first computed.
 */
export interface TerritoryStats {
  cellsClaimed: number
  cellsTotal: number
  observations: number
  /** 0–100, rounded. */
  percentClaimed: number
}

/**
 * A user's "territory" — everything editable in the UI. Stored in display units
 * (km derivations happen at the geometry/API edge). Persisted to the territory
 * store and round-tripped through the URL for sharing.
 */
export interface Territory {
  /** Stable identity, assigned on creation. */
  id: string
  /** User-facing label, e.g. "Home patch". */
  name: string
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
  /** Epoch ms of the last create/edit — drives the "updated" meta line. */
  updatedAt: number
  /** Last-known coverage snapshot for the list cards. */
  stats?: TerritoryStats
}

/** Mint a unique territory id. */
export function newTerritoryId(): string {
  return crypto.randomUUID()
}

const CELL_SIZES: CellSize[] = ["xxsmall", "xsmall", "small", "medium", "large", "xlarge"]

/**
 * A not-yet-complete territory used to seed the editor for a brand-new entry.
 * `lat`/`lng` are null and `username` is empty until the user fills them in —
 * these can't be saved, but they give the form valid starting units/radius/cell
 * size. A full {@link Territory} is structurally assignable to this.
 */
export interface TerritoryDraft {
  name: string
  lat: number | null
  lng: number | null
  username: string
  units: Units
  radius: number
  cellSize: CellSize
  year: YearFilter
  categories: Category[]
}

/** The fields the editor produces on save — identity/timestamp are added by
 * the store, not the form. */
export type TerritoryInput = Omit<Territory, "id" | "updatedAt" | "stats">

/**
 * Starting point for creating a territory from scratch: no name, location, or
 * username yet, with the locale's default units and a round default radius.
 */
export function defaultDraft(): TerritoryDraft {
  const units = defaultUnits()
  return {
    name: "",
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

/** Seed a create-form draft from an existing territory (e.g. a shared one). */
export function draftFrom(t: Territory): TerritoryDraft {
  return {
    name: t.name,
    lat: t.lat,
    lng: t.lng,
    username: t.username,
    units: t.units,
    radius: t.radius,
    cellSize: t.cellSize,
    year: t.year,
    categories: t.categories,
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

/** H3 resolution for the chosen cell-size category. */
export function cellResolution(t: Territory): number {
  return CELL_SIZE_RES[t.cellSize]
}

/**
 * Resolve the year filter to a concrete year, or null for "all years".
 * `currentYear` is passed in (rather than read here) to keep this pure.
 */
export function resolveYear(t: Territory, currentYear: number): number | null {
  if (t.year === "all") return null
  return t.year === "current" ? currentYear : currentYear - 1
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

/** Display name for a shared territory whose link carried no name. */
export const SHARED_FALLBACK_NAME = "Shared territory"

/**
 * Read a complete territory from a URL query string. Requires a valid `lat`,
 * `lng`, AND `username` (the three fields with no default) — if any is missing
 * the link doesn't encode a renderable territory and this returns null. The
 * remaining fields fall back per-field to the locale/config defaults.
 *
 * The result is transient (a shared territory the user is previewing), so it
 * gets a fresh id and `updatedAt` but is never persisted unless the user saves.
 */
export function parseTerritoryFromUrl(search: string): Territory | null {
  const p = new URLSearchParams(search)
  const ll = parseLatLng(`${p.get("lat") ?? ""}, ${p.get("lng") ?? ""}`)
  if (!ll) return null

  const username = p.get("u")?.trim()
  if (!username) return null

  const name = p.get("n")?.trim() ?? ""

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

  return {
    id: newTerritoryId(),
    name,
    lat: ll.lat,
    lng: ll.lng,
    username,
    units,
    radius,
    cellSize,
    year,
    categories,
    updatedAt: Date.now(),
  }
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
  if (t.name.trim()) p.set("n", t.name.trim())
  // Only encode non-default filters to keep shared URLs tidy.
  if (t.year !== "all") p.set("y", t.year)
  if (t.categories.length) p.set("cat", t.categories.join(","))
  return `?${p.toString()}`
}

// --- Import / export (JSON file) -----------------------------------------

const EXPORT_VERSION = 1
const UNITS: Units[] = ["mi", "km"]
const YEARS: YearFilter[] = ["all", "current", "last"]

/** A territory minus its cached coverage snapshot (derived data, recomputed on
 * demand after import) and `updatedAt` (unused by import, re-minted on load). */
export type ExportedTerritory = Omit<Territory, "stats" | "updatedAt">

/** Envelope written to (and accepted from) the export file. */
export interface TerritoryExportFile {
  app: "inat-territory"
  version: number
  exportedAt: string
  territories: ExportedTerritory[]
}

/** Filename for an export, stamped with the local date: inat-territories-YYYY-MM-DD.json */
export function exportFilename(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `inat-territories-${y}-${m}-${d}.json`
}

/** Drop derived/transient fields (stats, updatedAt) so they stay out of the file. */
function toExported(t: Territory): ExportedTerritory {
  return {
    id: t.id,
    name: t.name,
    lat: t.lat,
    lng: t.lng,
    username: t.username,
    units: t.units,
    radius: t.radius,
    cellSize: t.cellSize,
    year: t.year,
    categories: t.categories,
  }
}

/** Serialize the user's territories to the export JSON (pretty-printed, no stats). */
export function serializeTerritoriesExport(territories: Territory[]): string {
  const file: TerritoryExportFile = {
    app: "inat-territory",
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    territories: territories.map(toExported),
  }
  return JSON.stringify(file, null, 2)
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v)
}

/**
 * Validate + normalize one record from an import file into a {@link Territory}.
 * Returns null when a required field (lat/lng/username) is missing or invalid;
 * absent optional fields fall back to the same defaults the editor would use.
 * A record's `id` is preserved when present so re-imports overwrite in place,
 * and minted fresh otherwise.
 */
function parseTerritoryRecord(raw: unknown): Territory | null {
  if (typeof raw !== "object" || raw === null) return null
  const r = raw as Record<string, unknown>

  if (!isFiniteNumber(r.lat) || r.lat < -90 || r.lat > 90) return null
  if (!isFiniteNumber(r.lng) || r.lng < -180 || r.lng > 180) return null
  if (typeof r.username !== "string" || !r.username.trim()) return null

  const units: Units = UNITS.includes(r.units as Units)
    ? (r.units as Units)
    : defaultUnits()
  const radius =
    isFiniteNumber(r.radius) && r.radius > 0 ? r.radius : DEFAULT_RADIUS[units]
  const cellSize: CellSize = CELL_SIZES.includes(r.cellSize as CellSize)
    ? (r.cellSize as CellSize)
    : DEFAULT_CELL_SIZE
  const year: YearFilter = YEARS.includes(r.year as YearFilter)
    ? (r.year as YearFilter)
    : "all"
  const categories: Category[] = Array.isArray(r.categories)
    ? r.categories.filter((c): c is Category =>
        CATEGORY_VALUES.includes(c as Category),
      )
    : []

  return {
    id: typeof r.id === "string" && r.id ? r.id : newTerritoryId(),
    name: typeof r.name === "string" ? r.name : "",
    lat: r.lat,
    lng: r.lng,
    username: r.username.trim(),
    units,
    radius,
    cellSize,
    year,
    categories,
    updatedAt: Date.now(),
  }
}

/** Outcome of parsing an import file. */
export interface ImportParseResult {
  territories: Territory[]
  /** Records that were present but failed validation. */
  skipped: number
}

/**
 * Parse the JSON text of an export file into valid territories. Accepts either
 * the {@link TerritoryExportFile} envelope or a bare array of records. Throws if
 * the text isn't JSON or has no recognizable territories list.
 */
export function parseTerritoriesImport(text: string): ImportParseResult {
  const data: unknown = JSON.parse(text)
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as TerritoryExportFile)?.territories)
      ? (data as TerritoryExportFile).territories
      : null
  if (!list) throw new Error("Unrecognized file format")

  const territories: Territory[] = []
  let skipped = 0
  for (const raw of list) {
    const t = parseTerritoryRecord(raw)
    if (t) territories.push(t)
    else skipped++
  }
  return { territories, skipped }
}
