import { useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Copy,
  Download,
  MoreVertical,
  Plus,
  Upload,
  X,
} from "lucide-react"
import type { FeatureCollection, Point } from "geojson"
import { MapView } from "@/components/MapView"
import { TerritoryEditor } from "@/components/TerritoryEditor"
import { SharedTerritoryCard, TerritoryCard } from "@/components/TerritoryCard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { INAT_MAX_PAGES, MAPBOX_TOKEN } from "@/config"
import { buildCellsOutline, buildHexGrid, markObservedCells } from "@/lib/hexgrid"
import { useObservations } from "@/lib/useObservations"
import { useSettings } from "@/lib/settingsStore"
import { useTerritoryStore } from "@/lib/territoryStore"
import {
  cellResolution,
  centerLngLat,
  defaultDraft,
  draftFrom,
  exportFilename,
  parseTerritoriesImport,
  parseTerritoryFromUrl,
  radiusKm,
  resolveYear,
  serializeTerritoriesExport,
  serializeTerritoryToUrl,
  type Territory,
  type TerritoryDraft,
  type TerritoryInput,
  type TerritoryStats,
} from "@/lib/territory"

/** What the editor is doing when open. */
interface EditorState {
  mode: "create" | "edit"
  /** The territory being edited (edit mode only). */
  id: string | null
  initial: TerritoryDraft
  /** Opened via the shared card's "Save territory" — clears the share on save. */
  fromShared: boolean
}

function App() {
  // A territory encoded in the URL is a transient preview — never persisted
  // unless the user explicitly saves it. Parsed once on mount.
  const [shared, setShared] = useState<Territory | null>(() =>
    parseTerritoryFromUrl(window.location.search),
  )
  // Whether the shared territory is the one currently drawn on the map. Starts
  // true when arriving via a shared link; flips off once the user picks one of
  // their own.
  const [previewShared, setPreviewShared] = useState(shared != null)

  const territories = useTerritoryStore((s) => s.territories)
  const activeId = useTerritoryStore((s) => s.activeId)
  const addTerritory = useTerritoryStore((s) => s.add)
  const updateTerritory = useTerritoryStore((s) => s.update)
  const removeTerritory = useTerritoryStore((s) => s.remove)
  const setActive = useTerritoryStore((s) => s.setActive)
  const setStats = useTerritoryStore((s) => s.setStats)
  const importTerritories = useTerritoryStore((s) => s.importTerritories)

  const [view, setView] = useState<"list" | "editor">("list")
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  // Share dialog (URL + copy) and a short-lived "copied" confirmation.
  const [shareTarget, setShareTarget] = useState<Territory | null>(null)
  const [copied, setCopied] = useState(false)
  // Territory pending delete confirmation. The Delete button is focused on open
  // (overriding Radix's default first-focusable) so Enter confirms.
  const [deleteTarget, setDeleteTarget] = useState<Territory | null>(null)
  const deleteButtonRef = useRef<HTMLButtonElement>(null)
  // Result/error notice shown after an import attempt.
  const [importNotice, setImportNotice] = useState<{
    title: string
    message: string
  } | null>(null)

  // The territory rendered on the map: the shared preview when active, else the
  // user's active saved territory (null → the map shows the whole world).
  const savedActive = useMemo(
    () => territories.find((t) => t.id === activeId) ?? null,
    [territories, activeId],
  )
  const mapTerritory: Territory | null =
    previewShared && shared ? shared : savedActive
  // The saved territory currently on the map, if any — the one whose stats we
  // refresh from the live query. Null when previewing a shared territory.
  const savedMapId = previewShared ? null : (savedActive?.id ?? null)

  // Derived geometry / query inputs. Null while there's no territory on the map.
  const center = useMemo(
    () => (mapTerritory ? centerLngLat(mapTerritory) : null),
    [mapTerritory],
  )
  const rKm = useMemo(
    () => (mapTerritory ? radiusKm(mapTerritory) : null),
    [mapTerritory],
  )
  const cellRes = useMemo(
    () => (mapTerritory ? cellResolution(mapTerritory) : null),
    [mapTerritory],
  )
  const year = useMemo(
    () => (mapTerritory ? resolveYear(mapTerritory, new Date().getFullYear()) : null),
    [mapTerritory],
  )
  const categories = useMemo(() => mapTerritory?.categories ?? [], [mapTerritory])

  const cells = useMemo(
    () =>
      center && rKm != null && cellRes != null
        ? buildHexGrid(center, rKm, cellRes)
        : [],
    [center, rKm, cellRes],
  )
  const outline = useMemo(() => buildCellsOutline(cells), [cells])

  const obscuredNoticeDismissed = useSettings((s) => s.obscuredNoticeDismissed)

  const obs = useObservations(
    mapTerritory?.username ?? "",
    center ?? [0, 0],
    rKm ?? 0,
    INAT_MAX_PAGES,
    year,
    categories,
  )
  const observations = useMemo(() => obs.data ?? [], [obs.data])

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
  const settled = !obs.isPending && !obs.isError

  // Live coverage for the territory currently on the map.
  const liveStats = useMemo<TerritoryStats | undefined>(
    () =>
      settled
        ? {
            cellsClaimed: highlightedCells,
            cellsTotal: cells.length,
            observations: matched.length,
            percentClaimed: coverage,
          }
        : undefined,
    [settled, highlightedCells, cells.length, matched.length, coverage],
  )

  // Cache the live coverage back onto the active saved territory so its list
  // card shows real numbers next time without re-fetching. setStats no-ops when
  // the snapshot is unchanged, so this won't loop.
  useEffect(() => {
    if (savedMapId && liveStats) setStats(savedMapId, liveStats)
  }, [savedMapId, liveStats, setStats])

  function clearUrlParams() {
    window.history.replaceState(null, "", window.location.pathname)
  }

  function dismissShared() {
    setShared(null)
    setPreviewShared(false)
    clearUrlParams()
  }

  function openCreate() {
    setEditor({ mode: "create", id: null, initial: defaultDraft(), fromShared: false })
    setView("editor")
  }

  function openEdit(t: Territory) {
    setEditor({ mode: "edit", id: t.id, initial: draftFrom(t), fromShared: false })
    setView("editor")
  }

  function openSaveShared() {
    if (!shared) return
    setEditor({ mode: "create", id: null, initial: draftFrom(shared), fromShared: true })
    setView("editor")
  }

  function handleEditorSave(input: TerritoryInput) {
    if (editor?.mode === "edit" && editor.id) {
      updateTerritory(editor.id, input)
    } else {
      addTerritory(input) // also makes the new territory active
      setPreviewShared(false)
      if (editor?.fromShared) dismissShared()
    }
    setEditor(null)
    setView("list")
  }

  function closeEditor() {
    setEditor(null)
    setView("list")
  }

  function confirmDelete() {
    if (!deleteTarget) return
    removeTerritory(deleteTarget.id)
    if (editor?.id === deleteTarget.id) closeEditor()
    setDeleteTarget(null)
  }

  function activateSaved(id: string) {
    setPreviewShared(false)
    setActive(id)
  }

  // Download the saved territories as a JSON file (cached stats omitted).
  function handleExport() {
    const blob = new Blob([serializeTerritoriesExport(territories)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = exportFilename()
    a.click()
    URL.revokeObjectURL(url)
  }

  // Pick a JSON file and upsert its territories (overwrite by id, add new ones).
  function handleImport() {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "application/json,.json"
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      let result: ReturnType<typeof parseTerritoriesImport>
      try {
        result = parseTerritoriesImport(await file.text())
      } catch {
        setImportNotice({
          title: "Import failed",
          message: "That file isn’t a valid territories export.",
        })
        return
      }
      const { territories: incoming, skipped } = result
      if (incoming.length === 0) {
        setImportNotice({
          title: "Nothing to import",
          message: "No valid territories were found in that file.",
        })
        return
      }
      importTerritories(incoming)
      if (skipped > 0) {
        setImportNotice({
          title: "Import complete",
          message: `Imported ${incoming.length} ${incoming.length === 1 ? "territory" : "territories"}. Skipped ${skipped} invalid ${skipped === 1 ? "entry" : "entries"}.`,
        })
      }
    }
    input.click()
  }

  // Shareable link for the share dialog's target territory.
  const shareUrl = shareTarget
    ? window.location.origin +
      window.location.pathname +
      serializeTerritoryToUrl(shareTarget)
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

  const isEditor = view === "editor" && editor != null
  const showEmpty = territories.length === 0 && !shared

  return (
    <div className="relative h-dvh w-screen overflow-hidden">
      <MapView grid={grid} outline={outline} points={points} center={center} radiusKm={rKm} />

      <Card className="absolute left-4 top-4 z-10 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col overflow-y-auto bg-background/95 backdrop-blur sm:w-[22rem]">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {isEditor ? (
                <button
                  type="button"
                  onClick={closeEditor}
                  aria-label="Back to territories"
                  className="-ml-1 grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ChevronLeft className="size-4" />
                </button>
              ) : (
                <HexMark />
              )}
              <span className="truncate text-base font-bold tracking-tight">
                {isEditor
                  ? editor.mode === "create"
                    ? "New territory"
                    : "Edit territory"
                  : "My territories"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {!isEditor && <StatusBadge state={obsState(obs)} />}
              {!isEditor && territories.length > 0 && (
                <span className="rounded-full bg-inat/10 px-2 py-0.5 font-mono text-xs font-bold text-inat-strong">
                  {territories.length}
                </span>
              )}
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
          </div>
        </CardHeader>

        {!collapsed && (
          <CardContent className="text-sm">
            {isEditor ? (
              <TerritoryEditor
                initial={editor.initial}
                mode={editor.mode}
                onSave={handleEditorSave}
                onCancel={closeEditor}
                onDelete={
                  editor.mode === "edit" && editor.id
                    ? () => {
                        const t = territories.find((x) => x.id === editor.id)
                        if (t) setDeleteTarget(t)
                      }
                    : undefined
                }
              />
            ) : (
              <div className="space-y-3">
                {!MAPBOX_TOKEN && (
                  <p className="text-xs text-destructive">
                    Missing VITE_MAPBOX_TOKEN — add it to your .env file.
                  </p>
                )}

                {showEmpty ? (
                  <EmptyState onNew={openCreate} onImport={handleImport} />
                ) : (
                  <>
                    <div className="space-y-2.5">
                      {shared && (
                        <SharedTerritoryCard
                          territory={shared}
                          active={previewShared}
                          stats={previewShared ? liveStats : undefined}
                          pending={previewShared && obs.isPending}
                          onActivate={() => setPreviewShared(true)}
                          onSave={openSaveShared}
                          onDismiss={dismissShared}
                        />
                      )}
                      {territories.map((t) => {
                        const onMap = t.id === savedMapId
                        return (
                          <TerritoryCard
                            key={t.id}
                            territory={t}
                            active={onMap}
                            stats={onMap && liveStats ? liveStats : t.stats}
                            pending={onMap && obs.isPending}
                            onActivate={() => activateSaved(t.id)}
                            onEdit={() => openEdit(t)}
                            onShare={() => setShareTarget(t)}
                            onDelete={() => setDeleteTarget(t)}
                          />
                        )
                      })}
                    </div>

                    {!obscuredNoticeDismissed && mapTerritory && <ObscuredNotice />}

                    <div className="flex gap-2">
                      <Button
                        className="flex-1 bg-inat text-white hover:bg-inat/90"
                        onClick={openCreate}
                      >
                        <Plus />
                        New territory
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label="Import or export territories"
                          >
                            <MoreVertical />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={handleImport}>
                            <Upload />
                            Import
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={handleExport}
                            disabled={territories.length === 0}
                          >
                            <Download />
                            Export
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Dialog open={shareTarget != null} onOpenChange={(o) => !o && setShareTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share territory</DialogTitle>
            <DialogDescription>
              This link opens the map on “{shareTarget?.name}”.
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

      <Dialog open={deleteTarget != null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            deleteButtonRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>Delete territory?</DialogTitle>
            <DialogDescription>
              “{deleteTarget?.name}” will be removed. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button ref={deleteButtonRef} variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importNotice != null}
        onOpenChange={(o) => !o && setImportNotice(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{importNotice?.title}</DialogTitle>
            <DialogDescription>{importNotice?.message}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setImportNotice(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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

function EmptyState({
  onNew,
  onImport,
}: {
  onNew: () => void
  onImport: () => void
}) {
  return (
    <div className="px-2 py-8 text-center">
      <span
        aria-hidden
        className="mx-auto mb-4 grid h-14 w-16 place-items-center bg-inat/10"
        style={{ clipPath: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)" }}
      >
        <Plus className="size-6 text-inat-strong" />
      </span>
      <div className="text-base font-bold">No territories yet</div>
      <p className="mx-auto mt-1.5 text-pretty text-[13px] leading-relaxed text-muted-foreground">
        Create your first territory to start claiming cells around a spot you
        explore.
      </p>
      <Button className="mt-5 w-full bg-inat text-white hover:bg-inat/90" onClick={onNew}>
        <Plus />
        New territory
      </Button>
      <Button variant="ghost" size="sm" className="mt-2" onClick={onImport}>
        <Upload />
        Import territories
      </Button>
    </div>
  )
}

function ObscuredNotice() {
  const dismiss = useSettings((s) => s.dismissObscuredNotice)
  return (
    <div className="relative rounded-md border border-border bg-muted/50 px-3 py-2 pr-7 text-xs text-muted-foreground">
      Observations with obscured locations aren’t included.
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss notice"
        className="absolute right-1.5 top-1.5 rounded p-0.5 hover:bg-muted hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

/** Small iNat-green hexagon — the app's honeycomb metaphor as a brand mark. */
function HexMark() {
  return (
    <span
      aria-hidden
      className="size-3.5 shrink-0 bg-inat"
      style={{ clipPath: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)" }}
    />
  )
}

function StatusBadge({ state }: { state: ObsState }) {
  if (state === "loading") return <Badge variant="secondary">Loading…</Badge>
  if (state === "error") return <Badge variant="destructive">Error</Badge>
  return null
}

export default App
