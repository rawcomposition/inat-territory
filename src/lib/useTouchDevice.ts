import { useSyncExternalStore } from "react"

const QUERY = "(pointer: coarse)"

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches
}

// false on the server; the client corrects it after hydration.
function getServerSnapshot() {
  return false
}

export function useTouchDevice() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
