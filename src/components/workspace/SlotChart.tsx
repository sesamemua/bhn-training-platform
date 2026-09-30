"use client";

/**
 * The filming day as a strip: taken camera time in grey, the chosen slot
 * in colour — preparation lighter, then time on camera. Click the strip
 * to pick the nearest free start. Used by the public sign-up form and,
 * read-only, by the team's Sign-ups tab.
 */
import { clockOf, hhmmToMinutes } from "@/lib/video/filming";
import type { Offer, Span } from "@/lib/video/signup";

export function SlotChart({ from, to, taken, pick, slot, prep, offers, onPick }: {
  from: string; to: string; taken: Span[];
  pick: number | null; slot: number; prep: number;
  offers?: Offer[]; onPick?: (start: number) => void;
}) {
  const a = Math.floor(hhmmToMinutes(from) / 60) * 60;
  const b = Math.ceil(hhmmToMinutes(to) / 60) * 60;
  const pct = (m: number) => `${((Math.min(Math.max(m, a), b) - a) / (b - a)) * 100}%`;
  const w = (s: number, e: number) => `${((Math.min(e, b) - Math.max(s, a)) / (b - a)) * 100}%`;
  const hours = Array.from({ length: (b - a) / 60 + 1 }, (_, i) => a + i * 60);
  const click = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onPick || !offers) return;
    const r = e.currentTarget.getBoundingClientRect();
    const m = a + ((e.clientX - r.left) / r.width) * (b - a) - prep;
    const free = offers.filter((o) => o.ok).sort((x, y) => Math.abs(x.start - m) - Math.abs(y.start - m))[0];
    if (free) onPick(free.start);
  };
  return (
    <div className="select-none">
      <div
        onClick={click}
        className={`relative h-14 overflow-hidden rounded-lg border border-line bg-elevated/40 ${onPick ? "cursor-pointer" : ""}`}
        role="img"
        aria-label={`The day from ${clockOf(a)} to ${clockOf(b)}${pick != null ? `; your slot ${clockOf(pick)} to ${clockOf(pick + slot)}` : ""}`}
      >
        {hours.map((h) => <div key={h} className="absolute inset-y-0 w-px bg-line" style={{ left: pct(h) }} />)}
        {/* Outside the bookable window. */}
        <div className="absolute inset-y-0 bg-black/10" style={{ left: 0, width: w(a, hhmmToMinutes(from)) }} />
        <div className="absolute inset-y-0 bg-black/10" style={{ left: pct(hhmmToMinutes(to)), width: w(hhmmToMinutes(to), b) }} />
        {taken.map((t, i) => (
          <div key={i} className="absolute inset-y-2 flex items-center justify-center overflow-hidden rounded bg-slate-500/70 text-[10.5px] font-semibold text-white"
            style={{ left: pct(t.s), width: w(t.s, t.e), backgroundImage: "repeating-linear-gradient(135deg, transparent 0 6px, rgba(255,255,255,.15) 6px 12px)" }}
            title={`${t.label ?? "Taken"} ${clockOf(t.s)}–${clockOf(t.e)}`}>
            <span className="truncate px-1">{t.label ?? "Taken"}</span>
          </div>
        ))}
        {pick != null && (
          <>
            <div className="absolute inset-y-1 rounded-l bg-brand-400/40 ring-1 ring-brand-500" style={{ left: pct(pick), width: w(pick, pick + prep) }} title="Preparation" />
            <div className="absolute inset-y-1 flex items-center justify-center rounded-r bg-brand-600 text-[10.5px] font-semibold text-white ring-1 ring-brand-600" style={{ left: pct(pick + prep), width: w(pick + prep, pick + slot) }}>
              <span className="truncate px-1">On camera</span>
            </div>
          </>
        )}
      </div>
      <div className="relative mt-1 h-4 text-[10.5px] tabular-nums text-subtle">
        {hours.map((h, i) => (
          <span key={h} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pct(h), transform: i === 0 ? "none" : i === hours.length - 1 ? "translateX(-100%)" : undefined }}>
            {clockOf(h).replace(":00", "").replace(" a.m.", "a").replace(" p.m.", "p")}
          </span>
        ))}
      </div>
    </div>
  );
}
