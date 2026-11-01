"use client";

import { useMemo } from "react";
import { Coins } from "lucide-react";

/** Soft clay dust palette — gold, lilac, sage at ~70% alpha (muted specks on cream). */
const DUST_COLORS = ["#eda93fb3", "#b98ae8b3", "#7fb069b3"];

/** Field of twinkling clay dust (deterministic per mount seed). */
export function MagicDust({ count = 14, className = "" }: { count?: number; className?: string }) {
  const dots = useMemo(() => {
    const seed = Math.floor(Math.random() * 100000);
    const rand = (i: number, salt: number) => {
      const x = Math.sin((seed + i * 97 + salt * 31) * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };
    return Array.from({ length: count }, (_, i) => ({
      left: rand(i, 1) * 100,
      top: rand(i, 2) * 100,
      size: 6 + rand(i, 3) * 10,
      delay: rand(i, 4) * 3.2,
      duration: 2.4 + rand(i, 5) * 2.6,
      char: rand(i, 6) > 0.5 ? "✦" : "✧",
    }));
  }, [count]);

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {dots.map((d, i) => (
        <span
          key={i}
          className="sparkle absolute"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            fontSize: `${d.size}px`,
            color: DUST_COLORS[i % DUST_COLORS.length],
            animationDelay: `${d.delay}s`,
            animationDuration: `${d.duration}s`,
          }}
        >
          {d.char}
        </span>
      ))}
    </div>
  );
}

/** Molded gold coin pill — the treasury stamp (presses in like real clay). */
export function CoinBadge({ coins, className = "" }: { coins: number; className?: string }) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-transform hover:-translate-y-[1px] active:translate-y-[2px] active:scale-95 ${className}`}
      style={{ background: "linear-gradient(180deg,#f2b34d,#eda93f)", color: "#5c3708", boxShadow: "var(--clay-gold)" }}
      title="Kingdom Coins — each coin claims 1 m² of territory"
    >
      <Coins className="h-4 w-4 shrink-0" strokeWidth={2.4} />
      <span className="text-sm font-bold tabular-nums">{coins.toLocaleString()}</span>
    </div>
  );
}
