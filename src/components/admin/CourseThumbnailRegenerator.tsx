"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, RefreshCw, Sparkles, CheckCircle2, AlertCircle, Image as ImageIcon, Square, CheckSquare,
  Palette, Eraser, BookOpen, Map,
} from "lucide-react";
import {
  parseOverlay,
  overlayStyle,
  DEFAULT_OVERLAY,
  BLEND_MODES,
  type ThumbnailOverlay,
} from "@/lib/courses/thumbnail-overlay";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

/**
 * A row in the cover-art admin tool. Both courses and pathways flow
 * through the same React surface — they share a thumbnail URL and an
 * overlay JSON shape, and the operator typically wants to batch the
 * same colour treatment across a mix of both. The `kind` field
 * routes per-row regen calls to the right endpoint and tells the
 * batch overlay API which table to write.
 */
export interface ThumbnailItem {
  kind: "course" | "pathway";
  id: string;
  title: string;
  category: string | null;
  thumbnail: string | null;
  thumbnailOverlay: unknown;
  status: string;
}

interface RegenResult {
  thumbnail: string;
  motifs: string[];
}

/** Stable per-row key so course and pathway IDs can't collide in the
 *  selection / busy / override / errors maps. */
const rowKey = (item: { kind: "course" | "pathway"; id: string }) =>
  `${item.kind}:${item.id}`;

/**
 * Bulk + per-row thumbnail regenerator + overlay batcher.
 *
 * Two operations live in this surface:
 *
 *   1. AI regeneration — calls the per-row regen endpoint one row at
 *      a time (sequential; the Cloudflare AI image side is rate
 *      limited per account). Courses go through the motif-extractor
 *      pipeline; pathways take the simpler path. Both return a new
 *      URL + (for courses) motif chips.
 *
 *   2. Overlay batching — applies a single colour / gradient overlay
 *      blob to the selected rows via /api/admin/courses/thumbnail-overlay/batch
 *      (the URL keeps "courses" for legacy reasons; the endpoint
 *      now takes a `kind` discriminator and routes to the right
 *      table). Non-destructive — the underlying AI thumbnail is
 *      untouched and the overlay can be cleared at any time.
 *
 * UX choices unchanged from the original course-only tool:
 *   • Local optimistic state so a finished row updates immediately.
 *   • Cache-busted ?t=<timestamp> on the new image URL so the
 *     browser doesn't read a stale entry from cache.
 *   • Per-kind row icon (BookOpen for course, Map for pathway) so
 *     the operator can tell at a glance what they're touching.
 *   • Overlay builder preview is rendered on every SELECTED row in
 *     the list — easier to spot bad treatments before commit.
 */
export function CourseThumbnailRegenerator({
  items,
  defaultOverlay,
}: {
  items: ThumbnailItem[];
  /** The site-wide default overlay currently configured in
   *  PlatformSetting, or null when none is set. Used to seed the
   *  builder + the "save as default" toggle when the page loads. */
  defaultOverlay: ThumbnailOverlay | null;
}) {
  const router = useRouter();

  // Local per-row state — keyed by rowKey so course/pathway IDs can't collide.
  const [overrides, setOverrides] = useState<Record<string, RegenResult>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const [overlayOverrides, setOverlayOverrides] =
    useState<Record<string, ThumbnailOverlay | null>>({});

  // Selection set. Stores rowKeys; the kind is recovered from the
  // prefix when batching.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allSelected = selected.size > 0 && selected.size === items.length;
  const someSelected = selected.size > 0;

  // Bulk-run progress.
  const [running, setRunning] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);

  // Overlay builder state. If the platform already has a site-wide
  // default configured, seed the builder with it so the operator's
  // first sight matches what regenerates apply.
  const [overlay, setOverlay] = useState<ThumbnailOverlay>(defaultOverlay ?? DEFAULT_OVERLAY);
  const [overlayBusy, setOverlayBusy] = useState(false);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();
  const [overlayMsg, setOverlayMsg] = useState<string | null>(null);
  // "Save as default" toggle. Pre-checked when a default already
  // exists so re-applying preserves it (rather than silently clearing
  // because the operator forgot to tick the box).
  const [saveAsDefault, setSaveAsDefault] = useState<boolean>(Boolean(defaultOverlay));
  // Locally track the "live" default so the UI knows whether to show
  // the "default active" badge after an apply / clear without a full
  // server round-trip refresh.
  const [defaultActive, setDefaultActive] = useState<boolean>(Boolean(defaultOverlay));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map(rowKey)));
  }
  function toggleOne(item: ThumbnailItem) {
    setSelected((cur) => {
      const next = new Set(cur);
      const key = rowKey(item);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function regenOne(item: ThumbnailItem): Promise<RegenResult | null> {
    const key = rowKey(item);
    setBusyKeys((s) => new Set(s).add(key));
    setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
    try {
      const endpoint =
        item.kind === "pathway"
          ? `/api/admin/pathways/${item.id}/thumbnail`
          : `/api/admin/courses/${item.id}/thumbnail/regenerate`;
      const res = await fetch(endpoint, { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        thumbnail?: string;
        url?: string;
        motifs?: string[];
        error?: string;
      };
      // Normalize either response shape — courses return `thumbnail`,
      // legacy pathway callers may still return only `url`. The
      // pathway endpoint now returns both for safety.
      const newUrl = j.thumbnail ?? j.url;
      if (!res.ok || !newUrl) {
        throw new Error(j.error ?? "Regeneration failed.");
      }
      const result: RegenResult = {
        thumbnail: `${newUrl}?t=${Date.now()}`,
        motifs: j.motifs ?? [],
      };
      setOverrides((o) => ({ ...o, [key]: result }));
      return result;
    } catch (err) {
      setErrors((e) => ({ ...e, [key]: (err as Error).message }));
      return null;
    } finally {
      setBusyKeys((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  }

  async function regenBatch(targets: ThumbnailItem[]) {
    setRunning(true);
    setCancelled(false);
    setCompleted(0);
    setTotal(targets.length);
    for (const c of targets) {
      if (cancelled) break;
      await regenOne(c);
      setCompleted((n) => n + 1);
    }
    setRunning(false);
    router.refresh();
  }

  async function startBulk() {
    const targets = someSelected
      ? items.filter((c) => selected.has(rowKey(c)))
      : items;
    if (targets.length === 0) return;
    if (!(await confirmDialog({ title: `Regenerate ${targets.length} thumbnail${targets.length === 1 ? "" : "s"}?`, description: "Each takes ~5–10 seconds.", confirmLabel: "Regenerate" }))) return;
    regenBatch(targets);
  }

  async function applyOverlay(clearInstead: boolean) {
    // Either a selection OR the "save as default" toggle (or both)
    // is required — the endpoint accepts either as a meaningful op.
    if (!someSelected && !saveAsDefault) {
      setOverlayMsg("Pick at least one item, or toggle 'Apply to future thumbnails' to save as the default.");
      return;
    }

    // Split the selected keys by kind so we can hit each table with
    // its own batch request. The endpoint accepts one kind at a
    // time, by design — keeps the response count predictable.
    const courseIds: string[] = [];
    const pathwayIds: string[] = [];
    for (const key of selected) {
      const [k, id] = key.split(":", 2);
      if (k === "pathway") pathwayIds.push(id);
      else courseIds.push(id);
    }

    setOverlayBusy(true);
    setOverlayMsg(null);
    try {
      const payload = clearInstead ? null : overlay;
      type Resp = { ok?: boolean; updated?: number; defaultSaved?: boolean; defaultCleared?: boolean; error?: string };
      type Result = { updated: number; defaultSaved: boolean; defaultCleared: boolean };

      const requests: Promise<Result>[] = [];

      // Route each kind's batch separately. The saveAsDefault flag
      // is sent with the FIRST batch (course-side by convention) —
      // the endpoint handles it independently of ids, so sending it
      // on both would just double-write the same value.
      let sentDefault = false;

      if (courseIds.length > 0) {
        requests.push(
          fetch(`/api/admin/courses/thumbnail-overlay/batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "course",
              ids: courseIds,
              overlay: payload,
              saveAsDefault: saveAsDefault && !sentDefault,
            }),
          }).then(async (r) => {
            const j = (await r.json().catch(() => ({}))) as Resp;
            if (!r.ok || !j.ok) throw new Error(j.error ?? "Course batch failed.");
            return {
              updated: j.updated ?? courseIds.length,
              defaultSaved: Boolean(j.defaultSaved),
              defaultCleared: Boolean(j.defaultCleared),
            };
          }),
        );
        if (saveAsDefault) sentDefault = true;
      }
      if (pathwayIds.length > 0) {
        requests.push(
          fetch(`/api/admin/courses/thumbnail-overlay/batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "pathway",
              ids: pathwayIds,
              overlay: payload,
              saveAsDefault: saveAsDefault && !sentDefault,
            }),
          }).then(async (r) => {
            const j = (await r.json().catch(() => ({}))) as Resp;
            if (!r.ok || !j.ok) throw new Error(j.error ?? "Pathway batch failed.");
            return {
              updated: j.updated ?? pathwayIds.length,
              defaultSaved: Boolean(j.defaultSaved),
              defaultCleared: Boolean(j.defaultCleared),
            };
          }),
        );
        if (saveAsDefault) sentDefault = true;
      }
      // If saveAsDefault is on but no items are selected, fire a
      // default-only request (ids empty).
      if (saveAsDefault && !sentDefault) {
        requests.push(
          fetch(`/api/admin/courses/thumbnail-overlay/batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "course",
              ids: [],
              overlay: payload,
              saveAsDefault: true,
            }),
          }).then(async (r) => {
            const j = (await r.json().catch(() => ({}))) as Resp;
            if (!r.ok || !j.ok) throw new Error(j.error ?? "Save-default failed.");
            return {
              updated: 0,
              defaultSaved: Boolean(j.defaultSaved),
              defaultCleared: Boolean(j.defaultCleared),
            };
          }),
        );
      }

      const results = await Promise.all(requests);
      const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
      const anyDefaultSaved = results.some((r) => r.defaultSaved);
      const anyDefaultCleared = results.some((r) => r.defaultCleared);

      const stamp = clearInstead ? null : overlay;
      setOverlayOverrides((o) => {
        const next = { ...o };
        for (const k of selected) next[k] = stamp;
        return next;
      });
      if (anyDefaultSaved) setDefaultActive(true);
      if (anyDefaultCleared) setDefaultActive(false);

      // Compose a single human-readable summary.
      const parts: string[] = [];
      if (totalUpdated > 0) {
        parts.push(
          clearInstead
            ? `Cleared overlay on ${totalUpdated} item${totalUpdated === 1 ? "" : "s"}`
            : `Applied overlay to ${totalUpdated} item${totalUpdated === 1 ? "" : "s"}`,
        );
      }
      if (anyDefaultSaved) parts.push("set as default for future thumbnails");
      if (anyDefaultCleared) parts.push("default for future thumbnails cleared");
      setOverlayMsg(parts.length ? parts.join(" · ") + "." : null);
    } catch (err) {
      setOverlayMsg((err as Error).message);
    } finally {
      setOverlayBusy(false);
    }
  }

  function effectiveOverlay(c: ThumbnailItem): ThumbnailOverlay | null {
    const key = rowKey(c);
    if (key in overlayOverrides) return overlayOverrides[key];
    return parseOverlay(c.thumbnailOverlay);
  }

  const previewStyle = useMemo(() => overlayStyle(overlay), [overlay]);

  return (
    <section className="space-y-4">
      {confirmNode}
      <OverlayBuilder
        overlay={overlay}
        setOverlay={setOverlay}
        onApply={() => applyOverlay(false)}
        onClear={() => applyOverlay(true)}
        busy={overlayBusy}
        message={overlayMsg}
        selectedCount={selected.size}
        saveAsDefault={saveAsDefault}
        setSaveAsDefault={setSaveAsDefault}
        defaultActive={defaultActive}
      />

      {/* Action bar */}
      <div className="rounded-2xl border border-line bg-card p-4 surface-shadow flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggleAll}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted hover:text-fg hover:bg-elevated transition-colors"
        >
          {allSelected ? <CheckSquare size={13} /> : <Square size={13} />}
          {allSelected ? "Deselect all" : "Select all"}
        </button>
        <span className="text-xs text-subtle">
          {someSelected ? `${selected.size} selected` : "Nothing selected — bulk runs the full catalog"}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {running && (
            <button
              type="button"
              onClick={() => setCancelled(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-rose-700 hover:bg-rose-50 transition-colors"
            >
              Stop after current
            </button>
          )}
          <button
            type="button"
            onClick={startBulk}
            disabled={running}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors shadow-sm shadow-brand-600/25"
          >
            {running ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {running
              ? `Regenerating ${completed}/${total}…`
              : someSelected
              ? `Regenerate ${selected.size} selected`
              : "Regenerate all"}
          </button>
        </div>
      </div>

      {running && total > 0 && (
        <div className="h-1.5 bg-elevated rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-600 transition-all"
            style={{ width: `${Math.round((completed / total) * 100)}%` }}
          />
        </div>
      )}

      {/* Rows */}
      <ul className="rounded-2xl border border-line bg-card surface-shadow divide-y divide-line overflow-hidden">
        {items.map((c) => {
          const key = rowKey(c);
          const override = overrides[key];
          const error = errors[key];
          const busy = busyKeys.has(key);
          const thumb = override?.thumbnail ?? c.thumbnail;
          const isSel = selected.has(key);
          const stored = effectiveOverlay(c);
          const KindIcon = c.kind === "pathway" ? Map : BookOpen;
          return (
            <li key={key} className="px-4 py-3 flex items-center gap-4">
              <button
                type="button"
                onClick={() => toggleOne(c)}
                className="text-muted hover:text-fg shrink-0"
                aria-label={isSel ? "Deselect" : "Select"}
              >
                {isSel ? <CheckSquare size={15} /> : <Square size={15} />}
              </button>

              <div className="relative w-20 h-12 rounded-lg overflow-hidden bg-elevated border border-line flex items-center justify-center shrink-0">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <ImageIcon size={16} className="text-subtle" />
                )}
                {stored && !isSel && (
                  <div className="absolute inset-0" style={overlayStyle(stored)} />
                )}
                {isSel && (
                  <div className="absolute inset-0" style={previewStyle} />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-fg truncate inline-flex items-center gap-1.5">
                  <KindIcon size={12} className={c.kind === "pathway" ? "text-violet-600" : "text-brand-600"} />
                  {c.title}
                </p>
                <p className="text-[11px] text-subtle truncate">
                  <span className="uppercase tracking-wider font-semibold">
                    {c.kind === "pathway" ? "Pathway" : "Course"}
                  </span>
                  {" · "}
                  {c.category ?? "Uncategorised"} · {c.status}
                  {stored && (
                    <>
                      {" · "}
                      <span className="text-brand-700">overlay set</span>
                    </>
                  )}
                </p>
                {override?.motifs && override.motifs.length > 0 && (
                  <p className="text-[10px] text-muted truncate mt-0.5">
                    Motifs: {override.motifs.join(", ")}
                  </p>
                )}
                {error && (
                  <p className="text-[11px] text-rose-700 mt-0.5 inline-flex items-center gap-1">
                    <AlertCircle size={10} /> {error}
                  </p>
                )}
                {override && !error && (
                  <p className="text-[10px] text-emerald-700 mt-0.5 inline-flex items-center gap-1">
                    <CheckCircle2 size={10} /> Regenerated this session
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => regenOne(c)}
                disabled={busy || running}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-fg hover:bg-elevated disabled:opacity-40 transition-colors shrink-0"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {busy ? "Generating…" : "Regenerate"}
              </button>
            </li>
          );
        })}
        {items.length === 0 && (
          <li className="px-4 py-8 text-sm text-subtle text-center">
            No courses or pathways in the catalog yet.
          </li>
        )}
      </ul>
    </section>
  );
}

function OverlayBuilder({
  overlay, setOverlay, onApply, onClear, busy, message, selectedCount,
  saveAsDefault, setSaveAsDefault, defaultActive,
}: {
  overlay: ThumbnailOverlay;
  setOverlay: (o: ThumbnailOverlay) => void;
  onApply: () => void;
  onClear: () => void;
  busy: boolean;
  message: string | null;
  selectedCount: number;
  saveAsDefault: boolean;
  setSaveAsDefault: (v: boolean) => void;
  /** True when the platform currently has a site-wide default
   *  configured. Drives the "Default active" badge in the header. */
  defaultActive: boolean;
}) {
  const isGradient = overlay.mode === "gradient";
  const previewStyle = overlayStyle(overlay);

  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-5 surface-shadow space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Palette size={14} className="text-brand-600" />
        <h2 className="text-sm font-semibold text-fg">Colour / gradient overlay</h2>
        <span className="text-[11px] text-subtle">
          · non-destructive · rendered on top of the AI thumbnail
        </span>
        {defaultActive && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200">
            <CheckCircle2 size={10} /> Default active
          </span>
        )}
      </div>

      <div className="grid md:grid-cols-[1fr_auto] gap-4 md:gap-5 items-start">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-subtle w-16">Mode</span>
            <div className="inline-flex rounded-lg ring-1 ring-inset ring-line overflow-hidden">
              {(["solid", "gradient"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() =>
                    setOverlay({
                      ...overlay,
                      mode: m,
                      color2: m === "gradient" ? overlay.color2 ?? "#1e3a8a" : overlay.color2,
                    })
                  }
                  className={
                    "px-3 py-1 text-xs font-semibold transition-colors " +
                    (overlay.mode === m
                      ? "bg-brand-600 text-white"
                      : "bg-card text-muted hover:bg-elevated")
                  }
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <ColorField
              label={isGradient ? "From" : "Colour"}
              value={overlay.color1}
              onChange={(v) => setOverlay({ ...overlay, color1: v })}
            />
            {isGradient && (
              <>
                <ColorField
                  label="To"
                  value={overlay.color2 ?? "#1e3a8a"}
                  onChange={(v) => setOverlay({ ...overlay, color2: v })}
                />
                <div className="flex items-center gap-2 min-w-[180px]">
                  <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-subtle">Angle</span>
                  <input
                    type="range"
                    min={0}
                    max={359}
                    value={overlay.angle}
                    onChange={(e) => setOverlay({ ...overlay, angle: parseInt(e.target.value, 10) })}
                    className="flex-1 accent-brand-600"
                  />
                  <span className="text-[11px] font-mono tabular-nums text-fg w-9 text-right">{overlay.angle}°</span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-subtle w-16">Opacity</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(overlay.opacity * 100)}
              onChange={(e) =>
                setOverlay({ ...overlay, opacity: parseInt(e.target.value, 10) / 100 })
              }
              className="flex-1 accent-brand-600 max-w-[260px]"
            />
            <span className="text-[11px] font-mono tabular-nums text-fg w-10 text-right">
              {Math.round(overlay.opacity * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-subtle w-16">Blend</span>
            <select
              value={overlay.blendMode ?? "normal"}
              onChange={(e) =>
                setOverlay({ ...overlay, blendMode: e.target.value as ThumbnailOverlay["blendMode"] })
              }
              className="bg-card border border-line rounded-lg px-2 py-1 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
            >
              {BLEND_MODES.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 md:flex-col md:items-stretch">
          <div className="relative w-28 h-20 rounded-lg overflow-hidden border border-line shrink-0">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-300 via-slate-400 to-slate-600" />
            <div className="absolute inset-0" style={previewStyle} />
          </div>
          <p className="text-[10px] text-subtle leading-snug md:text-center max-w-[140px]">
            Preview swatch.<br />Selected rows below also show the live overlay.
          </p>
        </div>
      </div>

      {/* "Apply to future thumbnails" toggle — checkbox row above
          the action buttons. Lives between the builder controls and
          the Apply/Clear bar so the operator can see it before they
          commit. When checked, the same overlay JSON is persisted
          as the platform-wide default (PlatformSetting key
          `defaultThumbnailOverlay`) and the course / pathway
          regenerate endpoints will apply it to freshly-generated
          thumbnails that don't already have a per-item overlay. */}
      <div className="pt-3 border-t border-line">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={saveAsDefault}
            onChange={(e) => setSaveAsDefault(e.currentTarget.checked)}
            className="mt-0.5 w-4 h-4 rounded border-line accent-brand-600 cursor-pointer"
          />
          <span className="text-xs leading-snug">
            <span className="font-bold text-fg">Apply to future thumbnails</span>
            <span className="text-muted">
              {" — "}save this overlay as the platform default. New thumbnails
              generated from now on will pick it up automatically. Items with
              their own custom overlay stay untouched.
            </span>
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line">
        <button
          type="button"
          onClick={onApply}
          disabled={busy || (selectedCount === 0 && !saveAsDefault)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors shadow-sm shadow-brand-600/25"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Palette size={12} />}
          {selectedCount > 0
            ? `Apply overlay to ${selectedCount}${saveAsDefault ? " + set default" : ""}`
            : saveAsDefault
              ? "Set as default for future thumbnails"
              : "Apply overlay to selected"}
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={busy || (selectedCount === 0 && !saveAsDefault)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200 hover:bg-rose-100 text-xs font-semibold disabled:opacity-50 transition-colors"
        >
          <Eraser size={12} />
          {selectedCount === 0 && saveAsDefault
            ? "Clear default"
            : selectedCount > 0 && saveAsDefault
              ? "Clear on selected + clear default"
              : "Clear on selected"}
        </button>
        {selectedCount === 0 && !saveAsDefault && (
          <span className="text-[11px] text-subtle">
            Tick items below — or toggle <em>Apply to future thumbnails</em> to save as the default.
          </span>
        )}
        {message && (
          <span
            className={
              "ml-auto text-[11px] " +
              (message.toLowerCase().includes("fail") || message.toLowerCase().includes("error") || message.toLowerCase().includes("invalid")
                ? "text-rose-700"
                : "text-emerald-700")
            }
          >
            {message}
          </span>
        )}
      </div>
    </section>
  );
}

function ColorField({
  label, value, onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-subtle">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded-md border border-line bg-card cursor-pointer p-0.5"
        aria-label={label}
      />
      <span className="text-[11px] font-mono text-muted">{value}</span>
    </label>
  );
}
