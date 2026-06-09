import { useCallback, useState } from "react"

export interface Coords {
  lat: number
  lng: number
}

/**
 * Wraps the browser Geolocation API in a request-on-demand hook. `request()`
 * resolves with the user's current coordinates or rejects with a human-readable
 * Error; `loading` tracks an in-flight lookup and `error` holds the last failure
 * message (cleared when a new request starts or succeeds).
 */
export function useGeolocation() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const request = useCallback(() => {
    return new Promise<Coords>((resolve, reject) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        const msg = "Geolocation isn't available in this browser."
        setError(msg)
        reject(new Error(msg))
        return
      }

      setLoading(true)
      setError(null)

      const attempt = (opts: PositionOptions, retriesLeft: number) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setLoading(false)
            resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          },
          (err) => {
            // POSITION_UNAVAILABLE (macOS kCLErrorLocationUnknown) and TIMEOUT
            // are typically transient — the OS just couldn't get a fix yet.
            // Retry once with low accuracy, which leans on Wi‑Fi positioning
            // and is more reliable on desktops than high-accuracy/GPS.
            const transient =
              err.code === err.POSITION_UNAVAILABLE || err.code === err.TIMEOUT
            if (transient && retriesLeft > 0) {
              attempt({ enableHighAccuracy: false, timeout: 15_000 }, retriesLeft - 1)
              return
            }

            setLoading(false)
            const msg =
              err.code === err.PERMISSION_DENIED
                ? "Location permission denied."
                : err.code === err.POSITION_UNAVAILABLE
                  ? "Your location is unavailable right now — check that Wi‑Fi and Location Services are on, then try again."
                  : err.code === err.TIMEOUT
                    ? "Timed out getting your location. Try again."
                    : "Couldn't get your location."
            setError(msg)
            reject(new Error(msg))
          },
          opts,
        )
      }

      attempt({ enableHighAccuracy: true, timeout: 10_000 }, 1)
    })
  }, [])

  return { request, loading, error }
}
