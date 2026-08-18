"use client";

/**
 * A small flow-chart editor.
 *
 * Drag a box to move it. Click one box then another to draw an arrow.
 * Double-click to rename. Everything is kept in one document and saved as
 * a whole, so a drag costs nothing until you press Save.
 *
 * Rendering is one SVG for the arrows underneath absolutely-positioned
 * boxes on top: HTML gives real text wrapping and focusable controls,
 * while SVG gives clean lines between arbitrary points. Doing it all in
 * SVG would mean hand-laying every line of text.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, Check, ExternalLink, Loader2, Plus, Undo2 } from "lucide-react";
import {
  NODE_KINDS,
  NODE_KIND_LABEL,
  type ChartDoc,
  type FieldDef,
  type FieldType,
  type FlowEdge,
  type ChartSettings,
  type FlowNode,
  type LimitDef,
  type NodeKind,
} from "@/lib/flowchart/types";
import { fieldsOf, orderedFields, suggestKey, type AnswerValue, type Answers } from "@/lib/flowchart/form";
import { edgeAnchor, routeEdge, toPath } from "@/lib/flowchart/route";
import { labelSize, placeLabels } from "@/lib/flowchart/labels";
import { nodeNumbers } from "@/lib/flowchart/numbering";
import { FlowFormPreview } from "./FlowFormPreview";
import { FlowOptionsRail } from "./FlowOptionsRail";
import { FlowAdminPreview } from "./FlowAdminPreview";
import { FlowShapeLegend } from "./FlowShapeLegend";
import { openFlowChannel, postFlow, readFlow } from "@/lib/flowchart/channel";

/** Keep a computed scroll position inside what the pane can actually do. */
function clampScroll(pane: HTMLElement, top: number): number {
  return Math.max(0, Math.min(top, pane.scrollHeight - pane.clientHeight));
}

/**
 * The thing that actually scrolls when this element needs to move.
 *
 * Not necessarily its nearest `overflow-auto` parent: the canvas pane is
 * `overflow-auto` but sized to its content, so it never scrolls vertically
 * — the page does. Assuming the pane was why lining the chart up with the
 * form worked in one direction and silently did nothing in the other.
 */
function scrollParent(el: HTMLElement): HTMLElement {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement;
}

/**
 * Scroll `mover`'s pane until `mover` sits at the same height as `anchor`.
 *
 * Iterative rather than one calculated jump, because a single pass cannot
 * converge when the other column is `sticky`: scrolling the page also
 * moves the sticky column until it pins, so part of the first scroll is
 * eaten and the pair lands short. Two or three passes settle it, and the
 * loop stops as soon as they line up.
 */
function alignTops(mover: HTMLElement, anchor: HTMLElement, pass = 0) {
  const scroller = scrollParent(mover);
  const delta = mover.getBoundingClientRect().top - anchor.getBoundingClientRect().top;
  if (Math.abs(delta) < 2 || pass > 4) return;

  const top = clampScroll(scroller, scroller.scrollTop + delta);
  const isPage = scroller === document.scrollingElement || scroller === document.documentElement;
  // The document's scrolling element ignores scrollTo() in some engines;
  // window.scrollTo is the one that always takes.
  if (isPage) window.scrollTo({ top, behavior: pass === 0 ? "smooth" : "auto" });
  else scroller.scrollTo({ top, behavior: pass === 0 ? "smooth" : "auto" });

  // Give the first (smooth) pass time to land, then correct instantly.
  window.setTimeout(() => alignTops(mover, anchor, pass + 1), pass === 0 ? 380 : 60);
}

/**
 * One pulse on an element.
 *
 * The class has to come off, force a reflow, and go back on — without the
 * reflow the browser coalesces the two class changes and the animation
 * never restarts, so clicking the same box twice does nothing the second
 * time.
 */
function flash(el: HTMLElement | null | undefined) {
  if (!el) return;
  el.classList.remove("fc-flash");
  void el.offsetWidth;
  el.classList.add("fc-flash");
  window.setTimeout(() => el.classList.remove("fc-flash"), 1000);
}

/** Rail widths, in px. The chart takes whatever is left. */
type RailKey = "form" | "admin" | "options";
type RailWidths = Record<RailKey, number>;

const RAIL_DEFAULTS: RailWidths = { form: 280, admin: 300, options: 300 };
const RAIL_MIN = 200;
const RAIL_MAX = 620;
/** The chart never gives up more than this — see onRailDragMove. */
const CHART_MIN = 280;
const RAIL_STORAGE_KEY = "bhn-flowchart-rails";

function readRails(): RailWidths {
  try {
    const raw = localStorage.getItem(RAIL_STORAGE_KEY);
    if (!raw) return RAIL_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<RailWidths>;
    const clamp = (n: unknown, fallback: number) =>
      typeof n === "number" && Number.isFinite(n)
        ? Math.min(RAIL_MAX, Math.max(RAIL_MIN, Math.round(n)))
        : fallback;
    return {
      form: clamp(parsed.form, RAIL_DEFAULTS.form),
      admin: clamp(parsed.admin, RAIL_DEFAULTS.admin),
      options: clamp(parsed.options, RAIL_DEFAULTS.options),
    };
  } catch {
    return RAIL_DEFAULTS;
  }
}

/**
 * Whether the four-column layout is on, straight from matchMedia.
 *
 * The widths are a runtime value, so the breakpoint has to be one too.
 * Two attempts went through CSS first — a Tailwind arbitrary value
 * (`grid-cols-[var(--fc-cols)]`, which collapsed the grid to a single
 * 34px column) and a hand-written `@media` rule (which the build dropped
 * without a word). Asking the browser directly depends on nothing that
 * can be optimised away.
 */
const WIDE_QUERY = "(min-width: 80rem)";

function subscribeWide(onChange: () => void) {
  const mql = window.matchMedia(WIDE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function wideSnapshot(): boolean {
  return window.matchMedia(WIDE_QUERY).matches;
}

const railListeners = new Set<() => void>();

function subscribeRails(onChange: () => void) {
  railListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    railListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Cached so the snapshot is referentially stable between reads —
 *  useSyncExternalStore loops forever on a fresh object every call. */
let railCache: RailWidths = RAIL_DEFAULTS;
let railCacheRaw: string | null = null;

function railSnapshot(): RailWidths {
  let raw: string | null = null;
  try { raw = localStorage.getItem(RAIL_STORAGE_KEY); } catch { raw = null; }
  if (raw !== railCacheRaw) {
    railCacheRaw = raw;
    railCache = readRails();
  }
  return railCache;
}

function writeRails(next: RailWidths) {
  try { localStorage.setItem(RAIL_STORAGE_KEY, JSON.stringify(next)); } catch { /* not fatal */ }
  railListeners.forEach((fn) => fn());
}

/**
 * Unsaved work, kept out of the page's own memory.
 *
 * The editor holds a whole document in state and only writes it on Save,
 * so anything that unmounts the component — a crash, a stray reload, a
 * closed tab — used to take the edits with it. A draft per chart costs one
 * localStorage write per keystroke-ish and removes that whole class of
 * loss. It is offered back rather than applied silently: waking up to a
 * chart you do not recognise is its own kind of bad.
 */
const DRAFT_PREFIX = "bhn-flowchart-draft:";

interface Draft { at: number; doc: ChartDoc }

function readDraft(chartId: string): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + chartId);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    return d && d.doc && Array.isArray(d.doc.nodes) ? d : null;
  } catch {
    return null;
  }
}

function writeDraft(chartId: string, doc: ChartDoc) {
  try {
    localStorage.setItem(DRAFT_PREFIX + chartId, JSON.stringify({ at: Date.now(), doc }));
  } catch { /* quota or private mode — the editor still works */ }
}

function clearDraft(chartId: string) {
  try { localStorage.removeItem(DRAFT_PREFIX + chartId); } catch { /* nothing to do */ }
}

const GRID = 10;
const snap = (n: number) => Math.round(n / GRID) * GRID;
const uid = () => Math.random().toString(36).slice(2, 9);

export interface ChartRecord {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  data: ChartDoc;
  updatedAt: string;
}

export function FlowChartEditor({
  charts: initialCharts,
  canEdit,
}: {
  charts: ChartRecord[];
  canEdit: boolean;
}) {
  const [charts, setCharts] = useState(initialCharts);
  const [activeId, setActiveId] = useState(initialCharts[0]?.id ?? "");
  const active = charts.find((c) => c.id === activeId) ?? charts[0];

  const [doc, setDoc] = useState<ChartDoc>(active?.data ?? { nodes: [], edges: [] });
  const [history, setHistory] = useState<ChartDoc[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  /**
   * Boxes selected as a group by dragging a rectangle over them.
   *
   * Kept alongside `selected` rather than replacing it: the options rail,
   * the form alignment and the flash all work on ONE box, and a group of
   * six has no single set of options to show. `selected` stays the box
   * those columns talk about; this is what a drag moves.
   */
  const [groupIds, setGroupIds] = useState<string[]>([]);
  /** The rectangle being dragged, in chart coordinates. */
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  /**
   * The live rectangle, mirrored in a ref.
   *
   * `pointerup` runs a handler created in an earlier render, so reading
   * the rectangle from state there sees whatever it was when that render
   * happened. On a slow drag there are renders in between and it looks
   * fine; on a quick flick the move and the release land in one batch,
   * the handler sees the zero-size starting rectangle, and the marquee
   * silently does nothing. The ref is always current.
   */
  const marqueeRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  /**
   * The live end of a connection being drawn, in chart coordinates.
   *
   * Set from the moment "connect" is pressed, so the line exists before
   * the pointer has moved — starting it on the first pointermove means
   * nothing is drawn until you happen to twitch, which reads as the
   * button not having worked.
   */
  const [linkTip, setLinkTip] = useState<{ x: number; y: number } | null>(null);
  /**
   * Re-attaching one end of an existing arrow. Same rubber band, but on
   * release it rewrites that end rather than creating an arrow.
   */
  const [relink, setRelink] = useState<{ edgeId: string; end: "from" | "to" } | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  /**
   * Which question the options rail has open. Selecting a box on its own
   * shows all of its questions; clicking one in the live form singles that
   * one out, so "this field's settings" is one click from the field.
   */
  const [selectedField, setSelectedField] = useState<{ nodeId: string; index: number } | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  /**
   * The node the pointer is over, on either side of the split. Hovering a
   * box lights its field; hovering a field lights its box. An arrow has no
   * field of its own, so it lights the boxes at BOTH its ends — which is
   * the useful reading of "what does this arrow connect".
   */
  const [hoverNodes, setHoverNodes] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const formPaneRef = useRef<HTMLElement | null>(null);
  const adminPaneRef = useRef<HTMLElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    id: string; dx: number; dy: number;
    /** Where every group member started, so one delta moves them all. */
    group?: { id: string; x: number; y: number }[];
    anchor?: { x: number; y: number };
  } | null>(null);
  /**
   * How wide the canvas pane actually is. The chart only needs ~650px, but
   * the pane is usually much wider, and that leftover width is where a
   * blocked arrow label goes. Without measuring it the canvas would end at
   * the last box and every label would be crammed into the column.
   */
  const [paneW, setPaneW] = useState(0);
  /**
   * "⌘Z" or "Ctrl+Z". Read from the browser rather than guessed, and only
   * after mount — deciding on the server would print the wrong one for
   * half the readers and disagree with what the client renders.
   */
  const [shortcutHint, setShortcutHint] = useState("");
  useEffect(() => {
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShortcutHint(mac ? "⌘Z" : "Ctrl+Z");
  }, []);

  /**
   * How wide each rail is.
   *
   * The saved widths are external state (localStorage), read as such so
   * the server snapshot is the defaults and the first paint matches. A
   * drag in progress is separate and transient: committing every
   * pointermove to storage would be a write per frame, and the saved
   * value should be where you let go, not every pixel on the way.
   */
  const savedRails = useSyncExternalStore(subscribeRails, railSnapshot, () => RAIL_DEFAULTS);
  const isWide = useSyncExternalStore(subscribeWide, wideSnapshot, () => false);
  const [dragRails, setDragRails] = useState<RailWidths | null>(null);
  const rails = dragRails ?? savedRails;
  const dragRailRef = useRef<{ key: RailKey; startX: number; startW: number } | null>(null);

  /**
   * Drag the seam to the LEFT of a rail. Moving left widens it, because
   * that is the edge being pulled — the chart on the other side gives up
   * the pixels, which is what makes the chart column the flexible one.
   */
  const onRailDragStart = (e: React.PointerEvent, key: RailKey) => {
    e.preventDefault();
    dragRailRef.current = { key, startX: e.clientX, startW: rails[key] };
    setDragRails(rails);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* keep dragging */ }
  };

  const onRailDragMove = (e: React.PointerEvent) => {
    const d = dragRailRef.current;
    if (!d) return;
    let next = Math.min(RAIL_MAX, Math.max(RAIL_MIN, d.startW + (d.startX - e.clientX)));

    // The chart is the column that absorbs every change, so without a
    // floor a rail can be dragged until the chart is a sliver — and once
    // it is, there is nothing left to aim at to drag it back.
    const grid = gridRef.current;
    if (grid) {
      const gaps = 32 * 3;
      const others = (["form", "admin", "options"] as RailKey[])
        .filter((k) => k !== d.key)
        .reduce((sum, k) => sum + rails[k], 0);
      const room = grid.clientWidth - gaps - others - CHART_MIN;
      if (Number.isFinite(room)) next = Math.max(RAIL_MIN, Math.min(next, room));
    }

    setDragRails((r) => ({ ...(r ?? savedRails), [d.key]: next }));
  };

  const onRailDragEnd = () => {
    if (!dragRailRef.current) return;
    dragRailRef.current = null;
    if (dragRails) writeRails(dragRails);
    setDragRails(null);
  };

  const resetRails = () => {
    setDragRails(null);
    writeRails(RAIL_DEFAULTS);
  };

  /**
   * Bring a box into view in the canvas pane.
   *
   * The mirror of the form scrolling to a selected box: whichever column
   * you click in, all three end up pointing at the same thing. Computed
   * from the node's own coordinates rather than by finding its element,
   * because the box may be scrolled far outside the pane.
   */
  /**
   * Line a box up with the question it asks, and pulse both.
   *
   * Whichever column you click in, the other one scrolls so its half of
   * the pair sits at the SAME height on screen — reading across the page
   * then means reading one thing, not hunting for where the other column
   * put it. `from` says which column the click came from, because that is
   * the one that must not move.
   *
   * Both ends flash afterwards: a pane that scrolls while you are looking
   * at the other column is otherwise a silent change.
   */
  const alignAndFlash = (id: string, from: "chart" | "form") => {
    const canvasPane = paneRef.current;
    const box = canvasPane?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`);
    // A box whose questions are hidden by a branch rule has no row; the
    // selection still stands, there is just nothing to line it up with.
    const row = formPaneRef.current?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`);

    // Whichever column was clicked stays put; the other moves to meet it.
    const mover = from === "chart" ? row : box;
    const anchor = from === "chart" ? box : row;

    if (mover && anchor) alignTops(mover, anchor);

    // The form has no horizontal axis, so bringing a box into view
    // sideways is always the canvas pane's job.
    if (canvasPane && from === "form") {
      const node = doc.nodes.find((n) => n.id === id);
      if (node && canvasPane.scrollWidth > canvasPane.clientWidth) {
        canvasPane.scrollTo({
          left: Math.max(0, (node.x + node.w / 2) * scale - canvasPane.clientWidth / 2),
          behavior: "smooth",
        });
      }
    }

    flash(box);
    flash(row);

    // The admin column shows the same question; a selection that moves two
    // columns and leaves the third behind is worse than not moving at all.
    const adminRow = adminPaneRef.current?.querySelector<HTMLElement>(
      `[data-node-id="${CSS.escape(id)}"]`,
    );
    if (adminRow) {
      const pane = adminPaneRef.current!;
      const offset = adminRow.getBoundingClientRect().top - pane.getBoundingClientRect().top;
      const past = offset + adminRow.offsetHeight - pane.clientHeight;
      if (offset < 0) pane.scrollTo({ top: pane.scrollTop + offset - 8, behavior: "smooth" });
      else if (past > 0) pane.scrollTo({ top: pane.scrollTop + past + 8, behavior: "smooth" });
      flash(adminRow);
    }
  };
  /**
   * Measure the canvas pane after every render, and on window resize.
   *
   * This used to be a ResizeObserver alone, which is the obvious tool and
   * turned out to be the wrong bet: in one of the browsers this runs in it
   * never fired at all, so the pane width stayed at whatever it was on the
   * first paint and the chart silently never rescaled. Reading the width
   * in a layout effect covers every React-driven change — dragging a
   * column seam, collapsing the sidebar, switching charts — and needs
   * nothing from the environment beyond `clientWidth`.
   *
   * The window listener is for resizes that would not otherwise re-render.
   */
  /**
   * Accept a new pane width only if it differs enough to matter.
   *
   * The deadband lives in the updater rather than at each call site, so
   * every path that measures gets it — including the ResizeObserver,
   * which observes the element whose size this value decides. That is a
   * loop by construction: measure, re-size, observe, measure. Returning
   * the previous value makes React bail out of the render entirely, which
   * is what stops it rather than merely slowing it down.
   *
   * Missing it on this path is what threw "maximum update depth exceeded"
   * a second time, after the same bug had been fixed on the render path.
   */
  const acceptPaneW = useCallback((w: number) => {
    setPaneW((prev) => (Math.abs(w - prev) <= 2 ? prev : w));
  }, []);

  const measurePane = useCallback(() => {
    const el = paneRef.current;
    if (el) acceptPaneW(el.clientWidth);
  }, [acceptPaneW]);

  /**
   * Measure the canvas pane after every render.
   *
   * No dependency list on purpose: the pane's width changes for reasons
   * this component never sees as state — a rail dragged, the sidebar
   * folded away, the page reflowed.
   *
   * The deadband lives in acceptPaneW, so this path and the observer
   * cannot disagree about it.
   */
  useLayoutEffect(() => {
    const el = paneRef.current;
    if (el) acceptPaneW(el.clientWidth);
  });

  useEffect(() => {
    window.addEventListener("resize", measurePane);

    // ResizeObserver catches changes that never re-render this component,
    // such as the sidebar collapsing. It also observes the element whose
    // size this measurement decides, so its callbacks are coalesced onto
    // one animation frame: a burst of notifications then costs a single
    // measurement instead of one render each, which is the difference
    // between a settling layout and "maximum update depth exceeded".
    //
    // This path could not be exercised locally — ResizeObserver does not
    // fire in the browser used to check this — so the deadband in
    // acceptPaneW is the guard that actually has to hold.
    let frame = 0;
    const onResize = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measurePane();
      });
    };

    const el = paneRef.current;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
    if (el && ro) ro.observe(el);
    return () => {
      window.removeEventListener("resize", measurePane);
      if (frame) cancelAnimationFrame(frame);
      ro?.disconnect();
    };
  }, [measurePane]);

  // Switching charts abandons nothing — the previous one was either saved
  // or explicitly discarded, so load straight over the top.
  useEffect(() => {
    const c = charts.find((x) => x.id === activeId);
    if (c) {
      setDoc(c.data);
      setHistory([]);
      setDirty(false);
      setSelected(null);
      setLinkFrom(null);
    }
  }, [activeId, charts]);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      setDoc(h[h.length - 1]);
      setDirty(true);
      return h.slice(0, -1);
    });
  }, []);

  /**
   * Escape backs out of a connection; Delete removes a selected arrow.
   *
   * Bound to the window rather than the canvas because the canvas is not
   * focusable — after clicking "connect" in the options rail the focus is
   * over in that column, and Escape still has to work.
   */
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      // Never steal a key from something being typed into.
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      // Cmd/Ctrl+Z. Deliberately after the "is something being typed
      // into" check above, so inside a text field it falls through to the
      // browser's own undo — which is what you meant by it there.
      if ((ev.metaKey || ev.ctrlKey) && !ev.shiftKey && ev.key.toLowerCase() === "z") {
        if (!canEdit) return;
        ev.preventDefault();
        undo();
        return;
      }
      if (ev.key === "Escape") { setLinkFrom(null); setRelink(null); setLinkTip(null); }
      if ((ev.key === "Delete" || ev.key === "Backspace") && selectedEdge && canEdit) {
        ev.preventDefault();
        removeEdgeRef.current(selectedEdge);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedEdge, canEdit, undo]);

  /** Offer to restore, rather than silently applying someone's old draft. */
  const [draftOffer, setDraftOffer] = useState<Draft | null>(null);

  useEffect(() => {
    if (!active) return;
    const d = readDraft(active.id);
    // Only worth offering if it actually differs from what the server has.
    // Read here rather than during render: localStorage does not exist on
    // the server, and deriving the banner in a memo would make the first
    // client render disagree with the markup Next sent.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftOffer(d && JSON.stringify(d.doc) !== JSON.stringify(active.data) ? d : null);
    // Deliberately keyed on the chart, not on `doc`: this is the question
    // asked when a chart is opened, not after every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  useEffect(() => {
    if (!active || !dirty) return;
    const id = window.setTimeout(() => writeDraft(active.id, doc), 400);
    return () => window.clearTimeout(id);
  }, [doc, dirty, active]);

  const mutate = useCallback((next: (d: ChartDoc) => ChartDoc) => {
    setDoc((cur) => {
      setHistory((h) => [...h.slice(-24), cur]);
      setDirty(true);
      return next(cur);
    });
  }, []);

  // ── drag ──────────────────────────────────────────────────────────
  const onNodePointerDown = (n: FlowNode) => (e: React.PointerEvent) => {
    if (!canEdit) return;
    // Pressing a control ON the box is not the start of a drag. Without
    // this the box calls setPointerCapture, the capture retargets the
    // click away from the button, and "connect" looks unclickable — it
    // fires in a synthetic test and never for a real mouse.
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Capture is an optimisation, not a requirement: if the pointer id is
    // not capturable the drag must still work rather than dying here.
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* keep dragging */ }
    // rect is the SCALED box, so screen pixels have to be divided back
    // into chart coordinates or a drag runs away from the pointer.
    const inGroup = groupIds.includes(n.id) && groupIds.length > 1;
    dragRef.current = {
      id: n.id,
      dx: (e.clientX - rect.left) / scale - n.x,
      dy: (e.clientY - rect.top) / scale - n.y,
      // Snapshot taken once, at the start: applying a delta to live
      // positions on every move compounds the rounding and the group
      // slowly drifts apart.
      group: inGroup
        ? doc.nodes.filter((m) => groupIds.includes(m.id)).map((m) => ({ id: m.id, x: m.x, y: m.y }))
        : undefined,
      anchor: { x: n.x, y: n.y },
    };
    setSelected(n.id);
  };

  /**
   * Start a rectangle on empty canvas.
   *
   * Only when the press lands on the canvas itself — a press on a box is a
   * drag and a press on an arrow is a selection, and neither should paint
   * a rectangle over the chart.
   */
  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (!canEdit || linkFrom || relink) return;

    // Anything that is not a box or a control counts as background. The
    // previous test — target must BE the canvas — failed the moment
    // another full-size layer sat on top of it, which is exactly what the
    // arrows SVG is; asking "did this land on something that handles its
    // own press?" does not care how many layers there are.
    const t = e.target as HTMLElement | null;
    if (t?.closest("[data-node-id], button, input, select, textarea, a")) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    marqueeRef.current = { x0: x, y0: y, x1: x, y1: y };
    setMarquee(marqueeRef.current);
    // Capture so a rectangle dragged past the edge of the canvas keeps
    // tracking, and so the release still lands here rather than nowhere.
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* fine without it */ }
  };

  const finishMarquee = () => {
    const m = marqueeRef.current;
    marqueeRef.current = null;
    setMarquee(null);
    if (!m) return;

    const x = Math.min(m.x0, m.x1), y = Math.min(m.y0, m.y1);
    const w = Math.abs(m.x1 - m.x0), h = Math.abs(m.y1 - m.y0);
    // A rectangle you did not mean to draw is a click on the background,
    // which clears the selection rather than selecting nothing loudly.
    if (w < 4 && h < 4) {
      setGroupIds([]);
      setSelected(null);
      setSelectedEdge(null);
      return;
    }
    const hit = doc.nodes.filter(
      (n) => n.x < x + w && n.x + n.w > x && n.y < y + h && n.y + n.h > y,
    );
    setGroupIds(hit.map((n) => n.id));
    // The rail needs one box to talk about; the topmost is the least
    // surprising choice.
    const primary = [...hit].sort((a, b) => a.y - b.y || a.x - b.x)[0] ?? null;
    setSelected(primary ? primary.id : null);
    setSelectedEdge(null);
  };

  const onCanvasPointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();

    // While connecting, the loose end of the line is wherever the pointer
    // is — in chart coordinates, so it lands on the same spot the arrow
    // will when it is dropped.
    if (rect && (linkFrom || relink)) {
      setLinkTip({
        x: (e.clientX - rect.left) / scale,
        y: (e.clientY - rect.top) / scale,
      });
    }

    if (rect && marqueeRef.current) {
      marqueeRef.current = {
        ...marqueeRef.current,
        x1: (e.clientX - rect.left) / scale,
        y1: (e.clientY - rect.top) / scale,
      };
      setMarquee(marqueeRef.current);
    }

    const d = dragRef.current;
    if (!d || !rect) return;
    const x = snap(Math.max(0, (e.clientX - rect.left) / scale - d.dx));
    const y = snap(Math.max(0, (e.clientY - rect.top) / scale - d.dy));

    if (d.group && d.anchor) {
      const ddx = x - d.anchor.x;
      const ddy = y - d.anchor.y;
      const start = new Map(d.group.map((g) => [g.id, g]));
      setDoc((cur) => ({
        ...cur,
        nodes: cur.nodes.map((n) => {
          const s0 = start.get(n.id);
          return s0
            ? { ...n, x: Math.max(0, s0.x + ddx), y: Math.max(0, s0.y + ddy) }
            : n;
        }),
      }));
    } else {
      setDoc((cur) => ({
        ...cur,
        nodes: cur.nodes.map((n) => (n.id === d.id ? { ...n, x, y } : n)),
      }));
    }
    setDirty(true);
  };

  const endDrag = () => {
    if (dragRef.current) setHistory((h) => h); // drag already applied
    dragRef.current = null;
  };

  // ── node + edge operations ────────────────────────────────────────
  const addNode = (kind: NodeKind) => {
    const id = uid();
    mutate((d) => {
      const taken = d.nodes.flatMap((n) => fieldsOf(n).map((f) => f.key));
      const text = kind === "question" ? "New question" : NODE_KIND_LABEL[kind];
      return {
        ...d,
        nodes: [
          ...d.nodes,
          {
            id,
            kind,
            x: 40,
            y: 40 + d.nodes.length * 12,
            w: kind === "note" ? 210 : 190,
            h: kind === "decision" ? 78 : kind === "note" ? 62 : 58,
            text,
            // A question is useless without somewhere to store its answer,
            // so give it a key immediately rather than making that a
            // separate step someone can forget.
            ...(kind === "question"
              ? { field: { key: suggestKey(text, taken), type: "text" as FieldType } }
              : {}),
          },
        ],
      };
    });
    setSelected(id);
  };

  const removeNode = (id: string) =>
    mutate((d) => ({
      nodes: d.nodes.filter((n) => n.id !== id),
      edges: d.edges.filter((e) => e.from !== id && e.to !== id),
    }));

  /** Begin drawing from a box; the line exists immediately. */
  const startLink = (id: string) => {
    const n = doc.nodes.find((x) => x.id === id);
    setLinkFrom(id);
    setRelink(null);
    setLinkTip(n ? { x: n.x + n.w / 2, y: n.y + n.h / 2 } : null);
  };

  /** Begin dragging one end of an existing arrow onto a different box. */
  const startRelink = (edgeId: string, end: "from" | "to") => {
    const e = doc.edges.find((x) => x.id === edgeId);
    const anchorId = e ? (end === "to" ? e.from : e.to) : null;
    const n = doc.nodes.find((x) => x.id === anchorId);
    setRelink({ edgeId, end });
    setLinkFrom(null);
    setLinkTip(n ? { x: n.x + n.w / 2, y: n.y + n.h / 2 } : null);
  };

  const cancelLinking = () => { setLinkFrom(null); setRelink(null); setLinkTip(null); };

  const link = (toId: string) => {
    if (relink) {
      const { edgeId, end } = relink;
      // Refuse an arrow that would start and finish in the same box —
      // it has no meaning and routes to a scribble.
      mutate((d) => ({
        ...d,
        edges: d.edges.map((e) => {
          if (e.id !== edgeId) return e;
          const next = { ...e, [end]: toId };
          return next.from === next.to ? e : next;
        }),
      }));
      cancelLinking();
      return;
    }
    if (!linkFrom || linkFrom === toId) { cancelLinking(); return; }
    mutate((d) =>
      d.edges.some((e) => e.from === linkFrom && e.to === toId)
        ? d
        : { ...d, edges: [...d.edges, { id: uid(), from: linkFrom, to: toId }] },
    );
    cancelLinking();
  };

  const patchNode = (id: string, patch: Partial<FlowNode>) =>
    mutate((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));

  /**
   * Edit one of a box's questions.
   *
   * A box can carry several, so every edit normalises onto `fields[]` and
   * clears the single `field`. Keeping both shapes alive is what makes an
   * editor drift out of sync with the form it is supposed to describe.
   */
  const writeFields = (id: string, fn: (fields: FieldDef[]) => FieldDef[]) =>
    mutate((d) => ({
      ...d,
      nodes: d.nodes.map((n) =>
        n.id === id ? { ...n, fields: fn(fieldsOf(n)), field: undefined } : n,
      ),
    }));

  const patchField = (id: string, i: number, patch: Partial<FieldDef>) =>
    writeFields(id, (fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  const addField = (id: string) =>
    writeFields(id, (fs) => {
      const taken = doc.nodes.flatMap((n) => fieldsOf(n).map((f) => f.key));
      return [...fs, { key: suggestKey("answer", taken), type: "text" as FieldType }];
    });

  /**
   * Move a question one place up or down inside its box.
   *
   * Offered from the live form and the options rail as well as the sheet,
   * because "this question should come first" is a thought you have while
   * reading the form, not while looking at a grid.
   */
  const moveField = (id: string, i: number, dir: -1 | 1) =>
    writeFields(id, (fs) => {
      const to = i + dir;
      if (to < 0 || to >= fs.length) return fs;
      const next = [...fs];
      const [m] = next.splice(i, 1);
      next.splice(to, 0, m);
      return next;
    });

  const removeField = (id: string, i: number) =>
    writeFields(id, (fs) => fs.filter((_, j) => j !== i));

  /** Edit a limit box's rule. A `rule` node with no limit yet gets one. */
  const patchLimit = (id: string, patch: Partial<LimitDef>) =>
    mutate((d) => ({
      ...d,
      nodes: d.nodes.map((n) =>
        n.id === id
          ? { ...n, limit: { field: "", ...n.limit, ...patch } }
          : n,
      ),
    }));

  const patchSettings = (patch: Partial<ChartSettings>) =>
    mutate((d) => ({ ...d, settings: { ...d.settings, ...patch } }));

  /**
   * Keep a popped-out admin panel in step.
   *
   * The panel is a view of the document being edited, not of the one last
   * saved, so it is fed from state rather than from the server — an
   * unsaved experiment shows up there too, which is the whole point of
   * having it open on a second screen.
   *
   * Refs hold the latest doc and handler so the channel is opened once and
   * never torn down mid-conversation; re-subscribing on every keystroke
   * would drop the request a panel sends on mount.
   */
  const docRef = useRef(doc);
  const titleRef = useRef(active?.title ?? "");
  const patchSettingsRef = useRef(patchSettings);
  const applyDocRef = useRef((next: ChartDoc) => mutate(() => next));
  useEffect(() => {
    docRef.current = doc;
    titleRef.current = active?.title ?? "";
    patchSettingsRef.current = patchSettings;
    applyDocRef.current = (next: ChartDoc) => mutate(() => next);
  });

  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    const ch = openFlowChannel();
    channelRef.current = ch;
    if (!ch) return;
    ch.onmessage = (e) => {
      const m = readFlow(e);
      if (!m) return;
      if (m.type === "request") {
        postFlow(ch, { type: "doc", doc: docRef.current, title: titleRef.current });
      } else if (m.type === "settings") {
        patchSettingsRef.current(m.patch);
      } else if (m.type === "doc-edit") {
        // Goes through mutate() so it lands in the undo history like any
        // other edit — a change made in the other window should be as
        // undoable here as one made in this one.
        applyDocRef.current(m.doc);
      }
    };
    const bye = () => postFlow(ch, { type: "editor-closed" });
    window.addEventListener("pagehide", bye);
    return () => {
      bye();
      window.removeEventListener("pagehide", bye);
      ch.close();
      channelRef.current = null;
    };
  }, []);

  // Push on change, coalesced — a drag fires this on every pointermove.
  useEffect(() => {
    const id = window.setTimeout(() => {
      postFlow(channelRef.current, { type: "doc", doc, title: active?.title ?? "" });
    }, 120);
    return () => window.clearTimeout(id);
  }, [doc, active?.title]);

  const openPanelWindow = () => {
    window.open(
      "/flowchart-panel",
      "bhn-flowchart-panel",
      "width=560,height=920,menubar=no,toolbar=no,location=no",
    );
  };

  const patchEdge = (id: string, patch: Partial<FlowEdge>) =>
    mutate((d) => ({ ...d, edges: d.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));

  const removeEdgeRef = useRef((id: string) => {
    mutate((d) => ({ ...d, edges: d.edges.filter((e) => e.id !== id) }));
    setSelectedEdge(null);
  });

  const removeEdge = (id: string) =>
    mutate((d) => ({ ...d, edges: d.edges.filter((e) => e.id !== id) }));

  // ── persistence ───────────────────────────────────────────────────
  const save = async () => {
    if (!active) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/workspace/flowcharts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", id: active.id, data: doc }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) { setMsg(j.error ?? "Could not save."); return; }
      setCharts((cur) => cur.map((c) => (c.id === active.id ? { ...c, data: doc } : c)));
      setDirty(false);
      clearDraft(active.id);
      setDraftOffer(null);
      setMsg("Saved.");
    } finally {
      setSaving(false);
    }
  };

  const newChart = async () => {
    const title = window.prompt("Name this chart");
    if (!title) return;
    const res = await fetch("/api/workspace/flowcharts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", title }),
    });
    const j = (await res.json()) as { ok?: boolean; id?: string };
    if (j.ok && j.id) {
      const fresh = await (await fetch("/api/workspace/flowcharts")).json();
      setCharts(fresh.charts);
      setActiveId(j.id);
    }
  };

  // The canvas fills its pane, and grows past it only when the chart is
  // genuinely wider. A fixed generous minimum used to force a horizontal
  // scrollbar on a column layout that never used the space; tying the
  // width to the pane means it never scrolls until it has to, and the
  // spare width is available for labels that need to step aside.
  /**
   * The chart's own size, and how much it has to shrink to fit the column.
   *
   * The chart is drawn at fixed coordinates — that is what lets arrows be
   * routed and labels placed — so "responsive" here means scaling the
   * whole drawing to the width available, not reflowing it. Dragging a
   * column seam then resizes the chart live instead of just revealing
   * more or less of a fixed canvas.
   *
   * Floored at 0.45: past that the labels stop being readable and a
   * scrollbar is the more honest answer.
   */
  const { contentH, scale, bounds } = useMemo(() => {
    const cw = Math.max(620, ...doc.nodes.map((n) => n.x + n.w + 60));
    const ch = Math.max(560, ...doc.nodes.map((n) => n.y + n.h + 60));

    // One pixel narrower than the pane, always. Sized to exactly the pane
    // width, a rounding error puts the canvas a fraction over, a
    // horizontal scrollbar appears, clientWidth drops by the scrollbar's
    // width, the canvas is re-sized to fit, the scrollbar goes away — and
    // round it goes. That feedback loop is what threw React error #185
    // ("maximum update depth exceeded") mid-edit.
    const usable = paneW > 0 ? paneW - 1 : 0;
    const sc = usable > 0 ? Math.max(0.45, Math.min(1, usable / cw)) : 1;
    // Label placement works in unscaled coordinates, so the room it may
    // use is the visible width converted back through the scale.
    return { contentH: ch, scale: sc, bounds: { w: Math.max(cw, usable / sc), h: ch } };
  }, [doc.nodes, paneW]);

  /**
   * What lights up when something is selected: the box itself and every
   * box one arrow away, in either direction.
   *
   * A box in a process is only meaningful next to what feeds it and what
   * it feeds, so selecting one and lighting only that one throws away the
   * answer to the question you were asking. Hover stays narrow — one box
   * — because hover is a pointer sweeping around, not a decision.
   */
  const litNodes = useMemo(() => {
    if (hoverNodes.length) return hoverNodes;
    if (!selected) return [];
    const near = new Set<string>([selected]);
    for (const e of doc.edges) {
      if (e.from === selected) near.add(e.to);
      if (e.to === selected) near.add(e.from);
    }
    return [...near];
  }, [selected, hoverNodes, doc.edges]);

  /** Box numbers, so a box can be named out loud. */
  const numbers = useMemo(() => nodeNumbers(doc), [doc]);

  const sel = doc.nodes.find((n) => n.id === selected) ?? null;
  const selEdge = doc.edges.find((e) => e.id === selectedEdge) ?? null;
  const questionKeys = useMemo(
    () => orderedFields(doc).map((f) => ({ key: f.key, label: f.label })),
    [doc],
  );

  if (!active) {
    return (
      <p className="py-14 text-center text-[13.5px] text-muted">
        No charts yet.{canEdit ? " Create one to begin." : ""}
      </p>
    );
  }

  return (
    <div>
      {/* ── chart switcher + actions ─────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line pb-4">
        <select
          value={activeId}
          onChange={(e) => setActiveId(e.target.value)}
          className="border-0 border-b border-line bg-transparent px-0 py-1 text-[13.5px] font-semibold text-fg outline-none focus-visible:border-brand-500"
        >
          {charts.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>

        {canEdit && (
          <>
            <span className="flex items-center gap-2 text-[12.5px] text-muted">
              Add
              {NODE_KINDS.map((k) => (
                <button
                  key={k}
                  onClick={() => addNode(k)}
                  className="font-semibold text-brand-400 transition-colors hover:text-brand-200"
                >
                  {NODE_KIND_LABEL[k].toLowerCase()}
                </button>
              ))}
            </span>
            <button
              onClick={undo}
              disabled={!history.length}
              className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-fg disabled:opacity-40"
            >
              <Undo2 size={12} /> Undo
              <span className="ml-0.5 hidden text-[10px] font-normal text-subtle sm:inline">
                {shortcutHint}
              </span>
            </button>
            <button
              onClick={newChart}
              className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-fg"
            >
              <Plus size={12} /> New chart
            </button>
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-bold text-brand-400 hover:text-brand-200 disabled:opacity-40"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {dirty ? "Save changes" : "Saved"}
            </button>
          </>
        )}
      </div>

      {draftOffer && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-amber-500/60 bg-amber-500/8 px-3 py-2">
          <p className="text-[12.5px] text-fg">
            Unsaved changes from {new Date(draftOffer.at).toLocaleString()} were kept
            after this page closed.
          </p>
          <button
            onClick={() => {
              mutate(() => draftOffer.doc);
              setDraftOffer(null);
            }}
            className="text-[12.5px] font-semibold text-brand-400 hover:text-brand-200"
          >
            Restore them
          </button>
          <button
            onClick={() => {
              if (active) clearDraft(active.id);
              setDraftOffer(null);
            }}
            className="text-[12.5px] text-muted hover:text-fg"
          >
            Discard
          </button>
        </div>
      )}

      {msg && <p className="mt-3 text-[12.5px] text-muted">{msg}</p>}

      <div className="mt-3">
        <FlowShapeLegend />
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-subtle">
        <span className="inline-flex items-center gap-1.5">
          <svg width="26" height="6" aria-hidden><line x1="0" y1="3" x2="26" y2="3" stroke="currentColor" strokeWidth="1.5" className="text-brand-400" /></svg>
          always follows
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="26" height="6" aria-hidden><line x1="0" y1="3" x2="26" y2="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 4" className="text-brand-400" /></svg>
          only when its rule matches
        </span>
        <span>Click an arrow to set or clear its rule.</span>
        <button
          onClick={openPanelWindow}
          className="inline-flex items-center gap-1 font-semibold text-brand-400 hover:text-brand-200"
        >
          <ExternalLink size={11} /> Admin panel in its own window
        </button>
        <button onClick={resetRails} className="text-subtle hover:text-muted">
          Reset column widths
        </button>
      </p>

      {canEdit && (
        <p className="mt-1.5 text-[12.5px] text-subtle">
          Drag a box to move it, or drag a rectangle on empty space to pick up
          several at once. {linkFrom
            ? "Now click the box the arrow should point to, or press Escape."
            : "Click Connect on a box, then click its target to draw an arrow."}
        </p>
      )}

      {/* ── three columns: the chart, the form it makes, the settings
             behind it. Chart takes the slack; the two rails are fixed so
             the controls never reflow as the canvas grows. ─────────── */}
      {/* ── four columns: the chart, the form it makes, the panel the
             organisers get, and the settings behind whatever is selected.
             The chart takes the slack; the three rails are fixed so the
             controls never reflow as the canvas grows. ─────────────── */}
      <div
        ref={gridRef}
        className="mt-3 grid gap-3 xl:gap-8"
        onPointerMove={onRailDragMove}
        onPointerUp={onRailDragEnd}
        onPointerCancel={onRailDragEnd}
        style={{
          // Below the breakpoint this is undefined and the page stacks,
          // which is what the removed `xl:` class used to do.
          gridTemplateColumns: isWide
            ? `minmax(0,1fr) ${rails.form}px ${rails.admin}px ${rails.options}px`
            : undefined,
        }}
      >
      <div ref={paneRef} className="overflow-auto rounded-lg border border-line bg-card">
        {/* Sized in SCREEN pixels so the pane scrolls by what is visible,
            wrapping a drawing that keeps its own coordinate system. */}
        <div style={{ width: bounds.w * scale, height: contentH * scale }}>
        <div
          ref={canvasRef}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={() => { endDrag(); finishMarquee(); }}
          onPointerLeave={() => { endDrag(); finishMarquee(); }}
          className="relative origin-top-left"
          style={{
            width: bounds.w,
            height: bounds.h,
            transform: scale === 1 ? undefined : `scale(${scale})`,
            backgroundImage:
              "radial-gradient(circle, color-mix(in srgb, var(--fg) 9%, transparent) 1px, transparent 1px)",
            backgroundSize: `${GRID * 2}px ${GRID * 2}px`,
          }}
        >
          <Arrows
            doc={doc}
            selectedEdge={selectedEdge}
            onSelect={canEdit ? (id) => { setSelectedEdge(id); setSelected(null); } : undefined}
            hoverNodes={litNodes}
            onHoverEdge={(e) => setHoverNodes(e ? [e.from, e.to] : [])}
            bounds={bounds}
            live={
              linkTip && (linkFrom || relink)
                ? {
                    fromId:
                      linkFrom ??
                      (() => {
                        const e = doc.edges.find((x) => x.id === relink!.edgeId);
                        return (relink!.end === "to" ? e?.from : e?.to) ?? "";
                      })(),
                    tip: linkTip,
                  }
                : null
            }
            onGrabEnd={canEdit ? startRelink : undefined}
          />

          {marquee && (
            <div
              aria-hidden
              className="pointer-events-none absolute z-20 rounded-sm border border-brand-400 bg-brand-500/15"
              style={{
                left: Math.min(marquee.x0, marquee.x1),
                top: Math.min(marquee.y0, marquee.y1),
                width: Math.abs(marquee.x1 - marquee.x0),
                height: Math.abs(marquee.y1 - marquee.y0),
              }}
            />
          )}

          {doc.nodes.map((n) => (
            <Box
              key={n.id}
              node={n}
              number={numbers.get(n.id) ?? 0}
              selected={selected === n.id || groupIds.includes(n.id)}
              hovered={litNodes.includes(n.id)}
              onHover={(on) => setHoverNodes(on ? [n.id] : [])}
              linking={linkFrom !== null || relink !== null}
              isLinkSource={linkFrom === n.id}
              canEdit={canEdit}
              onPointerDown={onNodePointerDown(n)}
              onSelect={() => {
                if (linkFrom || relink) { link(n.id); return; }
                // Clicking one box is a fresh single selection; the group
                // survives only while you are working with it.
                if (!groupIds.includes(n.id)) setGroupIds([]);
                setSelected(n.id);
                setSelectedEdge(null);
                if (selectedField?.nodeId !== n.id) setSelectedField(null);
                alignAndFlash(n.id, "chart");
              }}
              onStartLink={() => startLink(n.id)}
              onText={(text) => patchNode(n.id, { text })}
            />
          ))}
        </div>
        </div>
      </div>

      {/* Sticky: the point of the pane is watching the form change as you
          edit the chart, which only works if it stays on screen while you
          scroll a canvas taller than the viewport. */}
      <div className="relative min-w-0">
        {/* OUTSIDE the aside on purpose: the aside is `overflow-auto`, which
            clips anything positioned past its edge — the handle was there,
            measured 32px wide, and could not be hit with a real pointer. */}
        <RailHandle railKey="form" onStart={onRailDragStart} label="Resize the live form" />
        <aside ref={formPaneRef} className="min-w-0 rounded-lg border border-line bg-card p-4 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-auto">
        <FlowFormPreview
          doc={doc}
          answers={answers}
          onChange={(k, v: AnswerValue) => setAnswers((a) => ({ ...a, [k]: v }))}
          onFocusNode={(id) => { setSelected(id); setSelectedEdge(null); alignAndFlash(id, "form"); }}
          hoverNodes={litNodes}
          onHoverField={(id) => setHoverNodes(id ? [id] : [])}
          onSelectField={(nodeId, index) => setSelectedField({ nodeId, index })}
          onMoveField={canEdit ? moveField : undefined}
          numbers={numbers}
          selectedField={selectedField}
          focusNodeId={selected}
        />
        </aside>
      </div>

      {/* The organisers' side of the same chart. A different surface on
          purpose: the other three columns are the thing being designed,
          this one is its consequence, and it should not read as more of
          the same panel. */}
      <div className="relative min-w-0">
        <RailHandle railKey="admin" onStart={onRailDragStart} label="Resize the admin panel" />
        <aside ref={adminPaneRef} className="min-w-0 rounded-lg border border-line-strong bg-elevated p-4 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-auto">
        <FlowAdminPreview
          doc={doc}
          canEdit={canEdit}
          onSettings={patchSettings}
          onDoc={canEdit ? (next) => mutate(() => next) : undefined}
          numbers={numbers}
          hoverNodes={litNodes}
          onHoverField={(id) => setHoverNodes(id ? [id] : [])}
          onFocusNode={(id) => { setSelected(id); setSelectedEdge(null); alignAndFlash(id, "form"); }}
        />
        </aside>
      </div>

      {/* The options behind whatever is selected. Sticky for the same
          reason as the form: the canvas is taller than the viewport. */}
      <div className="relative min-w-0">
        <RailHandle railKey="options" onStart={onRailDragStart} label="Resize the options" />
        <aside className="min-w-0 rounded-lg border border-line bg-card p-4 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-auto">
        <FlowOptionsRail
          doc={doc}
          node={sel}
          edge={selEdge}
          selectedField={selectedField && sel && selectedField.nodeId === sel.id ? selectedField.index : null}
          number={sel ? numbers.get(sel.id) ?? 0 : 0}
          questionKeys={questionKeys}
          canEdit={canEdit}
          onPatchNode={patchNode}
          onRemoveNode={(id) => { removeNode(id); setSelected(null); setSelectedField(null); }}
          onStartLink={startLink}
          onPatchField={patchField}
          onMoveField={moveField}
          onPatchLimit={patchLimit}
          onAddField={addField}
          onRemoveField={removeField}
          onPatchEdge={patchEdge}
          onRemoveEdge={(id) => { removeEdge(id); setSelectedEdge(null); }}
          onHoverNode={(id) => setHoverNodes(id ? [id] : [])}
        />
        </aside>
      </div>
      </div>
    </div>
  );
}


/**
 * The seam between two columns.
 *
 * The whole gutter is the handle — all 32px of it, centred by
 * construction because it IS the gap. Two earlier versions were too thin
 * to use: a 12px strip tucked against the panel edge, then the full gap
 * when the gap was only 16px. A pointer target wants tens of pixels, so
 * the gutter was widened until the handle could be one.
 *
 * The whole band tints on hover rather than just the hairline, so the
 * answer to "what exactly can I grab here" is the thing you are already
 * pointing at.
 */
function RailHandle({
  railKey,
  onStart,
  label,
}: {
  railKey: RailKey;
  onStart: (e: React.PointerEvent, key: RailKey) => void;
  label: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onPointerDown={(e) => onStart(e, railKey)}
      className="group absolute -left-8 top-0 bottom-0 z-10 hidden w-8 cursor-col-resize touch-none rounded-md transition-colors hover:bg-brand-500/10 xl:flex xl:items-center xl:justify-center"
    >
      {/* Always drawn, so the seam is findable before you hover it. */}
      <div className="h-full w-px bg-line transition-colors group-hover:bg-brand-400/70" />
      {/* The grip, on the midline of the gutter. */}
      <div className="absolute h-10 w-1.5 rounded-full bg-line-strong transition-colors group-hover:bg-brand-400" />
    </div>
  );
}

// ── boxes ───────────────────────────────────────────────────────────

const KIND_CLASS: Record<NodeKind, string> = {
  start: "rounded-full border-brand-400/70 bg-brand-500/12",
  question: "rounded-md border-brand-400/70 bg-brand-500/8",
  end: "rounded-full border-line-strong bg-elevated",
  step: "rounded-md border-line-strong bg-elevated",
  decision: "rounded-md border-amber-500/60 bg-amber-500/10",
  note: "rounded-md border-dashed border-line-strong bg-transparent",
  // A limit is a constraint on a question, not a step anyone performs —
  // dashed like a note, but tinted so it reads as enforced, not advisory.
  rule: "rounded-md border-dashed border-amber-500/60 bg-amber-500/8",
};

function Box({
  node: n,
  number,
  selected,
  hovered,
  onHover,
  linking,
  isLinkSource,
  canEdit,
  onPointerDown,
  onSelect,
  onStartLink,
  onText,
}: {
  node: FlowNode;
  number: number;
  selected: boolean;
  hovered: boolean;
  onHover: (on: boolean) => void;
  linking: boolean;
  isLinkSource: boolean;
  canEdit: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onSelect: () => void;
  onStartLink: () => void;
  onText: (t: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div
      onPointerDown={onPointerDown}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onSelect}
      onDoubleClick={() => canEdit && setEditing(true)}
      className={`absolute flex flex-col items-center justify-center gap-0.5 border px-4 py-2.5 text-center transition-shadow ${KIND_CLASS[n.kind]} ${
        canEdit ? "cursor-grab active:cursor-grabbing" : ""
      } ${
        selected
          ? "shadow-card-hover ring-[3px] ring-brand-500 z-10"
          : hovered
            ? "shadow-card-hover ring-2 ring-brand-400 bg-brand-500/15"
            : ""
      } ${
        linking && !isLinkSource ? "ring-1 ring-brand-400/40" : ""
      }`}
      style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
      data-node-id={n.id}
    >
      {/* The box's number, for pointing at it. Outside the box's own
          padding so it never pushes the label around. */}
      <span
        aria-hidden
        className="absolute -left-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-line-strong bg-card px-1 text-[9px] font-bold tabular-nums text-muted"
      >
        {number}
      </span>

      {editing ? (
        <input
          autoFocus
          defaultValue={n.text}
          onBlur={(e) => { onText(e.target.value); setEditing(false); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-full bg-transparent text-center text-[12.5px] text-fg outline-none"
        />
      ) : (
        <span className={`text-[12.5px] leading-tight ${n.kind === "note" ? "text-muted" : "font-semibold text-fg"}`}>
          {n.text}
        </span>
      )}
      {n.actor && <span className="text-[10.5px] text-subtle">{n.actor}</span>}
      {/* A grouped box is several form questions in one step; say so, or
          the chart understates how much the person is being asked. */}
      {n.kind === "question" && fieldsOf(n).length > 1 && (
        <span className="text-[10.5px] text-brand-400">{fieldsOf(n).length} questions</span>
      )}
      {canEdit && selected && !editing && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onStartLink(); }}
          title="Draw an arrow from this box — then click the box it points to"
          className="absolute -bottom-3 right-1.5 inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white shadow-sm hover:brightness-110"
        >
          <ArrowRight size={10} /> connect
        </button>
      )}
    </div>
  );
}

// ── arrows ──────────────────────────────────────────────────────────

/**
 * Straight lines between box edges. Each line is trimmed to where it meets
 * the target's bounding box, so the arrowhead lands on the border rather
 * than under the box.
 */
function Arrows({
  doc,
  selectedEdge,
  onSelect,
  hoverNodes,
  onHoverEdge,
  bounds,
  live,
  onGrabEnd,
}: {
  doc: ChartDoc;
  selectedEdge: string | null;
  onSelect?: (id: string) => void;
  hoverNodes: string[];
  onHoverEdge: (e: { from: string; to: string } | null) => void;
  bounds: { w: number; h: number };
  /** The connection currently being drawn, if any. */
  live?: { fromId: string; tip: { x: number; y: number } } | null;
  /** Grab one end of the selected arrow to point it somewhere else. */
  onGrabEnd?: (edgeId: string, end: "from" | "to") => void;
}) {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));

  // Route every arrow first, then place all the labels together. Labels
  // have to know about each other — placed one at a time in isolation they
  // happily stack on the same free spot.
  const laid = doc.edges.flatMap((e) => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) return [];
    const points = routeEdge(a, b, doc.nodes);
    const text = e.label ?? (e.when
      ? `${e.when.field} ${e.when.op}${e.when.value ? " " + e.when.value : ""}`
      : "");
    return [{ edge: e, points, text }];
  });
  const spots = placeLabels(
    laid.map((l) => ({ points: l.points, text: l.text })),
    doc.nodes,
    bounds,
  );
  return (
    /* The arrow layer covers the whole canvas, so left hit-testable it
       swallows every press on empty space — which is where a marquee
       starts. Transparent to the pointer as a whole; the few things that
       ARE meant to be clickable opt back in below. */
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      aria-hidden="false"
    >
      <defs>
        <marker id="fc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
      {/* The connection being drawn. Dashed and unrouted on purpose: it
          is a gesture in progress, not a decision, and routing it around
          boxes on every pointermove would make it jump about. */}
      {live && (() => {
        const from = byId.get(live.fromId);
        if (!from) return null;
        const a = edgeAnchor(from, live.tip);
        return (
          <g className="pointer-events-none text-brand-400">
            <line
              x1={a.x} y1={a.y} x2={live.tip.x} y2={live.tip.y}
              stroke="currentColor" strokeWidth="2" strokeDasharray="6 5"
              markerEnd="url(#fc-arrow)"
            />
            <circle cx={a.x} cy={a.y} r="3.5" fill="currentColor" />
          </g>
        );
      })()}

      {laid.map(({ edge: e, points: pts, text: t }, i) => {
        const d = toPath(pts);
        const spot = spots[i];
        const on = selectedEdge === e.id;
        // An arrow lights up when either box it touches is hovered, so
        // hovering a field traces its route through the chart.
        const lit = hoverNodes.includes(e.from) || hoverNodes.includes(e.to);
        // A conditional arrow is dashed: the rule is visible on the chart,
        // not only in the inspector.
        return (
          <g key={e.id} className={on || lit ? "text-brand-200" : "text-brand-400"}>
            <path
              d={d} fill="none"
              stroke="currentColor" strokeWidth={on ? 2.5 : lit ? 2.2 : 1.5}
              strokeDasharray={e.when ? "5 4" : undefined}
              markerEnd="url(#fc-arrow)" opacity={on || lit ? 1 : 0.75}
            />
            {t && (() => {
              const size = labelSize(t);
              // Far from the line, a bare label is ambiguous about which
              // arrow it names — so draw a hairline back to the arrow.
              const away = Math.hypot(spot.x - spot.anchorX, spot.y - spot.anchorY);
              return (
                <>
                  {away > 26 && (
                    <line
                      x1={spot.anchorX} y1={spot.anchorY} x2={spot.x} y2={spot.y}
                      stroke="currentColor" strokeWidth="1" opacity="0.35"
                    />
                  )}
                  {/* a plate under the label so it never sits on the line */}
                  <rect
                    x={spot.x - size.w / 2} y={spot.y - size.h / 2} rx="3"
                    width={size.w} height={size.h}
                    className="fill-card"
                  />
                  <text
                    x={spot.x} y={spot.y} dominantBaseline="middle" textAnchor="middle"
                    className="fill-current text-[10px] font-semibold"
                  >
                    {t}
                  </text>
                </>
              );
            })()}
            {onSelect && (
              <path
                d={d} fill="none"
                stroke="transparent" strokeWidth="14" className="pointer-events-auto cursor-pointer"
                onMouseEnter={() => onHoverEdge({ from: e.from, to: e.to })}
                onMouseLeave={() => onHoverEdge(null)}
                onClick={() => onSelect(e.id)}
              />
            )}

            {/* Handles on a selected arrow: drag either end onto another
                box to point it there. Only on the selected one, or the
                chart would be covered in dots. */}
            {on && onGrabEnd && (
              <>
                {([["from", pts[0]], ["to", pts[pts.length - 1]]] as const).map(([end, p]) => (
                  <circle
                    key={end}
                    cx={p.x} cy={p.y} r="5"
                    className="pointer-events-auto cursor-crosshair fill-card stroke-brand-500"
                    strokeWidth="2"
                    onPointerDown={(ev) => { ev.stopPropagation(); onGrabEnd(e.id, end); }}
                  >
                    <title>{end === "from" ? "Drag to change where this starts" : "Drag to change where this points"}</title>
                  </circle>
                ))}
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

