import { useMemo } from "react"
import type { FeatureCollection, Point } from "geojson"
import { MapView } from "@/components/MapView"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  AREA_HEX_ROTATION_DEG,
  AREA_SHAPE,
  CELL_FILL_THRESHOLD,
  CENTER,
  CENTER_LNGLAT,
  HEX_CELL_SIZE_KM,
  INAT_MAX_PAGES,
  INAT_USERNAME,
  MAPBOX_TOKEN,
  RADIUS_KM,
} from "@/config"
import { buildHexGrid, markObservedCells } from "@/lib/hexgrid"
import { useObservations } from "@/lib/useObservations"

function App() {
  // The honeycomb grid only depends on static config, so build it once.
  const cells = useMemo(
    () =>
      buildHexGrid(
        CENTER_LNGLAT,
        RADIUS_KM,
        HEX_CELL_SIZE_KM,
        AREA_SHAPE,
        AREA_HEX_ROTATION_DEG,
        CELL_FILL_THRESHOLD,
      ),
    [],
  )

  const obs = useObservations(INAT_USERNAME, CENTER_LNGLAT, RADIUS_KM, INAT_MAX_PAGES)
  const observations = useMemo(() => obs.data ?? [], [obs.data])

  // Re-mark cells whenever observations arrive/change.
  const grid = useMemo(
    () => markObservedCells(cells, observations),
    [cells, observations],
  )

  const points = useMemo<FeatureCollection<Point>>(
    () => ({
      type: "FeatureCollection",
      features: observations.map((o) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: o.coords },
        properties: { id: o.id, species: o.speciesGuess },
      })),
    }),
    [observations],
  )

  const highlightedCells = grid.features.filter((f) => f.properties.highlighted).length
  const coverage =
    cells.length > 0 ? Math.round((highlightedCells / cells.length) * 100) : 0

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <MapView grid={grid} points={points} />

      <Card className="absolute left-4 top-4 z-10 w-80 bg-background/95 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>iNat Territory</span>
            <StatusBadge state={obsState(obs)} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="iNat user" value={`@${INAT_USERNAME}`} />
          <Row label="Center (lat, lng)" value={`${CENTER[0]}, ${CENTER[1]}`} />
          <Row label="Radius" value={`${RADIUS_KM} km`} />
          <Row label="Hex edge size" value={`${HEX_CELL_SIZE_KM} km`} />

          <hr className="border-border" />

          {!MAPBOX_TOKEN ? (
            <p className="text-destructive">
              Missing VITE_MAPBOX_TOKEN — add it to your .env file.
            </p>
          ) : obs.isError ? (
            <p className="text-destructive">
              {obs.error instanceof Error ? obs.error.message : "Failed to load observations."}
            </p>
          ) : (
            <>
              <Row
                label="Observations"
                value={obs.isPending ? "loading…" : String(observations.length)}
              />
              <Row label="Total cells" value={String(cells.length)} />
              <Row
                label="Cells with finds"
                value={obs.isPending ? "—" : `${highlightedCells} (${coverage}%)`}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

type ObsState = "loading" | "ready" | "error"

function obsState(obs: ReturnType<typeof useObservations>): ObsState {
  if (obs.isError) return "error"
  if (obs.isPending) return "loading"
  return "ready"
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}

function StatusBadge({ state }: { state: ObsState }) {
  if (state === "loading") return <Badge variant="secondary">Loading…</Badge>
  if (state === "error") return <Badge variant="destructive">Error</Badge>
  return <Badge>Ready</Badge>
}

export default App
