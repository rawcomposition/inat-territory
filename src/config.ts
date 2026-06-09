/**
 * Prototype configuration.
 * Tweak these constants to change the area, grid resolution, and iNat user.
 */

// --- Mapbox ---------------------------------------------------------------
// Public access token, read from .env (VITE_MAPBOX_TOKEN=...)
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

// Base map style.
export const MAP_STYLE = "mapbox://styles/mapbox/outdoors-v12";

// --- Area of interest -----------------------------------------------------
// Center of the search area, as [latitude, longitude] — the order you get
// when copying a coordinate from Google Maps or iNaturalist.
export const CENTER: [number, number] = [33.58403949535706, -117.1847174951999];

// Internal [longitude, latitude] form used by Mapbox & GeoJSON, which expect
// lng,lat order. Derived from CENTER — don't edit this directly.
export const CENTER_LNGLAT: [number, number] = [CENTER[1], CENTER[0]];

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

// Size of the area, in kilometers. This is the center-to-vertex distance
// (circumradius) for a hexagon, or the radius for a circle.
// iNaturalist observations are queried within a circle of this radius.
export const RADIUS_KM = 8;

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

// Style of the honeycomb cell borders.
export const HEX_BORDER_STYLE = {
  color: "#334155",
  width: 1.25,
  opacity: 0.6,
};

// --- iNaturalist ----------------------------------------------------------
// The iNat login (username) whose observations should light up cells.
export const INAT_USERNAME = "rawcomposition";

// Max pages of observations to fetch (200 per page). Caps the prototype's
// network usage for very prolific users.
export const INAT_MAX_PAGES = 5;
