import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Risk } from "@/lib/agent";

export function useAnimatedNumber(target: number, duration = 700) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = a + (target - a) * eased;
      setValue(v);
      from.current = v;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-2xl border border-border bg-card p-5", className)}>{children}</section>;
}

export function RiskBadge({ risk }: { risk: Risk }) {
  const high = risk === "HIGH RISK";
  const med = risk === "MEDIUM RISK";
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-[2px] px-2 py-1 font-display text-[11px] leading-none tracking-[0.08em]",
        high && "bg-primary text-primary-foreground",
        med && "bg-warning text-accent-foreground",
        !high && !med && "border border-border text-muted-foreground",
      )}
    >
      {risk}
    </span>
  );
}

export const LOOP = ["Observe", "Decide", "Create", "Test", "Learn", "Repeat"] as const;

export function LoopBar({ stage }: { stage: number }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-2">
      {LOOP.map((s, i) => (
        <div key={s} className="flex min-w-0 flex-1 items-center gap-1">
          <div
            className={cn(
              "flex-1 rounded-xl px-3 py-2.5 text-center font-display text-sm tracking-[0.14em] transition-all duration-500",
              i === stage && "bg-fire text-primary-foreground shadow-glow",
              i < stage && "bg-surface text-foreground",
              i > stage && "text-muted-foreground",
            )}
          >
            {i < stage ? "✓ " : ""}
            {s}
          </div>
          {i < LOOP.length - 1 && <span className="shrink-0 text-muted-foreground">→</span>}
        </div>
      ))}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="eyebrow">{label}</span>
        <span className="font-display text-xl text-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rm-range"
        style={{
          background: `linear-gradient(to right, var(--color-accent) ${pct}%, var(--color-surface) ${pct}%)`,
        }}
      />
    </label>
  );
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="eyebrow mb-2">{label}</div>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={cn(
              "rounded-lg py-2 font-display text-sm tracking-widest transition",
              value === o ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Waveform({ active }: { active: boolean }) {
  return (
    <div className="flex h-8 items-end gap-[3px]">
      {Array.from({ length: 28 }).map((_, i) => (
        <span
          key={i}
          className={cn("w-[3px] rounded-full bg-accent", active ? "wave-bar" : "opacity-40")}
          style={{ height: `${30 + ((i * 37) % 70)}%`, animationDelay: `${(i % 7) * 0.09}s` }}
        />
      ))}
    </div>
  );
}

export const gbp = (n: number) => `£${n.toFixed(2)}`;
