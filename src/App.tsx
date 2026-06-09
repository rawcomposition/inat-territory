import { useMemo, useState } from "react"
import type { FeatureCollection, Point } from "geojson"
import { MapView } from "@/components/MapView"
import { TerritoryEditor } from "@/components/TerritoryEditor"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  AREA_HEX_ROTATION_DEG,
  AREA_SHAPE,
  CELL_FILL_THRESHOLD,
  INAT_MAX_PAGES,
  MAPBOX_TOKEN,
} from "@/config"
import { buildHexGrid, markObservedCells } from "@/lib/hexgrid"
import { useObservations } from "@/lib/useObservations"
import { useSettings } from "@/lib/settingsStore"
import { useTerritoryStore } from "@/lib/territoryStore"
import {
  cellSideKm,
  centerLngLat,
  defaultDraft,
  parseTerritoryFromUrl,
  radiusKm,
  serializeTerritoryToUrl,
  territoryEquals,
  type Territory,
} from "@/lib/territory"

function App() {
  // Decide the active territory ONCE: a URL-encoded territory wins (and never
  // touches the persisted store); otherwise use the saved territory. With no
  // URL and nothing saved, there's no territory yet (`null`) → the map shows the
  // whole world and the editor opens for a first-time setup. Reading the store
  // via getState() (not a selector) keeps this out of the render-subscription
  // loop.
  const initial = useMemo(() => {
    const fromUrl = parseTerritoryFromUrl(window.location.search)
    if (fromUrl) return { active: fromUrl, fromUrl: true }
    return { active: useTerritoryStore.getState().saved, fromUrl: false }
  }, [])

  const [active, setActive] = useState<Territory | null>(initial.active)
  const [loadedFromUrl, setLoadedFromUrl] = useState(initial.fromUrl)
  // Open the editor automatically when there's no territory to show.
  const [editing, setEditing] = useState(initial.active == null)

  const setSaved = useTerritoryStore((s) => s.setSaved)
  const savedTerritory = useTerritoryStore((s) => s.saved)

  // Derived values that feed the geometry and the iNat query. Null while there's
  // no active territory.
  const center = useMemo(() => (active ? centerLngLat(active) : null), [active])
  const rKm = useMemo(() => (active ? radiusKm(active) : null), [active])
  const cellKm = useMemo(() => (active ? cellSideKm(active) : null), [active])

  const cells = useMemo(
    () =>
      center && rKm != null && cellKm != null
        ? buildHexGrid(
            center,
            rKm,
            cellKm,
            AREA_SHAPE,
            AREA_HEX_ROTATION_DEG,
            CELL_FILL_THRESHOLD,
          )
        : [],
    [center, rKm, cellKm],
  )

  // Whether to draw cells without any finds — persisted in the settings store.
  const showIncomplete = useSettings((s) => s.showIncomplete)
  const setShowIncomplete = useSettings((s) => s.setShowIncomplete)

  // The query is disabled when there's no username (i.e. no active territory),
  // so the placeholder center/radius are never actually used.
  const obs = useObservations(
    active?.username ?? "",
    center ?? [0, 0],
    rKm ?? 0,
    INAT_MAX_PAGES,
  )
  const observations = useMemo(() => obs.data ?? [], [obs.data])

  // Re-mark cells whenever observations arrive/change. `matched` is the subset
  // of observations that land inside a cell — observations outside the hexagon
  // are dropped from both the map and the stats.
  const { grid, matched } = useMemo(
    () => markObservedCells(cells, observations),
    [cells, observations],
  )

  const points = useMemo<FeatureCollection<Point>>(
    () => ({
      type: "FeatureCollection",
      features: matched.map((o) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: o.coords },
        properties: { id: o.id, species: o.speciesGuess },
      })),
    }),
    [matched],
  )

  const highlightedCells = grid.features.filter((f) => f.properties.highlighted).length
  const coverage =
    cells.length > 0 ? Math.round((highlightedCells / cells.length) * 100) : 0

  // Warn before overwriting only when the open territory came from a shared URL
  // AND the user already has a different saved territory.
  const showOverwriteWarning =
    loadedFromUrl &&
    savedTerritory != null &&
    active != null &&
    !territoryEquals(savedTerritory, active)

  function handleSave(next: Territory) {
    setActive(next)
    setSaved(next)
    window.history.replaceState(null, "", serializeTerritoryToUrl(next))
    setLoadedFromUrl(false)
    setEditing(false)
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <MapView grid={grid} points={points} showIncomplete={showIncomplete} center={center} radiusKm={rKm} />

      <Card className="absolute left-4 top-4 z-10 w-80 bg-background/95 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>iNat Territory</span>
            <StatusBadge state={obsState(obs)} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {editing ? (
            <TerritoryEditor
              initial={active ?? defaultDraft()}
              showOverwriteWarning={showOverwriteWarning}
              onSave={handleSave}
              onCancel={active ? () => setEditing(false) : undefined}
            />
          ) : active ? (
            <>
              <Row label="iNat user" value={`@${active.username}`} />
              <Row label="Center (lat, lng)" value={`${active.lat}, ${active.lng}`} />
              <Row label="Radius" value={`${active.radius} ${active.units}`} />
              <Row
                label="Cell size"
                value={active.cellSize[0].toUpperCase() + active.cellSize.slice(1)}
              />

              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => setEditing(true)}
              >
                Edit territory
              </Button>

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
                    value={obs.isPending ? "loading…" : String(matched.length)}
                  />
                  <Row
                    label="Progress"
                    value={
                      obs.isPending
                        ? "—"
                        : `${highlightedCells} / ${cells.length} (${coverage}%)`
                    }
                  />
                </>
              )}

              <hr className="border-border" />

              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="show-incomplete" className="text-muted-foreground">
                  Show incomplete cells
                </Label>
                <Switch
                  id="show-incomplete"
                  checked={showIncomplete}
                  onCheckedChange={setShowIncomplete}
                  className="data-checked:bg-green-600"
                />
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

type ObsState = "loading" | "error" | "idle"

function obsState(obs: ReturnType<typeof useObservations>): ObsState {
  if (obs.isError) return "error"
  // isLoading (not isPending) so a disabled query — no active territory — reads
  // as idle rather than perpetually "loading".
  if (obs.isLoading) return "loading"
  return "idle"
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
  return null
}

export default App
