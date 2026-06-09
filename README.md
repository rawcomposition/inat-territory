# iNat Territory

A prototype that draws a honeycomb (hex) grid over a Mapbox map within a fixed
radius and highlights any cell that contains an
[iNaturalist](https://www.inaturalist.org/) observation made by a given user.

Built with **Vite + React + TypeScript + Tailwind/shadcn + Mapbox GL + Turf.js**.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Add your Mapbox token to `.env` (already created, currently empty):

   ```
   VITE_MAPBOX_TOKEN=pk.your_public_token_here
   ```

   Get a free public token at https://account.mapbox.com/access-tokens/.

3. Run it:

   ```bash
   npm run dev
   ```

## Configuration

All tunable values live in [`src/config.ts`](src/config.ts):

| Constant            | Meaning                                                          |
| ------------------- | --------------------------------------------------------------- |
| `CENTER`            | `[longitude, latitude]` center of the search area               |
| `RADIUS_KM`         | Radius of the area (km). Also the iNat observation search radius |
| `HEX_CELL_SIZE_KM`  | Honeycomb cell size — length of one hexagon edge (km)           |
| `INAT_USERNAME`     | iNaturalist login whose observations light up cells             |
| `INAT_MAX_PAGES`    | Cap on observation pages fetched (200/page)                     |
| `MAP_STYLE`         | Mapbox base style URL                                           |

## How it works

1. `buildHexGrid` (Turf `hexGrid`) tiles the bounding box of the radius circle,
   keeping only hexagons whose centroid falls within `RADIUS_KM`.
2. `fetchObservations` queries the iNaturalist API for the user's georeferenced
   observations within the same radius.
3. `markObservedCells` flags every cell containing at least one observation
   (point-in-polygon), and those cells are filled green on the map.
