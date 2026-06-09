import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Territory } from "./territory"

/**
 * The user's OWN territory, persisted to localStorage. `saved: null` means the
 * user has never saved one — distinct from "saved a specific territory", which
 * the overwrite warning relies on.
 *
 * This deliberately holds only the saved territory; the *active* (currently
 * displayed) territory lives in App state so a URL-shared territory can render
 * without ever touching what's persisted here.
 */
interface TerritoryState {
  saved: Territory | null
  setSaved: (territory: Territory) => void
}

export const useTerritoryStore = create<TerritoryState>()(
  persist(
    (set) => ({
      saved: null,
      setSaved: (territory) => set({ saved: territory }),
    }),
    { name: "inat-territory-territory" },
  ),
)
