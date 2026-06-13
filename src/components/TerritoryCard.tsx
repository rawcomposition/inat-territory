import { MoreVertical, Pencil, Share2, Trash2, X } from "lucide-react"
import { MiniRing } from "@/components/RingGauge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SHARED_FALLBACK_NAME, type Territory, type TerritoryStats } from "@/lib/territory"

/** The "43/250 cells · 592 obs" line under a territory's name. */
function MetaLine({ stats }: { stats: TerritoryStats | undefined }) {
  const dash = "—"
  return (
    <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
      <span className="font-semibold text-foreground/70">
        {stats ? `${stats.cellsClaimed}/${stats.cellsTotal}` : dash}
      </span>{" "}
      cells
      <span className="opacity-50"> · </span>
      <span className="font-semibold text-foreground/70">
        {stats ? stats.observations.toLocaleString() : dash}
      </span>{" "}
      obs
    </div>
  )
}

interface TerritoryCardProps {
  territory: Territory
  /** This territory is the one currently drawn on the map. */
  active: boolean
  /** Stats to show — live values for the active card, else the cached snapshot. */
  stats: TerritoryStats | undefined
  /** Observations are still loading for this (active) territory. */
  pending?: boolean
  onActivate: () => void
  onEdit: () => void
  onShare: () => void
  onDelete: () => void
}

export function TerritoryCard({
  territory,
  active,
  stats,
  pending = false,
  onActivate,
  onEdit,
  onShare,
  onDelete,
}: TerritoryCardProps) {
  return (
    <div
      className={`relative flex items-center gap-3 rounded-xl border p-3 transition-colors ${
        active ? "border-inat/30 bg-inat/[0.06]" : "border-border bg-card"
      }`}
    >
      <button
        type="button"
        onClick={onActivate}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        aria-label={`Show ${territory.name || "territory"} on the map`}
        aria-pressed={active}
      >
        <MiniRing
          pct={stats?.percentClaimed ?? 0}
          loading={pending}
          muted={!stats}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-bold text-foreground">
              {territory.name || "Untitled"}
            </span>
          </div>
          <MetaLine stats={stats} />
        </div>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Actions for ${territory.name || "territory"}`}
          >
            <MoreVertical className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onShare}>
            <Share2 />
            Share
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

interface SharedTerritoryCardProps {
  territory: Territory
  /** This shared territory is currently drawn on the map. */
  active: boolean
  stats: TerritoryStats | undefined
  pending?: boolean
  onActivate: () => void
  onSave: () => void
  onDismiss: () => void
}

/**
 * A transient card for a territory opened from a shared link. Visually distinct
 * (sky-tinted, "SHARED" badge) and never persisted until the user saves it.
 */
export function SharedTerritoryCard({
  territory,
  active,
  stats,
  pending = false,
  onActivate,
  onSave,
  onDismiss,
}: SharedTerritoryCardProps) {
  return (
    <div
      className={`relative rounded-xl border border-sky-500/40 bg-sky-500/[0.07] p-3 ${
        active ? "ring-1 ring-sky-500/30" : ""
      }`}
    >
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-md text-sky-700/70 hover:bg-sky-500/10 hover:text-sky-800 dark:text-sky-300/70 dark:hover:text-sky-200"
        aria-label="Dismiss shared territory"
      >
        <X className="size-4" />
      </button>

      <button
        type="button"
        onClick={onActivate}
        className="flex w-full min-w-0 items-center gap-3 pr-7 text-left"
        aria-label={`Show ${territory.name || "shared territory"} on the map`}
        aria-pressed={active}
      >
        <MiniRing
          pct={stats?.percentClaimed ?? 0}
          loading={pending}
          muted={!stats}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-bold text-foreground">
              {territory.name || SHARED_FALLBACK_NAME}
            </span>
            <span className="shrink-0 rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
              Shared
            </span>
          </div>
          <MetaLine stats={stats} />
        </div>
      </button>

      <Button
        size="sm"
        className="mt-3 w-full bg-sky-600 text-white hover:bg-sky-600/90"
        onClick={onSave}
      >
        Save territory
      </Button>
    </div>
  )
}
