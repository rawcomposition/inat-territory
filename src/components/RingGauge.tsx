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
