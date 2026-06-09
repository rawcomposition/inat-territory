import { create } from "zustand"
import { persist } from "zustand/middleware"

/**
 * User-facing display settings, persisted to localStorage so they survive
 * reloads. Add new toggles here as the prototype grows.
 */
interface SettingsState {
  /** Whether to draw cells without any finds. */
  showIncomplete: boolean
  setShowIncomplete: (value: boolean) => void
  /** Whether the user has dismissed the obscured-locations notice. */
  obscuredNoticeDismissed: boolean
  dismissObscuredNotice: () => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      showIncomplete: true,
      setShowIncomplete: (value) => set({ showIncomplete: value }),
      obscuredNoticeDismissed: false,
      dismissObscuredNotice: () => set({ obscuredNoticeDismissed: true }),
    }),
    { name: "inat-territory-settings" },
  ),
)
