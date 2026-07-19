"use client";
/**
 * Top-of-page filter panel for the course catalog.
 *
 * Design choices:
 *   • Compact dark control strip — the panel reads as machinery
 *     above the bright course cards, not as a second hero.
 *   • Specials toggle ("Special programs & workshops, instructor-led")
 *     lives in the header row as a featured amber button — that's
 *     the loudest call on the panel and the one most users want.
 *   • All four filter groups visible at once. Chip toggles instead
 *     of stacked checkbox lists — a chip cloud reads the active set
 *     at a glance.
 *   • Active-count + clear-all live in the header, so the body of
 *     the panel is pure chips with no chrome competing for attention.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Filter, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CourseFilterOptions {
  topic: string[];
  delivery: string[];
  provider: string[];
}

export function CourseFilters({ options }: { options: CourseFilterOptions }) {
  const router = useRouter();
  const sp = useSearchParams();

  const selected = useMemo(
    () => ({
      topic:    (sp.get("topic")    ?? "").split(",").filter(Boolean),
      delivery: (sp.get("delivery") ?? "").split(",").filter(Boolean),
      provider: (sp.get("provider") ?? "").split(",").filter(Boolean),
      special:  sp.get("special") === "1",
    }),
    [sp]
  );

  function setParam(key: string, values: string[]) {
    const next = new URLSearchParams(sp.toString());
    if (values.length === 0) next.delete(key);
    else next.set(key, values.join(","));
    router.push(`/courses?${next.toString()}`);
  }

  function toggle(key: "topic" | "delivery" | "provider", value: string) {
    const cur = new Set(selected[key]);
    if (cur.has(value)) cur.delete(value);
    else cur.add(value);
    setParam(key, Array.from(cur));
  }

  function toggleSpecial() {
    const next = new URLSearchParams(sp.toString());
    if (selected.special) next.delete("special");
    else next.set("special", "1");
    router.push(`/courses?${next.toString()}`);
  }

  function clearAll() {
    const next = new URLSearchParams(sp.toString());
    next.delete("topic");
    next.delete("delivery");
    next.delete("provider");
    next.delete("special");
    router.push(`/courses?${next.toString()}`);
  }

  const totalActive =
    selected.topic.length + selected.delivery.length + selected.provider.length + (selected.special ? 1 : 0);

  return (
    <section
      aria-label="Course filters"
      className={cn(
        "rounded-2xl p-3 sm:p-4 mb-4",
        // Dark surface, independent of theme — the filter panel reads
        // as a control strip floating above the bright course cards.
        "bg-slate-900 text-slate-100 ring-1 ring-slate-800",
        "shadow-lifted",
      )}
    >
      {/* Compact header row: title + featured special toggle + clear-all.
          The special toggle lives in the header (not below it) so it
          reads as the loud headline action, not one more chip. */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Filter size={13} className="text-slate-400 shrink-0" />
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300 whitespace-nowrap">
            Filter the catalog
          </h2>
          {totalActive > 0 && (
            <span className="text-[10px] font-semibold tabular-nums text-amber-300 whitespace-nowrap">
              · {totalActive} active
            </span>
          )}
        </div>

        {/* Featured: Special programs & workshops. Amber on dark =
            instantly the brightest thing on the panel. When off, a soft
            amber glow keeps it visible without being obnoxious; when on,
            the solid amber fill + outer glow + scale make it loud. */}
        <button
          type="button"
          onClick={toggleSpecial}
          aria-pressed={selected.special}
          className={cn(
            "group ml-auto inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-all",
            "ring-2 ring-inset",
            selected.special
              ? "bg-amber-400 text-slate-900 ring-amber-300 shadow-glow-amber-strong scale-[1.02]"
              : "bg-amber-500/10 text-amber-300 ring-amber-500/50 hover:bg-amber-500/20 hover:text-amber-200 hover:ring-amber-400 shadow-glow-amber",
          )}
        >
          <Sparkles
            size={12}
            className={cn(
              "transition-transform",
              selected.special ? "" : "group-hover:rotate-12",
            )}
          />
          <span>Special programs &amp; workshops</span>
          <span className="hidden sm:inline text-[10px] opacity-75 font-medium">
            (instructor-led)
          </span>
        </button>

        {totalActive > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 px-2 py-1 rounded-full ring-1 ring-inset ring-slate-700 hover:ring-slate-500 transition-colors"
          >
            <X size={10} /> Clear
          </button>
        )}
      </div>

      {/* Three-column chip grid. Mobile stacks; md+ uses unequal widths
          so Topic (the longest cloud) gets the lion's share. Dividers
          are a subtle 1px slate line — visible on dark but not loud. */}
      <div className="md:grid md:grid-cols-[1.8fr_1fr_1.3fr] md:divide-x md:divide-slate-800 space-y-3 md:space-y-0">
        <div className="md:pr-4">
          <ChipGroup
            label="Topic"
            values={options.topic}
            selected={selected.topic}
            onToggle={(v) => toggle("topic", v)}
          />
        </div>
        <div className="md:px-4">
          <ChipGroup
            label="Delivery"
            values={options.delivery}
            selected={selected.delivery}
            onToggle={(v) => toggle("delivery", v)}
          />
        </div>
        <div className="md:pl-4">
          <ChipGroup
            label="Provider"
            values={options.provider}
            selected={selected.provider}
            onToggle={(v) => toggle("provider", v)}
          />
        </div>
      </div>
    </section>
  );
}

function ChipGroup({
  label, values, selected, onToggle,
}: {
  label: string;
  values: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  const sel = new Set(selected);
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-slate-400 mb-1.5">
        {label}
        {selected.length > 0 && (
          <span className="ml-2 text-amber-300 normal-case tracking-normal font-semibold">
            · {selected.length}
          </span>
        )}
      </p>
      {values.length === 0 ? (
        <p className="text-xs text-slate-500">No options yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {values.map((v) => {
            const on = sel.has(v);
            return (
              <button
                key={v}
                type="button"
                onClick={() => onToggle(v)}
                aria-pressed={on}
                className={cn(
                  "text-[11px] px-2.5 py-0.5 rounded-full transition-colors ring-1 ring-inset",
                  on
                    ? "bg-brand-500 text-white ring-brand-400 font-semibold shadow-sm"
                    : "bg-slate-800/60 text-slate-300 ring-slate-700 hover:bg-slate-700 hover:text-white hover:ring-slate-600",
                )}
              >
                {v}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
