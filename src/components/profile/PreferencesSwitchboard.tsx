"use client";

/**
 * Switchboard UI for /profile/preferences. Renders the registered
 * features grouped by FeatureGroupDef, with per-feature toggles, a
 * group toggle that flips every member at once, drag-handle
 * reordering within a group, and preset buttons.
 *
 * Toggles auto-save (debounced) — no separate "Save" button to hunt
 * for. The save indicator at the top of the page shows the latest
 * state.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  GripVertical, Sparkles, Star, Settings, Loader2, Save, CheckCircle2, Eye, EyeOff, Wand2,
} from "lucide-react";
import {
  GROUPS, FEATURES, featuresInGroup as allFeaturesInGroup, type FeatureGroupDef,
  MINIMAL_PRESET, DEFAULT_PRESET, FULL_PRESET, isFeaturePaused,
} from "@/lib/preferences/registry";
import type { FeaturePrefs } from "@/lib/preferences/active";

// Features whose page is paused on this deployment (deploy/paused-routes.mjs)
// get no toggle: flipping them would change nothing. Where nothing is
// paused these are the full registry lists.
const featuresInGroup = (groupId: FeatureGroupDef["id"]) =>
  allFeaturesInGroup(groupId).filter((f) => !isFeaturePaused(f.id));
const shownCount = (ids: Iterable<string>) => [...ids].filter((id) => !isFeaturePaused(id)).length;

interface Props {
  initialPrefs: FeaturePrefs;
}

const DEBOUNCE_MS = 500;

export function PreferencesSwitchboard({ initialPrefs }: Props) {
  const [prefs, setPrefs] = useState<FeaturePrefs>(initialPrefs);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const isFirst = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save whenever prefs change.
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch("/api/profile/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(prefs),
        });
        setSavedAt(new Date());
      } finally {
        setSaving(false);
      }
    }, DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [prefs]);

  // ── Derived view of "is this feature on" ────────────────────────
  const hiddenSet = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);
  const orderedSet = useMemo(() => new Set(prefs.order), [prefs.order]);
  const isOn = (id: string, defaultEnabled: boolean) => {
    if (hiddenSet.has(id)) return false;
    if (!defaultEnabled && !orderedSet.has(id)) return false;
    return true;
  };

  // ── Mutators ────────────────────────────────────────────────────
  function setFeature(id: string, on: boolean, defaultEnabled: boolean) {
    setPrefs((p) => {
      const nextHidden = new Set(p.hidden);
      const nextOrder = p.order.slice();
      if (on) {
        nextHidden.delete(id);
        // For default-off features, "on" requires presence in `order`
        // so foldEffective picks it up. Append if missing.
        if (!defaultEnabled && !nextOrder.includes(id)) nextOrder.push(id);
      } else {
        nextHidden.add(id);
        // Remove from order so it doesn't keep counting as "user opted in".
        const idx = nextOrder.indexOf(id);
        if (idx >= 0) nextOrder.splice(idx, 1);
      }
      return { hidden: Array.from(nextHidden), order: nextOrder };
    });
  }

  function toggleGroup(group: FeatureGroupDef, on: boolean) {
    const ids = featuresInGroup(group.id).map((f) => f.id);
    setPrefs((p) => {
      const nextHidden = new Set(p.hidden);
      const nextOrder = p.order.slice();
      for (const f of featuresInGroup(group.id)) {
        if (on) {
          nextHidden.delete(f.id);
          if (!f.defaultEnabled && !nextOrder.includes(f.id)) nextOrder.push(f.id);
        } else {
          nextHidden.add(f.id);
          const idx = nextOrder.indexOf(f.id);
          if (idx >= 0) nextOrder.splice(idx, 1);
        }
      }
      void ids; // referenced for readability above
      return { hidden: Array.from(nextHidden), order: nextOrder };
    });
  }

  async function applyPreset(preset: "minimal" | "default" | "full") {
    const r = await fetch("/api/profile/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; prefs?: FeaturePrefs };
    if (j.ok && j.prefs) {
      setPrefs(j.prefs);
      setSavedAt(new Date());
    }
  }

  // ── Drag-and-drop reordering within a group ─────────────────────
  // Uses native HTML5 DnD — light, no new dependency. State holds
  // the id being dragged + the id it's hovering over so we can render
  // the drop indicator inline.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  function reorderInGroup(groupId: FeatureGroupDef["id"], fromId: string, toId: string) {
    if (fromId === toId) return;
    const ids = featuresInGroup(groupId).map((f) => f.id);
    // Build the current effective order for THIS group:
    //   - User-ordered ids that belong to the group first, in user order
    //   - Then registry-default ids not yet in user order
    const userOrderInGroup = prefs.order.filter((id) => ids.includes(id));
    const tailIds = ids.filter((id) => !userOrderInGroup.includes(id));
    const current = [...userOrderInGroup, ...tailIds];
    const fromIdx = current.indexOf(fromId);
    const toIdx = current.indexOf(toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const reordered = current.slice();
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    // Splice reordered group's ids back into the full `order` array
    // in place, preserving the position of other groups' ids.
    setPrefs((p) => {
      const others = p.order.filter((id) => !ids.includes(id));
      // Strategy: just prepend the reordered group ids; the picker
      // / sidebar reads order top-to-bottom and falls back to
      // registry order for ids not listed.
      return { ...p, order: [...others, ...reordered] };
    });
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Status + preset row ----------------------------------- */}
      <div className="rounded-2xl border border-line bg-card-solid p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          {saving
            ? <><Loader2 size={12} className="animate-spin text-fg-muted" /> <span className="text-fg-muted">Saving…</span></>
            : savedAt
              ? <><CheckCircle2 size={12} className="text-emerald-700" /> <span className="text-fg-muted">Saved</span></>
              : <><Save size={12} className="text-fg-muted" /> <span className="text-fg-muted">Auto-saves</span></>
          }
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <PresetButton icon={Star}     label="Minimal" sub={`${shownCount(MINIMAL_PRESET)} features`} onClick={() => applyPreset("minimal")} />
          <PresetButton icon={Settings} label="Default" sub={`${shownCount(DEFAULT_PRESET)} features`} onClick={() => applyPreset("default")} />
          <PresetButton icon={Wand2}    label="Full"    sub={`${shownCount(FULL_PRESET)} features`}    onClick={() => applyPreset("full")} />
        </div>
      </div>

      {/* Group cards ------------------------------------------- */}
      {GROUPS.map((group) => {
        const items = featuresInGroup(group.id);
        if (items.length === 0) return null;
        // Apply user order WITHIN the group, then registry-order tail.
        const userOrderInGroup = prefs.order.filter((id) => items.find((i) => i.id === id));
        const tailItems = items.filter((i) => !userOrderInGroup.includes(i.id));
        const orderedItems = [
          ...userOrderInGroup.map((id) => items.find((i) => i.id === id)!).filter(Boolean),
          ...tailItems,
        ];
        const onCount = orderedItems.filter((f) => isOn(f.id, f.defaultEnabled)).length;
        const allOn = onCount === orderedItems.length;
        const allOff = onCount === 0;

        return (
          <section
            key={group.id}
            className="relative rounded-2xl border border-line bg-card-solid overflow-hidden"
          >
            {/* Gradient header strip — flat colour at the back, soft
                gradient on top, hairline divider below. Matches the
                line + gradient aesthetic. */}
            <div className={`bg-gradient-to-r ${group.gradient} px-4 py-3 border-b border-line flex items-center justify-between gap-3 flex-wrap`}>
              <div className="min-w-0">
                <p className="text-[10.5px] font-mono uppercase tracking-[0.22em] font-bold text-fg">
                  {group.label}
                </p>
                <p className="text-[11.5px] text-fg-muted leading-tight mt-0.5">{group.description}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10.5px] font-mono uppercase tracking-[0.14em] text-fg-muted">
                  {onCount}/{orderedItems.length} on
                </span>
                <button
                  type="button"
                  onClick={() => toggleGroup(group, !allOn)}
                  className={
                    "inline-flex items-center gap-1 px-2 py-1 rounded text-[10.5px] uppercase tracking-[0.14em] font-bold ring-1 ring-inset transition-colors " +
                    (allOn
                      ? "bg-card-solid text-fg-muted ring-line hover:bg-elevated"
                      : allOff
                        ? "bg-brand-50 text-brand-800 ring-brand-200 hover:bg-brand-100"
                        : "bg-card-solid text-fg ring-line hover:bg-elevated")
                  }
                  title={allOn ? "Turn every feature in this group off" : "Turn every feature in this group on"}
                >
                  {allOn ? <><EyeOff size={10} /> All off</> : <><Eye size={10} /> All on</>}
                </button>
              </div>
            </div>

            {/* Feature rows ---------------------------------- */}
            <ul className="divide-y divide-line/60">
              {orderedItems.map((f) => {
                const on = isOn(f.id, f.defaultEnabled);
                const isOver = dragOverId === f.id && dragId !== f.id;
                return (
                  <li
                    key={f.id}
                    draggable
                    onDragStart={(e) => {
                      setDragId(f.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragId && dragId !== f.id) setDragOverId(f.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverId === f.id) setDragOverId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragId && dragId !== f.id) reorderInGroup(group.id, dragId, f.id);
                      setDragId(null);
                      setDragOverId(null);
                    }}
                    onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                    className={
                      "px-3 py-2.5 flex items-center gap-3 transition-colors " +
                      (isOver ? "bg-brand-50/50" : "hover:bg-elevated")
                    }
                  >
                    <span className="shrink-0 text-fg-subtle cursor-grab active:cursor-grabbing">
                      <GripVertical size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-fg truncate">{f.label}</p>
                      <p className="text-[11.5px] text-fg-muted leading-snug">{f.description}</p>
                    </div>
                    <Toggle
                      checked={on}
                      onChange={(v) => setFeature(f.id, v, f.defaultEnabled)}
                      labelOn="Visible"
                      labelOff="Hidden"
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <p className="text-[11px] text-fg-subtle text-center">
        New features added to the platform won&apos;t appear here until they&apos;re registered in
        <code className="mx-1 px-1 rounded bg-elevated text-[10.5px]">src/lib/preferences/registry.ts</code>.
        Affects {shownCount(FEATURES.map((f) => f.id))} features today.
      </p>
    </div>
  );
}

// ── Atoms ───────────────────────────────────────────────────────

function PresetButton({
  icon: Icon, label, sub, onClick,
}: {
  icon: React.ElementType;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-elevated ring-1 ring-inset ring-line hover:bg-card transition-colors group"
    >
      <span className="inline-flex w-6 h-6 rounded-md bg-brand-50 text-brand-700 items-center justify-center ring-1 ring-inset ring-brand-200">
        <Icon size={11} />
      </span>
      <span className="flex flex-col items-start leading-tight">
        <span className="text-[11px] font-bold text-fg">{label}</span>
        <span className="text-[9.5px] text-fg-subtle">{sub}</span>
      </span>
    </button>
  );
}

/** Pill toggle that flips between "Visible" and "Hidden" states.
 *  Matches the platform's flat + line aesthetic — a small track with
 *  a sliding thumb, no gradients (those live on the group cards). */
function Toggle({
  checked, onChange, labelOn, labelOff,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  labelOn: string;
  labelOff: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={
        "shrink-0 relative inline-flex items-center w-[88px] h-[26px] rounded-full ring-1 ring-inset transition-colors " +
        (checked
          ? "bg-brand-100 ring-brand-300"
          : "bg-elevated ring-line")
      }
    >
      <span
        aria-hidden
        className={
          "absolute top-[2px] left-[2px] w-[22px] h-[22px] rounded-full bg-card-solid shadow-sm ring-1 ring-inset ring-line transition-transform " +
          (checked ? "translate-x-[60px]" : "translate-x-0")
        }
      />
      <span
        className={
          "absolute text-[9.5px] font-bold uppercase tracking-[0.14em] transition-opacity " +
          (checked
            ? "left-[10px] text-brand-800 opacity-100"
            : "left-[10px] text-fg-muted opacity-0")
        }
      >
        {labelOn}
      </span>
      <span
        className={
          "absolute text-[9.5px] font-bold uppercase tracking-[0.14em] transition-opacity " +
          (!checked
            ? "right-[10px] text-fg-muted opacity-100"
            : "right-[10px] text-fg-muted opacity-0")
        }
      >
        {labelOff}
      </span>
    </button>
  );
}
