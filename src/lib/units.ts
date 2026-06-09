import type { Units } from "./territory"

/** Exact kilometers in one statute mile. */
export const MI_TO_KM = 1.609344
export const KM_TO_MI = 1 / MI_TO_KM

/** Convert a value expressed in `units` to kilometers. */
export function toKm(value: number, units: Units): number {
  return units === "mi" ? value * MI_TO_KM : value
}

/**
 * Re-express a distance when the display units change, preserving the physical
 * size (e.g. 8 km → 4.97 mi). Rounded to 2 decimals for a tidy form value.
 */
export function convertRadius(value: number, from: Units, to: Units): number {
  if (from === to) return value
  const factor = to === "km" ? MI_TO_KM : KM_TO_MI
  return Math.round(value * factor * 100) / 100
}
