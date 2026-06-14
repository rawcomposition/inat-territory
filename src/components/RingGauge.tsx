/**
 * Circular progress meter for the territory panel's hero. A soft green track
 * with an iNat-green arc and the percentage in the middle — the clean,
 * unambiguous read on "how much of your territory you've claimed."
 */
export function RingGauge({
  pct,
  size = 76,
  muted = false,
}: {
  /** 0–100; clamped. */
  pct: number
  /** Outer diameter in px. */
  size?: number
  /** Render the arc greyed out (e.g. while observations load). */
  muted?: boolean
}) {
  const stroke = 8
  const r = size / 2 - stroke / 2 - 1
  const circ = 2 * Math.PI * r
  const value = Math.max(0, Math.min(100, Math.round(pct)))

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-inat/15"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - value / 100)}
          className={muted ? "stroke-muted-foreground/30" : "stroke-inat"}
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span
          className={`font-mono text-base font-bold tabular-nums ${
            muted ? "text-muted-foreground" : "text-inat-strong"
          }`}
        >
          {muted ? "—" : `${value}%`}
        </span>
      </div>
    </div>
  )
}

/**
 * Compact variant of {@link RingGauge} for the territory list cards: a thinner
 * ring with the integer percent centered in it.
 */
export function MiniRing({
  pct,
  size = 48,
  muted = false,
  loading = false,
}: {
  pct: number
  size?: number
  /** Render greyed out (e.g. while this territory's stats are unknown). */
  muted?: boolean
  /** Show an indeterminate spinner in place of the ring (stats refreshing). */
  loading?: boolean
}) {
  const stroke = 5
  const r = size / 2 - stroke / 2 - 1
  const circ = 2 * Math.PI * r
  const value = Math.max(0, Math.min(100, Math.round(pct)))

  // Loading: same track + diameter, but a short grey arc that spins. Drops the
  // `-rotate-90` so `animate-spin`'s rotation owns the transform. The distinct
  // `key` makes React remount (not reconcile) when toggling to the filled ring,
  // so the progress arc doesn't animate out of the spinner's dash state.
  if (loading) {
    return (
      <div
        key="loading"
        className="relative shrink-0"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} className="animate-spin">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            className="stroke-muted-foreground/15"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circ * 0.25} ${circ}`}
            className="stroke-muted-foreground/50"
          />
        </svg>
      </div>
    )
  }

  return (
    <div
      key="ring"
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-inat/15"
        />
        {!muted && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - value / 100)}
            className="stroke-inat"
            style={{ transition: "stroke-dashoffset 0.4s ease" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span
          className={`font-mono font-bold tabular-nums ${
            muted ? "text-muted-foreground" : "text-inat-strong"
          }`}
          style={{ fontSize: Math.round(size * 0.28) }}
        >
          {muted ? "—" : `${value}%`}
        </span>
      </div>
    </div>
  )
}
