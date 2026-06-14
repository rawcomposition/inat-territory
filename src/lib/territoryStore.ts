import { create } from "zustand"
import { persist } from "zustand/middleware"
import {
  newTerritoryId,
  type Territory,
  type TerritoryInput,
  type TerritoryStats,
} from "./territory"

/**
 * The user's saved territories, persisted to localStorage. A territory the user
 * is previewing from a shared URL is NOT kept here — that lives in App state so
 * it can render without ever touching what's persisted.
 *
 * `activeId` is the territory currently applied to the map. It can dangle (point
 * at a deleted id) transiently; consumers resolve it to `null` and fall back to
 * the world view.
 */
interface TerritoryState {
  territories: Territory[]
  activeId: string | null
  /** Create a territory, make it active, and return its new id. */
  add: (input: TerritoryInput) => string
  /** Patch an existing territory's editable fields; bumps `updatedAt`. */
  update: (id: string, input: TerritoryInput) => void
  /** Remove a territory; clears/repoints `activeId` if it was the one removed. */
  remove: (id: string) => void
  setActive: (id: string | null) => void
  /** Cache the latest coverage snapshot for a territory (no-op if unchanged). */
  setStats: (id: string, stats: TerritoryStats) => void
  /** Upsert imported territories by id: same-id entries are overwritten in
   * place, new ones appended. Selects the first territory if none is active. */
  importTerritories: (incoming: Territory[]) => void
}

function statsEqual(a: TerritoryStats | undefined, b: TerritoryStats): boolean {
  return (
    a != null &&
    a.cellsClaimed === b.cellsClaimed &&
    a.cellsTotal === b.cellsTotal &&
    a.observations === b.observations &&
    a.percentClaimed === b.percentClaimed
  )
}

export const useTerritoryStore = create<TerritoryState>()(
  persist(
    (set, get) => ({
      territories: [],
      activeId: null,

      add: (input) => {
        const id = newTerritoryId()
        const territory: Territory = { ...input, id, updatedAt: Date.now() }
        set((s) => ({ territories: [...s.territories, territory], activeId: id }))
        return id
      },

      update: (id, input) =>
        set((s) => ({
          territories: s.territories.map((t) =>
            t.id === id ? { ...t, ...input, id, updatedAt: Date.now() } : t,
          ),
        })),

      remove: (id) =>
        set((s) => {
          const territories = s.territories.filter((t) => t.id !== id)
          const activeId =
            s.activeId === id ? (territories[0]?.id ?? null) : s.activeId
          return { territories, activeId }
        }),

      setActive: (id) => set({ activeId: id }),

      setStats: (id, stats) => {
        const current = get().territories.find((t) => t.id === id)
        if (!current || statsEqual(current.stats, stats)) return
        set((s) => ({
          territories: s.territories.map((t) =>
            t.id === id ? { ...t, stats } : t,
          ),
        }))
      },

      importTerritories: (incoming) =>
        set((s) => {
          // Map keeps insertion order, and re-setting a key updates it in place
          // — so existing territories stay put while genuinely new ones append.
          const byId = new Map(s.territories.map((t) => [t.id, t]))
          for (const t of incoming) byId.set(t.id, t)
          const territories = [...byId.values()]
          // If nothing is selected (or activeId dangles), select the first.
          const activeId = byId.has(s.activeId ?? "")
            ? s.activeId
            : (territories[0]?.id ?? null)
          return { territories, activeId }
        }),
    }),
    {
      name: "inat-territory-territory",
    },
  ),
)
