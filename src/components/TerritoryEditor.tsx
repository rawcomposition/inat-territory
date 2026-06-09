import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  parseLatLng,
  type CellSize,
  type Territory,
  type TerritoryDraft,
  type Units,
} from "@/lib/territory"
import { convertRadius } from "@/lib/units"

interface TerritoryEditorProps {
  /** The territory (or blank draft) the form starts from. */
  initial: TerritoryDraft
  /** Whether saving will overwrite a different, already-saved territory. */
  showOverwriteWarning: boolean
  onSave: (territory: Territory) => void
  /** Omitted when there's nothing to return to (first-run, no saved territory). */
  onCancel?: () => void
}

const CELL_SIZES: CellSize[] = ["small", "medium", "large"]

// The default "on" state (bg-muted) is too subtle to read as selected against
// the panel; use the primary color so the active segment is obvious.
const SELECTED =
  "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary"

export function TerritoryEditor({
  initial,
  showOverwriteWarning,
  onSave,
  onCancel,
}: TerritoryEditorProps) {
  const [latLngText, setLatLngText] = useState(
    initial.lat != null && initial.lng != null
      ? `${initial.lat}, ${initial.lng}`
      : "",
  )
  const [username, setUsername] = useState(initial.username)
  const [units, setUnits] = useState<Units>(initial.units)
  const [radius, setRadius] = useState(String(initial.radius))
  const [cellSize, setCellSize] = useState<CellSize>(initial.cellSize)
  const [error, setError] = useState<string | null>(null)

  // On blur, normalize a valid "lat, lng" to 6 decimal places; leave invalid
  // input untouched so the user can fix it (Save surfaces the error).
  function handleLatLngBlur() {
    const ll = parseLatLng(latLngText)
    if (!ll) return
    const round6 = (n: number) => Math.round(n * 1e6) / 1e6
    setLatLngText(`${round6(ll.lat)}, ${round6(ll.lng)}`)
  }

  function handleUnitsChange(next: Units) {
    if (next === units) return
    const r = Number(radius)
    if (Number.isFinite(r)) setRadius(String(convertRadius(r, units, next)))
    setUnits(next)
  }

  function handleSave() {
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
    const name = username.trim()
    if (!name) {
      setError("Enter an iNaturalist username.")
      return
    }
    onSave({ lat: ll.lat, lng: ll.lng, username: name, units, radius: r, cellSize })
  }

  return (
    <div className="space-y-3 text-sm">
      {showOverwriteWarning && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          You’re viewing a shared territory. Saving will overwrite your own
          saved territory.
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="te-latlng">Center (lat, lng)</Label>
        <Input
          id="te-latlng"
          value={latLngText}
          onChange={(e) => setLatLngText(e.target.value)}
          onBlur={handleLatLngBlur}
          placeholder="33.584, -117.185"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="te-username">iNat username</Label>
        <Input
          id="te-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
        />
      </div>

      <div className="space-y-1.5">
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

      <div className="space-y-1.5">
        <Label htmlFor="te-radius">Radius ({units})</Label>
        <Input
          id="te-radius"
          type="number"
          min={0}
          step="0.1"
          value={radius}
          onChange={(e) => setRadius(e.target.value)}
        />
      </div>

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

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2 pt-1">
        <Button size="sm" className="flex-1" onClick={handleSave}>
          Save
        </Button>
        {onCancel && (
          <Button size="sm" variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
