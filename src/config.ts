/**
 * Prototype configuration.
 * Tweak these constants to change the area, grid resolution, and iNat user.
 */

import type { Units, CellSize } from "./lib/territory";

// --- Mapbox ---------------------------------------------------------------
// Public access token, read from .env (VITE_MAPBOX_TOKEN=...)
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

// Base map style, and the satellite style toggled via the on-map button.
export const MAP_STYLE = "mapbox://styles/mapbox/outdoors-v12";
export const SATELLITE_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

// --- Area of interest -----------------------------------------------------
// The center is part of each user's territory (set in the UI / shared via URL),
// not a config constant — there's no hardcoded fallback location.

// Shape of the area *boundary* outline (drawn only when SHOW_RADIUS is true) and
// the region the map frames on. Cells themselves are no longer clipped to this
// shape — the territory is a grid-disk (see "Honeycomb grid" below), so this
// only affects the optional outline and the fitBounds framing.
//  - "hexagon": a large hexagon around the center.
//  - "circle":  a circle of RADIUS_KM around the center.
export const AREA_SHAPE: import("./lib/hexgrid").AreaShape = "hexagon";

// Rotation (degrees) of the bounding hexagon outline, when AREA_SHAPE is
// "hexagon". Affects only the SHOW_RADIUS outline, not the cells.
//   0  = vertices N/S  → pointy top & bottom, flat left/right sides
//   30 = vertices E/W  → flat top & bottom, points to the east and west
export const AREA_HEX_ROTATION_DEG = 30;

// Default radius suggested for a fresh territory, per display unit. Kept as
// round numbers per unit (rather than converting one into the other) so the
// editor never seeds an awkward value like "4.97 mi". This is the
// center-to-vertex distance (circumradius) for a hexagon, or the radius for a
// circle; iNaturalist observations are queried within a circle of this radius.
export const DEFAULT_RADIUS: Record<Units, number> = { mi: 5, km: 8 };

// Whether to draw the outline marking the area boundary on the map.
export const SHOW_RADIUS = false;

// Style of the radius circle outline (used only when SHOW_RADIUS is true).
// `dash` is a Mapbox dash pattern, e.g. [2, 2]; use [] for a solid line.
export const RADIUS_STYLE = {
  color: "#2563eb",
  width: 1.5,
  opacity: 0.9,
  dash: [2, 2] as number[],
};

// --- Honeycomb grid -------------------------------------------------------
// Cells come from H3 (https://h3geo.org), a fixed global hexagonal tiling of
// the Earth. This makes the grid deterministic: a given lat/lng always maps to
// the same cell for every user, so two overlapping territories light up the
// exact same cells. A territory is the set of cells whose centers fall inside a
// hexagon (centered on the middle cell, rotated to match the cells' own tilt),
// so the macro shape mirrors the unit cells — a flat-topped hexagon-of-hexagons.
//
// Cell-size categories offered in the editor → H3 resolution. H3 resolutions
// are discrete (~2.6x apart), so these are the nearest stops to the old
// 0.5 / 1.0 / 2.0 km edges — see the avg edge length in each comment.
//   res 8 ≈ 0.53 km edge · res 7 ≈ 1.41 km edge · res 6 ≈ 3.72 km edge
export const CELL_SIZE_RES: Record<CellSize, number> = {
  small: 8,
  medium: 7,
  large: 6,
};

// Cell size used for a fresh territory.
export const DEFAULT_CELL_SIZE: CellSize = "medium";

// Default display units for a fresh territory: miles for US English, else km.
export function defaultUnits(): Units {
  return typeof navigator !== "undefined" && navigator.language === "en-US" ? "mi" : "km";
}

// Style of the honeycomb cell borders. The dark slate reads well on the base
// map but vanishes against satellite imagery, so the satellite variant switches
// to a bright red — drawn at full opacity, a little wider, and over a dark
// casing (see HEX_SATELLITE_CASING) so the thin lines stay legible on imagery.
export const HEX_BORDER_STYLE = {
  color: "#334155",
  width: 0.75,
  opacity: 0.6,
};
export const HEX_BORDER_STYLE_SATELLITE = {
  color: "#fca5a5",
  width: 1.1,
  opacity: 1,
};

// Style of the frame that traces the outer contour of the whole grid — a
// slightly darker, heavier line than the per-cell borders so the territory
// reads as a single framed shape. The satellite variant uses a bright red over
// the same dark casing to stay legible over imagery.
export const HEX_FRAME_STYLE = {
  color: "#1e293b",
  width: 2,
  opacity: 0.85,
};
export const HEX_FRAME_STYLE_SATELLITE = {
  color: "#ef4444",
  width: 2.5,
  opacity: 1,
};

// Dark halo drawn *beneath* the satellite-mode lines: a wider, semi-transparent
// black casing that separates the bright line from whatever is under it. The
// casing width is the line's own width plus `widthDelta`.
export const HEX_SATELLITE_CASING = {
  color: "#0a0a0a",
  opacity: 0.55,
  widthDelta: 2,
};

// --- iNaturalist ----------------------------------------------------------
// The iNat login (username) whose observations light up cells is part of each
// user's territory (set in the UI), not a config constant — no default user.

// Max pages of observations to fetch (200 per page). Caps the prototype's
// network usage for very prolific users.
export const INAT_MAX_PAGES = 10;
