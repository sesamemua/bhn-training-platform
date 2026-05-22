"use client";

/**
 * Login-floater admin editor.
 *
 * Two parts stacked:
 *   1. The Gallery — editorial visual browse of the curated library
 *      (FLOATER_REGISTRY). Sits at the top because picking what to
 *      seat on /login is the primary task; the row editor below
 *      only matters once something is seated. Each card renders the
 *      ACTUAL React floater component at thumbnail scale so admins
 *      see exactly what will show up on /login. Click any card to
 *      add it to the active list. Already-active cards are dimmed
 *      and show "ACTIVE".
 *   2. Active rows — one per floater currently seated on the /login
 *      backdrop, below the gallery. Each row carries the
 *      fine-tuning inputs:
 *        • side: left | right
 *        • verticalPct: 0..100
 *        • size: optional px override
 *        • colorClass: optional Tailwind text-color class
 *        • swimClass: optional drift variant
 *
 * The gallery replaces what used to be a separate static
 * /floaters-showcase.html file — same editorial aesthetic, but now
 * each card is interactive and only shows floaters that can really
 * be added (i.e. the ones in the registry).
 *
 * Saves the full list back via POST /api/admin/login-floaters.
 * No drag reorder; ordering inside the array doesn't affect render
 * (each floater is positioned absolutely by side + verticalPct), so
 * reordering would be cosmetic. Reset button restores the default
 * 5-floater layout.
 */

import { useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Trash2, RotateCcw, Save, Loader2, AlertCircle, CheckCircle2, Check, X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { FLOATER_REGISTRY, FLOATER_LIST, type FloaterDef } from "@/lib/login-floaters/registry";
import type { FloaterInstance } from "@/lib/login-floaters/types";

interface Props {
  initialFloaters: FloaterInstance[];
  swimClasses: string[];
}

export function LoginFloatersEditor({
  initialFloaters,
  swimClasses,
}: Props) {
  const router = useRouter();
  const [floaters, setFloaters] = useState<FloaterInstance[]>(initialFloaters);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  function patchAt(idx: number, patch: Partial<FloaterInstance>) {
    setFloaters((cur) => cur.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }
  function patchPositionAt(idx: number, patch: Partial<FloaterInstance["position"]>) {
    setFloaters((cur) =>
      cur.map((f, i) => (i === idx ? { ...f, position: { ...f.position, ...patch } } : f)),
    );
  }
  function removeAt(idx: number) {
    setFloaters((cur) => cur.filter((_, i) => i !== idx));
  }
  /** Remove EVERY instance of the given registry id. Used by the
   *  gallery's click-to-toggle so clicking an active card on the
   *  gallery undoes the add (and doesn't care which row position
   *  it lives at). */
  function removeAllOfId(id: string) {
    setFloaters((cur) => cur.filter((f) => f.id !== id));
  }
  function addFloater(reg: FloaterDef) {
    if (floaters.length >= 12) return;
    setFloaters((cur) => [
      ...cur,
      {
        id: reg.id,
        position: { side: "right", verticalPct: 50 },
        size: reg.defaultSize,
        colorClass: reg.defaultColorClass,
        swimClass: "lab-swim-slow",
      },
    ]);
  }

  async function save() {
    setError(null);
    setSavedNote(null);
    startTransition(async () => {
      try {
        const r = await fetch("/api/admin/login-floaters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ floaters }),
        });
        const j = (await r.json().catch(() => ({}))) as {
          ok?: boolean;
          floaters?: FloaterInstance[];
          error?: string;
        };
        if (!r.ok || !j.ok) {
          setError(j.error ?? "Save failed.");
          return;
        }
        if (Array.isArray(j.floaters)) setFloaters(j.floaters);
        setSavedNote("Saved. Refresh /login to see the change.");
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }
  async function reset() {
    if (!confirm("Reset login floaters to the default 5? Your customisations will be lost."))
      return;
    setError(null);
    setSavedNote(null);
    startTransition(async () => {
      try {
        const r = await fetch("/api/admin/login-floaters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reset: true }),
        });
        const j = (await r.json().catch(() => ({}))) as {
          ok?: boolean;
          floaters?: FloaterInstance[];
          error?: string;
        };
        if (!r.ok || !j.ok) {
          setError(j.error ?? "Reset failed.");
          return;
        }
        if (Array.isArray(j.floaters)) setFloaters(j.floaters);
        setSavedNote("Reset to defaults.");
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  // ── Active editing surface (bottom) ───────────────────────────
  const usedIds = new Set(floaters.map((f) => f.id));

  // ── Gallery (top) — categorise the registry for editorial
  // section headers, in a stable order that matches the showcase
  // narrative arc (discovery → cell → omics → preclinical →
  // clinical → manufacturing → QC → regulatory → people).
  const CATEGORY_ORDER: FloaterDef["category"][] = [
    "Discovery",
    "Cell / Process",
    "Omics",
    "Preclinical",
    "Clinical",
    "Manufacturing",
    "QC Analytics",
    "QC Micro",
    "Regulatory",
    "Medical Affairs",
    "Commercial",
    "Patient & Academia",
  ];
  const grouped = CATEGORY_ORDER
    .map((cat) => ({
      category: cat,
      entries: FLOATER_LIST.filter((f) => f.category === cat),
    }))
    .filter((g) => g.entries.length > 0);

  return (
    <div className="space-y-4">
      {/* ── GALLERY ────────────────────────────────────────────────
          The visual picker sits at the TOP — picking what to seat
          on /login is the primary task. Replaces the standalone
          /floaters-showcase.html — admins see the actual React
          component animating on each card, grouped into editorial
          sections. Click any inactive card to add. The dark backdrop
          + thin hairline categorisation mirrors the showcase's
          editorial mood. */}
      {/* The gallery card uses overflow-hidden so a popped card
          stays inside the dark frame. Each card's `transformOrigin`
          is computed dynamically on pointer-enter (see the handler
          on the button below) so cards near the left/right/top/
          bottom edges grow INWARD toward the centre — that's why
          edge popups don't get clipped at the frame. */}
      <Card className="overflow-hidden p-0">
        <GalleryHeader count={floaters.length} />
        <div
          data-gallery-frame
          className="relative px-5 sm:px-8 py-8 sm:py-10"
          style={{
            background: "radial-gradient(900px 600px at 80% -10%, rgba(72,188,167,0.10), transparent 60%), radial-gradient(700px 500px at -10% 110%, rgba(56,140,200,0.12), transparent 60%), linear-gradient(180deg, #04080f 0%, #0a1623 100%)",
          }}
        >
          {grouped.map(({ category, entries }, sectionIdx) => (
            <section key={category} className={sectionIdx > 0 ? "mt-12" : ""}>
              <div className="mb-5">
                <p className="font-mono text-[10px] tracking-[0.4em] text-white/40">
                  {String(sectionIdx + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-1 text-xl font-semibold text-white/95 tracking-tight">
                  {category}
                </h3>
                <div className="mt-2 h-px w-16 bg-gradient-to-r from-cyan-300/60 to-transparent" />
              </div>
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                {entries.map((reg) => {
                  const inUse = usedIds.has(reg.id);
                  // ATCAP applies only when adding — active cards
                  // are always clickable (to remove).
                  const atCap = floaters.length >= 12 && !inUse;
                  // Tint the colour-class chip's swatch the same hue
                  // the floater itself will inherit. We peel the
                  // tailwind colour family + step from the class
                  // string and use that to pick a small dot colour;
                  // keeps the swatch honest without hard-coding it.
                  const colorSwatch = pickSwatch(reg.defaultColorClass);
                  return (
                    <button
                      key={reg.id}
                      type="button"
                      onClick={() => {
                        if (inUse) {
                          removeAllOfId(reg.id);
                        } else if (!atCap) {
                          addFloater(reg);
                        }
                      }}
                      onPointerEnter={pickEdgeAwareOrigin}
                      disabled={atCap}
                      className={
                        // The hover lift uses a 1.5× scale so the
                        // card POPS to one-and-a-half its grid size
                        // and overlaps its neighbours — admins can
                        // read the bigger floater preview as they
                        // swipe through the gallery. The gallery
                        // wrapper above keeps `overflow-hidden` so a
                        // popped card is CLIPPED at the gallery's
                        // dark frame edge instead of spilling out
                        // into the rest of the dashboard.
                        "group relative text-left rounded-2xl border p-3.5 transition-all duration-200 backdrop-blur-md " +
                        "hover:z-30 hover:scale-[1.5] hover:shadow-lifted-strong " +
                        (inUse
                          ? // Active state. Default = emerald wash; on
                            // hover, swap to a rose wash to signal the
                            // pending destructive action.
                            "border-emerald-400/35 bg-emerald-400/[0.07] cursor-pointer hover:border-rose-400/50 hover:bg-rose-400/[0.10]"
                          : atCap
                            ? "border-white/10 bg-white/[0.02] opacity-40 cursor-not-allowed"
                            : "border-white/10 bg-white/[0.04] hover:border-white/35 hover:bg-white/[0.08]")
                      }
                      title={
                        inUse
                          ? `Click to remove "${reg.displayName}" from /login`
                          : atCap
                            ? "Floater cap reached (12)"
                            : `Click to add "${reg.displayName}" to /login`
                      }
                    >
                      {/* Meta row — category eyebrow + status chip.
                          The chip swaps on hover for active cards
                          (Active → ✕ Remove) so the destructive
                          intent reads clearly. */}
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-bold tracking-[0.3em] uppercase text-white/55">
                          {reg.category}
                        </span>
                        {inUse ? (
                          <>
                            {/* Default state (active, not hovered) */}
                            <span className="inline-flex group-hover:hidden items-center gap-1 text-[9px] font-bold tracking-[0.18em] uppercase text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-400/30 bg-emerald-400/[0.08]">
                              <Check size={9} /> Active
                            </span>
                            {/* Hover state (active card → confirm
                                remove on click) */}
                            <span className="hidden group-hover:inline-flex items-center gap-1 text-[9px] font-bold tracking-[0.18em] uppercase text-rose-200 px-2 py-0.5 rounded-full border border-rose-400/45 bg-rose-400/[0.12]">
                              <X size={9} /> Remove
                            </span>
                          </>
                        ) : (
                          <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-white/35 px-2 py-0.5 rounded-full border border-white/10 group-hover:text-white/85 group-hover:border-white/35 group-hover:bg-white/[0.06] transition-colors">
                            Add
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] font-semibold text-white/95 tracking-tight mb-1">
                        {reg.displayName}
                      </p>
                      {/* Stage — square frame containing the actual
                          floater component. Sits at its registered
                          default size up to a 160-px cap so the grid
                          stays uniform; the hover 2× scale on the
                          parent card already doubles the stage, so
                          no nested scaling is needed here. */}
                      <div className={"mt-2 aspect-square flex items-center justify-center rounded-xl " + (reg.defaultColorClass)}
                        style={{ background: "radial-gradient(60% 60% at 50% 40%, rgba(72,188,167,0.05), transparent 70%)" }}
                      >
                        <reg.Component size={Math.min(reg.defaultSize, 160)} />
                      </div>
                      {/* Detail area — height reserved at min-h-[72px]
                          whether or not it's hovered so the card never
                          changes size (would cause the whole grid to
                          reflow as the user swipes across). Default
                          state shows just `size · default` centred;
                          hover state reveals the full id / size / tint
                          breakdown. */}
                      <div className="mt-3 pt-3 border-t border-white/10 min-h-[72px] relative">
                        {/* Compact default — single centred line */}
                        <p className="absolute inset-0 flex items-center justify-center text-center font-mono text-[10px] tracking-[0.18em] uppercase text-white/45 group-hover:opacity-0 transition-opacity">
                          {reg.defaultSize}px · default
                        </p>
                        {/* Hover-revealed deep details — fades in over
                            the default footer's reserved space, so no
                            layout reflow on the surrounding grid. */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity space-y-1.5">
                          <div className="flex items-center justify-between gap-2 text-[10px]">
                            <span className="font-mono uppercase tracking-[0.18em] text-white/40">id</span>
                            <code className="font-mono text-white/85 truncate">{reg.id}</code>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-[10px]">
                            <span className="font-mono uppercase tracking-[0.18em] text-white/40">size</span>
                            <span className="font-mono text-white/85">{reg.defaultSize}px</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-[10px]">
                            <span className="font-mono uppercase tracking-[0.18em] text-white/40">tint</span>
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                aria-hidden
                                className="inline-block w-2.5 h-2.5 rounded-full ring-1 ring-white/20"
                                style={{ background: colorSwatch }}
                              />
                              <code className="font-mono text-white/75 text-[9.5px]">{reg.defaultColorClass.replace("text-", "")}</code>
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </Card>

      {/* Status bar — save / reset / count + inline feedback. */}
      <Card className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <p className="text-sm text-fg">
            <span className="font-semibold">{floaters.length}</span>{" "}
            {floaters.length === 1 ? "floater" : "floaters"} active
            <span className="text-muted"> · 12 max</span>
          </p>
          {savedNote && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
              <CheckCircle2 size={12} /> {savedNote}
            </span>
          )}
          {error && (
            <span className="inline-flex items-center gap-1 text-xs text-rose-700">
              <AlertCircle size={12} /> {error}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-muted hover:text-fg border border-line disabled:opacity-50"
          >
            <RotateCcw size={12} /> Reset
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-bold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {pending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save
          </button>
        </div>
      </Card>

      {/* Active rows — fine-tuning inputs for already-seated floaters. */}
      <div className="space-y-3">
        {floaters.length === 0 && (
          <Card className="px-5 py-8 text-center text-sm text-muted">
            No floaters active. Click any card in the gallery above to seat one, or hit{" "}
            <strong>Reset</strong> to restore the default 5.
          </Card>
        )}
        {floaters.map((f, idx) => {
          const reg = FLOATER_REGISTRY[f.id];
          return (
            <Card key={`${f.id}-${idx}`} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg">
                    {reg?.displayName ?? f.id}
                  </p>
                  <p className="text-[11px] text-subtle mt-0.5">
                    {reg?.category ?? "unknown"} · id: <code className="font-mono">{f.id}</code>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  className="text-xs text-rose-700 hover:text-rose-900 inline-flex items-center gap-1"
                  title="Remove this floater"
                >
                  <Trash2 size={11} /> Remove
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Field label="Side">
                  <select
                    value={f.position.side}
                    onChange={(e) =>
                      patchPositionAt(idx, { side: e.target.value as "left" | "right" })
                    }
                    className="w-full bg-card-solid border border-line rounded-md px-2 py-1.5 text-xs"
                  >
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </Field>
                <Field label="Vertical %">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={f.position.verticalPct}
                    onChange={(e) =>
                      patchPositionAt(idx, { verticalPct: Number(e.target.value) })
                    }
                    className="w-full bg-card-solid border border-line rounded-md px-2 py-1.5 text-xs font-mono"
                  />
                </Field>
                <Field label="Size (px)">
                  <input
                    type="number"
                    min={50}
                    max={400}
                    value={f.size ?? reg?.defaultSize ?? 150}
                    onChange={(e) =>
                      patchAt(idx, { size: Number(e.target.value) })
                    }
                    className="w-full bg-card-solid border border-line rounded-md px-2 py-1.5 text-xs font-mono"
                  />
                </Field>
                <Field label="Color class">
                  <input
                    type="text"
                    value={f.colorClass ?? ""}
                    placeholder={reg?.defaultColorClass ?? "text-sky-300/28"}
                    onChange={(e) => patchAt(idx, { colorClass: e.target.value })}
                    className="w-full bg-card-solid border border-line rounded-md px-2 py-1.5 text-xs font-mono"
                  />
                </Field>
                <Field label="Drift variant">
                  <select
                    value={f.swimClass ?? "lab-swim-slow"}
                    onChange={(e) => patchAt(idx, { swimClass: e.target.value })}
                    className="w-full bg-card-solid border border-line rounded-md px-2 py-1.5 text-xs"
                  >
                    {swimClasses.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/^lab-swim-?/, "") || "default"}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </Card>
          );
        })}
      </div>

    </div>
  );
}

/** Editorial header rendered above the dark gallery body. Lives on
 *  the Card's normal surface so the contrast between admin chrome
 *  and the dark gallery interior is sharp. */
function GalleryHeader({ count }: { count: number }) {
  return (
    <div className="px-5 sm:px-8 py-5 border-b border-line bg-elevated/30">
      <p className="font-mono text-[10px] tracking-[0.4em] uppercase text-subtle">
        Library
      </p>
      <h2 className="mt-1 text-lg font-semibold text-fg tracking-tight">
        Floater gallery
      </h2>
      <p className="mt-1.5 text-[12px] text-muted max-w-[64ch]">
        Editorial browse of the curated library. Each card is the actual React
        component at thumbnail scale — exactly what shows up on{" "}
        <code className="font-mono text-fg bg-card-solid px-1.5 py-0.5 rounded text-[11px]">/login</code>.
        <span className="block mt-1">
          <strong>Click an inactive card</strong> to seat it on the login backdrop ·{" "}
          <strong>click an <span className="text-emerald-700">Active</span> card</strong> to remove it ·{" "}
          <strong>hover</strong> any card to pop it open and read its id, size, and tint.
        </span>
        <span className="block mt-1">
          Currently <span className="font-semibold text-fg">{count}</span> of 12 seats filled.
        </span>
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.22em] font-semibold text-subtle">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

/** Lookup a swatch RGB for the gallery's tint dot. Tailwind opacity
 *  segments (`/28`, `/30`, etc.) are stripped so a class like
 *  `text-emerald-300/30` resolves to the solid emerald-300 colour
 *  for the dot. Falls back to a neutral pale blue if the family
 *  isn't in the lookup. */
const TAILWIND_SWATCHES: Record<string, string> = {
  "emerald-200": "rgb(167, 243, 208)",
  "emerald-300": "rgb(110, 231, 183)",
  "sky-200":     "rgb(186, 230, 253)",
  "sky-300":     "rgb(125, 211, 252)",
  "rose-200":    "rgb(254, 205, 211)",
  "rose-300":    "rgb(253, 164, 175)",
  "amber-200":   "rgb(253, 230, 138)",
  "amber-300":   "rgb(252, 211, 77)",
  "violet-300":  "rgb(196, 181, 253)",
  "cyan-200":    "rgb(165, 243, 252)",
  "cyan-300":    "rgb(103, 232, 249)",
  "fuchsia-300": "rgb(240, 171, 252)",
  "indigo-200":  "rgb(199, 210, 254)",
  "indigo-300":  "rgb(165, 180, 252)",
  "teal-300":    "rgb(94, 234, 212)",
  "blue-300":    "rgb(147, 197, 253)",
  "slate-200":   "rgb(226, 232, 240)",
};

function pickSwatch(colorClass: string): string {
  const stripped = colorClass.replace(/^text-/, "").split("/")[0];
  return TAILWIND_SWATCHES[stripped] ?? "rgb(200, 220, 240)";
}

/** Hover-scale anchor picker. The popup card scales 1.5× on hover;
 *  if we let every card grow from its centre, edge cards spill past
 *  the gallery frame and get clipped. This handler runs on
 *  pointer-enter, measures where THIS card sits relative to the
 *  gallery's inner padded frame, and picks a `transform-origin`
 *  that anchors the scale toward the closer edge — so the popup
 *  grows INWARD (toward the centre of the gallery) on edge cards
 *  and naturally stays inside the dark frame.
 *
 *  Origin map at scale 1.5 (card grows by 25% on each side):
 *    • left-edge   → `left center`   → grows rightward only
 *    • right-edge  → `right center`  → grows leftward only
 *    • top-row     → `center top`    → grows downward only
 *    • bottom-row  → `center bottom` → grows upward only
 *    • corners     → combine both axes (e.g. `left top`)
 *    • interior    → `center center` (the default 1.5× pop)
 */
function pickEdgeAwareOrigin(e: ReactPointerEvent<HTMLButtonElement>) {
  const card = e.currentTarget;
  const frame = card.closest<HTMLElement>("[data-gallery-frame]");
  if (!frame) return;
  const cardRect = card.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  // At scale 1.5 the card grows by 25% on each side.
  const halfGrowX = cardRect.width * 0.25;
  const halfGrowY = cardRect.height * 0.25;

  let originX: "left" | "center" | "right" = "center";
  if (cardRect.left - frameRect.left < halfGrowX) originX = "left";
  else if (frameRect.right - cardRect.right < halfGrowX) originX = "right";

  let originY: "top" | "center" | "bottom" = "center";
  if (cardRect.top - frameRect.top < halfGrowY) originY = "top";
  else if (frameRect.bottom - cardRect.bottom < halfGrowY) originY = "bottom";

  card.style.transformOrigin = `${originX} ${originY}`;
}
