import type { Units } from "./territory"

/** Exact kilometers in one statute mile. */
export const MI_TO_KM = 1.609344

/** Convert a value expressed in `units` to kilometers. */
export function toKm(value: number, units: Units): number {
  return units === "mi" ? value * MI_TO_KM : value
}
