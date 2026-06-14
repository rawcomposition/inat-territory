import { useState } from "react"
import { ChevronDown, LocateFixed, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  CATEGORIES,
  parseLatLng,
  type Category,
  type CellSize,
  type TerritoryDraft,
  type TerritoryInput,
  type Units,
  type YearFilter,
} from "@/lib/territory"
import { useGeolocation } from "@/lib/useGeolocation"
import { MAX_RADIUS } from "@/config"

/** Round a coordinate to the 6 decimal places we store / display. */
const round6 = (n: number) => Math.round(n * 1e6) / 1e6

interface TerritoryEditorProps {
  /** The territory (or blank draft) the form starts from. */
  initial: TerritoryDraft
  /** "create" shows a "Create territory" button; "edit" adds a Delete action. */
  mode: "create" | "edit"
  onSave: (territory: TerritoryInput) => void
  onCancel: () => void
  /** Provided in edit mode to delete the territory being edited. */
  onDelete?: () => void
}

const CELL_SIZES: CellSize[] = ["small", "medium", "large"]

// The default "on" state (bg-muted) is too subtle to read as selected against
// the panel; use the primary color so the active segment is obvious.
const SELECTED =
  "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary"

export function TerritoryEditor({
  initial,
  mode,
  onSave,
  onCancel,
  onDelete,
}: TerritoryEditorProps) {
  const [name, setName] = useState(initial.name)
  const [latLngText, setLatLngText] = useState(
    initial.lat != null && initial.lng != null
      ? `${initial.lat}, ${initial.lng}`
      : "",
  )
  const [username, setUsername] = useState(initial.username)
  const [units, setUnits] = useState<Units>(initial.units)
  const [radius, setRadius] = useState(String(initial.radius))
  const [cellSize, setCellSize] = useState<CellSize>(initial.cellSize)
  const [year, setYear] = useState<YearFilter>(initial.year)
  const [categories, setCategories] = useState<Category[]>(initial.categories)
  // The advanced filters live in a drawer that starts closed to keep the form
  // approachable — but open it when the user already has non-default filters so
  // their active settings aren't hidden on edit.
  const [displayOpen, setDisplayOpen] = useState(
    initial.year !== "all" || initial.categories.length > 0,
  )
  const [error, setError] = useState<string | null>(null)
  const geo = useGeolocation()
  const currentYear = new Date().getFullYear()

  // On blur, normalize a valid "lat, lng" to 6 decimal places; leave invalid
  // input untouched so the user can fix it (Save surfaces the error).
  function handleLatLngBlur() {
    const ll = parseLatLng(latLngText)
    if (!ll) return
    setLatLngText(`${round6(ll.lat)}, ${round6(ll.lng)}`)
  }

  // Fill the field from the browser's geolocation, if the user allows it.
  async function handleUseMyLocation() {
    try {
      const { lat, lng } = await geo.request()
      setLatLngText(`${round6(lat)}, ${round6(lng)}`)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't get your location.")
    }
  }

  function toggleCategory(value: Category, checked: boolean) {
    setCategories((prev) =>
      checked ? [...prev, value] : prev.filter((c) => c !== value),
    )
  }

  function handleUnitsChange(next: Units) {
    if (next === units) return
    // Keep the radius number as-is; only the unit label changes (e.g. 5 mi → 5 km).
    setUnits(next)
  }

  function handleSave() {
    const territoryName = name.trim()
    if (!territoryName) {
      setError("Give your territory a name.")
      return
    }
    const ll = parseLatLng(latLngText)
    if (!ll) {
      setError("Enter coordinates as “lat, lng”.")
      return
    }
    const r = Number(radius)
    if (!Number.isFinite(r) || r <= 0) {
      setError("Radius must be a positive number.")
      return
    }
    if (r > MAX_RADIUS[units]) {
      setError(`Radius must be less than ${MAX_RADIUS[units]} ${units}.`)
      return
    }
    const user = username.trim()
    if (!user) {
      setError("Enter an iNaturalist username.")
      return
    }
    onSave({
      name: territoryName,
      lat: ll.lat,
      lng: ll.lng,
      username: user,
      units,
      radius: r,
      cellSize,
      year,
      categories,
    })
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1.5">
        <Label htmlFor="te-name">Territory name</Label>
        <Input
          id="te-name"
          autoFocus={mode === "create"}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="te-username">iNat username</Label>
        <Input
          id="te-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="te-latlng">Center (lat, lng)</Label>
        <div className="flex gap-2">
          <Input
            id="te-latlng"
            value={latLngText}
            onChange={(e) => setLatLngText(e.target.value)}
            onBlur={handleLatLngBlur}
            className="font-mono"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={handleUseMyLocation}
            disabled={geo.loading}
            aria-label="Use my current location"
            title="Use my current location"
          >
            <LocateFixed className={geo.loading ? "animate-pulse" : undefined} />
          </Button>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="w-32 shrink-0 space-y-1.5">
          <Label htmlFor="te-radius" className="whitespace-nowrap">
            Radius (approx.)
          </Label>
          <Input
            id="te-radius"
            type="number"
            min={0}
            max={MAX_RADIUS[units]}
            step="0.1"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            onFocus={(e) => e.target.select()}
            className="font-mono"
          />
        </div>
        <div className="flex-1 space-y-1.5">
          <Label>Units</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            value={units}
            onValueChange={(v) => v && handleUnitsChange(v as Units)}
            className="w-full"
          >
            <ToggleGroupItem value="mi" className={`flex-1 ${SELECTED}`}>
              Miles
            </ToggleGroupItem>
            <ToggleGroupItem value="km" className={`flex-1 ${SELECTED}`}>
              Km
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/* Advanced filters tucked into a drawer so the form reads as 3 inputs to
          a first-time user. */}
      <div className="overflow-hidden rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setDisplayOpen((o) => !o)}
          aria-expanded={displayOpen}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 aria-expanded:bg-inat/5"
        >
          <div className="flex-1">
            <div className="text-[13px] font-semibold">Display options</div>
            <div className="text-xs text-muted-foreground">
              Cell size · year · categories
            </div>
          </div>
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${
              displayOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {displayOpen && (
          <div className="space-y-3 px-3 pb-3 pt-1">
            <div className="space-y-1.5">
              <Label>Cell size</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={cellSize}
                onValueChange={(v) => v && setCellSize(v as CellSize)}
                className="w-full"
              >
                {CELL_SIZES.map((size) => (
                  <ToggleGroupItem
                    key={size}
                    value={size}
                    className={`flex-1 capitalize ${SELECTED}`}
                  >
                    {size}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="space-y-1.5">
              <Label>Year</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={year}
                onValueChange={(v) => v && setYear(v as YearFilter)}
                className="w-full"
              >
                <ToggleGroupItem value="all" className={`flex-1 ${SELECTED}`}>
                  All years
                </ToggleGroupItem>
                <ToggleGroupItem value="current" className={`flex-1 ${SELECTED}`}>
                  {currentYear}
                </ToggleGroupItem>
                <ToggleGroupItem value="last" className={`flex-1 ${SELECTED}`}>
                  {currentYear - 1}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="space-y-1.5">
              <Label>Categories</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {categories.length === 0
                        ? "All categories"
                        : CATEGORIES.filter((c) => categories.includes(c.value))
                            .map((c) => c.label)
                            .join(", ")}
                    </span>
                    <ChevronDown className="size-4 shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="max-h-64 w-(--radix-dropdown-menu-trigger-width) overflow-y-auto"
                >
                  {CATEGORIES.map((c) => (
                    <DropdownMenuCheckboxItem
                      key={c.value}
                      checked={categories.includes(c.value)}
                      onCheckedChange={(checked) => toggleCategory(c.value, checked)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {c.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          className="flex-1 bg-inat text-white hover:bg-inat/90"
          onClick={handleSave}
        >
          {mode === "create" ? "Create territory" : "Save changes"}
        </Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      {mode === "edit" && onDelete && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-red-700/90 hover:bg-red-700/10 dark:text-red-400/90"
          >
            <Trash2 className="size-3.5" />
            Delete territory
          </button>
        </div>
      )}
    </div>
  )
}
