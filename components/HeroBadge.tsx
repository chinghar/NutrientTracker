"use client";

import { useEffect, useState } from "react";

interface HeroBadgeProps {
  /** The big number shown inside the badge. */
  value: string;
  /** Two short plain-English lines under the number — no joined meta-string punctuation. */
  captionLines: [string, string];
  /** 0-100, how much of the ring to fill (percent of target). */
  percent: number;
}

const SIZE = 220;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The one hero element in the app: a solid Poppy "plate" badge with a
 * Marigold progress ring around its edge. The ring fills from empty to its
 * real value on mount — the app's single orchestrated motion moment, not a
 * decorative flourish. `prefers-reduced-motion` collapses the transition to
 * effectively instant via the global CSS rule, so it never gets a bespoke
 * skip path here.
 */
export default function HeroBadge({ value, captionLines, percent }: HeroBadgeProps) {
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const clamped = Math.max(0, Math.min(100, percent));
  const offset = CIRCUMFERENCE * (1 - (filled ? clamped : 0) / 100);

  return (
    <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} className="-rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--color-toast)" strokeOpacity={0.25} strokeWidth={STROKE} />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--color-marigold)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS - STROKE * 2} fill="var(--color-poppy)" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
        <span className="font-display text-4xl leading-none text-white sm:text-5xl">{value}</span>
        <span className="mt-2 text-xs font-semibold text-white/90">{captionLines[0]}</span>
        <span className="text-xs font-semibold text-white/90">{captionLines[1]}</span>
      </div>
    </div>
  );
}
