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

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLoading(false)
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        },
        (err) => {
          setLoading(false)
          const msg =
            err.code === err.PERMISSION_DENIED
              ? "Location permission denied."
              : "Couldn't get your location."
          setError(msg)
          reject(new Error(msg))
        },
        { enableHighAccuracy: true, timeout: 10_000 },
      )
    })
  }, [])

  return { request, loading, error }
}
