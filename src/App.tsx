import { useMemo, useState, type ReactNode } from "react"
import { Check, ChevronDown, ChevronUp, Copy, Share2, X } from "lucide-react"
import type { FeatureCollection, Point } from "geojson"
import { MapView } from "@/components/MapView"
import { RingGauge } from "@/components/RingGauge"
import { TerritoryEditor } from "@/components/TerritoryEditor"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { INAT_MAX_PAGES, MAPBOX_TOKEN } from "@/config"
import { buildCellsOutline, buildHexGrid, markObservedCells } from "@/lib/hexgrid"
import { useObservations } from "@/lib/useObservations"
import { useSettings } from "@/lib/settingsStore"
import { useTerritoryStore } from "@/lib/territoryStore"
import {
  categoryLabel,
  cellResolution,
  centerLngLat,
  defaultDraft,
  parseTerritoryFromUrl,
  radiusKm,
  resolveYear,
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
  // Collapse the panel down to just its header (handy on small screens).
  const [collapsed, setCollapsed] = useState(false)
  // Whether the share panel (URL + copy button) is open, and a short-lived
  // "copied" confirmation.
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState(false)

  const setSaved = useTerritoryStore((s) => s.setSaved)
  const savedTerritory = useTerritoryStore((s) => s.saved)

  // Derived values that feed the geometry and the iNat query. Null while there's
  // no active territory.
  const center = useMemo(() => (active ? centerLngLat(active) : null), [active])
  const rKm = useMemo(() => (active ? radiusKm(active) : null), [active])
  const cellRes = useMemo(() => (active ? cellResolution(active) : null), [active])

  // Observation filters fed to the iNat query. `year` resolves "current"/"last"
  // to a concrete year; empty `categories` means all categories.
  const year = useMemo(
    () => (active ? resolveYear(active, new Date().getFullYear()) : null),
    [active],
  )
  const categories = useMemo(() => active?.categories ?? [], [active])

  const cells = useMemo(
    () =>
      center && rKm != null && cellRes != null
        ? buildHexGrid(center, rKm, cellRes)
        : [],
    [center, rKm, cellRes],
  )

  // Outer contour of the whole grid, drawn as a frame. Depends only on the
  // cell geometry, so it's recomputed on a territory change, not when
  // observations arrive.
  const outline = useMemo(() => buildCellsOutline(cells), [cells])

  // One-time notice that obscured-location observations are excluded.
  const obscuredNoticeDismissed = useSettings((s) => s.obscuredNoticeDismissed)
  const dismissObscuredNotice = useSettings((s) => s.dismissObscuredNotice)

  // The query is disabled when there's no username (i.e. no active territory),
  // so the placeholder center/radius are never actually used.
  const obs = useObservations(
    active?.username ?? "",
    center ?? [0, 0],
    rKm ?? 0,
    INAT_MAX_PAGES,
    year,
    categories,
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
    setLoadedFromUrl(false)
    setEditing(false)
    // The share panel's URL is derived from `active`; close it so a stale link
    // isn't left showing after an edit.
    setSharing(false)
  }

  // Shareable link for the active territory — the current page URL with the
  // territory encoded as query params. Built on demand (the address bar is no
  // longer updated automatically). Null while there's no active territory.
  const shareUrl = active
    ? window.location.origin + window.location.pathname + serializeTerritoryToUrl(active)
    : null

  async function handleCopy() {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be denied; the URL stays visible to copy manually.
    }
  }

  return (
    <div className="relative h-dvh w-screen overflow-hidden">
      <MapView grid={grid} outline={outline} points={points} center={center} radiusKm={rKm} />

      <Card className="absolute left-4 top-4 z-10 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col overflow-y-auto bg-background/95 backdrop-blur sm:w-80">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <HexMark />
              iNat Territory
            </span>
            <div className="flex items-center gap-2">
              <StatusBadge state={obsState(obs)} />
              <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                aria-label={collapsed ? "Expand panel" : "Collapse panel"}
                aria-expanded={!collapsed}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {collapsed ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronUp className="size-4" />
                )}
              </button>
            </div>
          </CardTitle>
        </CardHeader>
        {!collapsed && (
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
              {/* Progress hero — the ring gauge carries the headline number. */}
              {!MAPBOX_TOKEN ? (
                <p className="text-destructive">
                  Missing VITE_MAPBOX_TOKEN — add it to your .env file.
                </p>
              ) : obs.isError ? (
                <p className="text-destructive">
                  {obs.error instanceof Error ? obs.error.message : "Failed to load observations."}
                </p>
              ) : (
                <div className="flex items-center gap-4 py-1">
                  <RingGauge pct={coverage} muted={obs.isPending} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Cells claimed
                    </div>
                    <div className="mt-0.5 font-mono text-2xl font-bold tabular-nums">
                      {obs.isPending ? "—" : highlightedCells}
                      <span className="font-medium text-muted-foreground">
                        {" "}/ {cells.length}
                      </span>
                    </div>
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-inat/10 px-2.5 py-1 text-xs font-semibold text-inat-strong">
                      <span className="font-mono tabular-nums">
                        {obs.isPending ? "…" : matched.length}
                      </span>{" "}
                      observations
                    </span>
                  </div>
                </div>
              )}

              {!obscuredNoticeDismissed && (
                <div className="relative rounded-md border border-border bg-muted/50 px-3 py-2 pr-7 text-xs text-muted-foreground">
                  Observations with obscured locations aren’t included.
                  <button
                    type="button"
                    onClick={dismissObscuredNotice}
                    aria-label="Dismiss notice"
                    className="absolute right-1.5 top-1.5 rounded p-0.5 hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}

              <hr className="border-border" />

              <div className="space-y-px">
                <Row
                  label="iNat user"
                  value={
                    <a
                      href={`https://www.inaturalist.org/observations?place_id=any&user_id=${encodeURIComponent(active.username)}&verifiable=any`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-inat-strong underline-offset-2 hover:underline"
                    >
                      @{active.username}
                    </a>
                  }
                />
                <Row label="Center" value={`${active.lat}, ${active.lng}`} mono />
                <Row label="Radius" value={`${active.radius} ${active.units}`} mono />
                <Row
                  label="Cell size"
                  value={active.cellSize[0].toUpperCase() + active.cellSize.slice(1)}
                />
                <Row
                  label="Year"
                  value={active.year === "all" ? "All years" : String(year)}
                />
                <Row
                  label="Categories"
                  value={
                    active.categories.length === 0
                      ? "All"
                      : active.categories.map(categoryLabel).join(", ")
                  }
                />
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setEditing(true)}
                >
                  Edit territory
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSharing(true)}
                >
                  <Share2 />
                  Share
                </Button>
              </div>

              <Dialog open={sharing} onOpenChange={setSharing}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Share territory</DialogTitle>
                    <DialogDescription>
                      This link opens the map on your current territory.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={shareUrl ?? ""}
                      onFocus={(e) => e.currentTarget.select()}
                      className="text-xs"
                      aria-label="Shareable link"
                    />
                    <Button
                      size="icon-sm"
                      variant="outline"
                      onClick={handleCopy}
                      aria-label={copied ? "Copied" : "Copy link"}
                      title={copied ? "Copied" : "Copy link"}
                    >
                      {copied ? <Check /> : <Copy />}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          ) : null}
        </CardContent>
        )}
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

function Row({
  label,
  value,
  mono = false,
}: {
  label: string
  value: ReactNode
  /** Render the value in the mono face — for coordinates and measurements. */
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="shrink-0 whitespace-nowrap text-muted-foreground">{label}</span>
      <span
        className={`truncate text-right font-medium ${mono ? "font-mono tabular-nums" : ""}`}
      >
        {value}
      </span>
    </div>
  )
}

/** Small iNat-green hexagon — the app's honeycomb metaphor as a brand mark. */
function HexMark() {
  return (
    <span
      aria-hidden
      className="size-3.5 shrink-0 bg-inat"
      style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}
    />
  )
}

function StatusBadge({ state }: { state: ObsState }) {
  if (state === "loading") return <Badge variant="secondary">Loading…</Badge>
  if (state === "error") return <Badge variant="destructive">Error</Badge>
  return null
}

export default App
