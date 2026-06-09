/**
 * Prototype configuration.
 * Tweak these constants to change the area, grid resolution, and iNat user.
 */

import type { Units, CellSize } from "./lib/territory";

// --- Mapbox ---------------------------------------------------------------
// Public access token, read from .env (VITE_MAPBOX_TOKEN=...)
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

// Base map style.
export const MAP_STYLE = "mapbox://styles/mapbox/outdoors-v12";

// --- Area of interest -----------------------------------------------------
// The center is part of each user's territory (set in the UI / shared via URL),
// not a config constant — there's no hardcoded fallback location.

// Shape of the overall area the grid covers:
//  - "hexagon": cells within a large hexagon — shares the honeycomb's 6-fold
//               symmetry, so the grid reads as an intentional hex tile.
//  - "circle":  cells within RADIUS_KM of center (continuous, bumpy edge).
export const AREA_SHAPE: import("./lib/hexgrid").AreaShape = "hexagon";

// Rotation (degrees) of the bounding hexagon, when AREA_SHAPE is "hexagon".
//   0  = vertices N/S  → pointy top & bottom, flat left/right sides
//   30 = vertices E/W  → flat top & bottom, points to the east and west
export const AREA_HEX_ROTATION_DEG = 30;

// How much of a perimeter cell must fall inside the boundary to keep it (0–1).
// Cells are always kept whole; this only decides which edge cells make the cut.
// Lower = fuller, chunkier disk; ~0.5 = balanced/roundest; higher = tighter.
export const CELL_FILL_THRESHOLD = 0.5;

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
// Size of each hexagon, expressed as the length of one hexagon edge in km.
// Smaller = more, finer cells. Larger = fewer, coarser cells.
export const HEX_CELL_SIZE_KM = 0.5;

// Cell-size categories offered in the editor → hexagon edge length in km.
// Tweak these to change what "small / medium / large" mean.
export const CELL_SIZE_KM: Record<CellSize, number> = {
  small: 0.5,
  medium: 1.0,
  large: 2.0,
};

// Cell size used for a fresh territory.
export const DEFAULT_CELL_SIZE: CellSize = "medium";

// Default display units for a fresh territory: miles for US English, else km.
export function defaultUnits(): Units {
  return typeof navigator !== "undefined" && navigator.language === "en-US" ? "mi" : "km";
}

// Style of the honeycomb cell borders.
export const HEX_BORDER_STYLE = {
  color: "#334155",
  width: 0.75,
  opacity: 0.6,
};

// Style of the frame that traces the outer contour of the whole grid — a
// slightly darker, heavier line than the per-cell borders so the territory
// reads as a single framed shape.
export const HEX_FRAME_STYLE = {
  color: "#1e293b",
  width: 2,
  opacity: 0.85,
};

// --- iNaturalist ----------------------------------------------------------
// The iNat login (username) whose observations light up cells is part of each
// user's territory (set in the UI), not a config constant — no default user.

// Max pages of observations to fetch (200 per page). Caps the prototype's
// network usage for very prolific users.
export const INAT_MAX_PAGES = 10;
