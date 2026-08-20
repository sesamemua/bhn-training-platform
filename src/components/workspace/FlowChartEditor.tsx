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
import { ArrowRight, Check, Loader2, Plus, Undo2 } from "lucide-react";
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
import { arrivals, edgeAnchor, routeEdge, toPath } from "@/lib/flowchart/route";
import { labelSize, placeLabels } from "@/lib/flowchart/labels";
import { nodeNumbers } from "@/lib/flowchart/numbering";
import { DASHED_KINDS, SHAPE_INSET, SHAPE_PAINT, shapePath } from "@/lib/flowchart/shapes";
import { limitDrag, settleGrowth } from "@/lib/flowchart/collide";
import { moveBounds, moveFieldInForm } from "@/lib/flowchart/fields";
import { FlowOptionsRail } from "./FlowOptionsRail";
import { FlowShapePalette } from "./FlowShapePalette";
import { FlowReviewPanel } from "./FlowReviewPanel";

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
type RailKey = "options";
type RailWidths = Record<RailKey, number>;

const RAIL_DEFAULTS: RailWidths = { options: 320 };
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

/**
 * The drag payload when a shape is pulled off the tray. A named type
 * rather than text/plain so a stray drag from somewhere else — a link, a
 * file, a selection — cannot drop a box onto the chart.
 */
const KIND_MIME = "application/x-bhn-flow-kind";

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
      const gaps = 32;
      const others = (["options"] as RailKey[])
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
  /**
   * Light up a box on the chart.
   *
   * It used to align the chart with the live form column beside it. The
   * form has its own tab now — a chart is a drawing of a process, and a
   * form is a thing people fill in; tying the two meant neither could
   * change without the other.
   */
  const alignAndFlash = (id: string) => {
    const canvasPane = paneRef.current;
    const box = canvasPane?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`);
    if (!canvasPane || !box) return;

    // Bring it into view on both axes — a wide chart can put the box you
    // just selected off the side of the pane.
    const pane = canvasPane.getBoundingClientRect();
    const r = box.getBoundingClientRect();
    const dy = r.top - pane.top;
    const dx = r.left - pane.left;
    if (dy < 0 || dy + r.height > pane.height) {
      canvasPane.scrollTo({ top: canvasPane.scrollTop + dy - 24, behavior: "smooth" });
    }
    if (dx < 0 || dx + r.width > pane.width) {
      canvasPane.scrollTo({ left: canvasPane.scrollLeft + dx - 24, behavior: "smooth" });
    }
    flash(box);
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
  /**
   * The airbag under the deadband: at most eight accepted measurements
   * between two paints.
   *
   * The deadband handles jitter; it cannot handle geometry that genuinely
   * oscillates — the dashboard <main>'s classic scrollbar toggling moves
   * this measurement ~15px per iteration, seven times the deadband. That
   * cycle is closed at the source now (scrollbar-gutter on the layout's
   * <main>, the only scroller on dashboard routes), but this
   * component keeps earning new ways to measure something its own output
   * moves, and each one found so far was found by crashing in front of
   * the user. So the invariant is enforced here instead: a measure →
   * setState → re-measure chain that fails to converge gets eight
   * iterations, then waits for the browser to paint and takes one more
   * reading. A residual oscillation becomes a once-per-frame flicker in
   * the worst case — visible, reportable, and fixable — instead of
   * "maximum update depth exceeded" and a dead editor.
   *
   * The budget is anchored to paints, not time: requestAnimationFrame
   * only runs when the main thread yields, so a synchronous cascade
   * cannot reset its own allowance, while ordinary pointermoves — one
   * task each, frames between them — never feel the cap.
   */
  const paneGate = useRef({ sinceFrame: 0, frozen: false, armed: false });
  /**
   * Run `fn` once, on the next frame or after 120ms, whichever happens.
   *
   * Not just requestAnimationFrame: rAF is suspended in hidden tabs, and
   * this editor renders in hidden tabs — the popped-out admin panel
   * syncs it over BroadcastChannel. With rAF alone, a render burst in a
   * background tab would trip the gate and then never reset it, leaving
   * the chart frozen at a stale scale until the tab was next shown. The
   * timeout keeps the gate live where rAF sleeps; the flag keeps the
   * two paths from both running.
   */
  const onNextBreath = (fn: () => void) => {
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      fn();
    };
    requestAnimationFrame(run);
    setTimeout(run, 120);
  };
  const acceptPaneW = useCallback((w: number) => {
    const g = paneGate.current;
    if (g.frozen) return;
    g.sinceFrame += 1;
    if (g.sinceFrame > 8) {
      g.frozen = true;
      onNextBreath(() => {
        g.sinceFrame = 0;
        g.frozen = false;
        g.armed = false;
        const el = paneRef.current;
        if (el) setPaneW((prev) => (Math.abs(el.clientWidth - prev) <= 2 ? prev : el.clientWidth));
      });
      return;
    }
    if (!g.armed) {
      g.armed = true;
      onNextBreath(() => {
        g.sinceFrame = 0;
        g.armed = false;
      });
    }
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
  const loadedId = useRef<string | null>(null);
  useEffect(() => {
    // Keyed on the id, not on `charts`. Saving replaces the whole list
    // (setCharts with a fresh fetch), so depending on the array meant
    // every save re-ran this and threw away the edits made since — and
    // the undo history with them.
    if (loadedId.current === activeId) return;
    const c = charts.find((x) => x.id === activeId);
    if (!c) return;
    loadedId.current = activeId;
    setDoc(c.data);
    setHistory([]);
    setDirty(false);
    setSelected(null);
    setLinkFrom(null);
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
  /** Double-click empty canvas: a new box of the last kind, right there. */
  const onCanvasDoubleClick = (e: React.MouseEvent) => {
    if (!canEdit) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest("[data-node-id], button, input, select, textarea, a")) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    addNode(lastKind, {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    });
  };

  /**
   * Dropping a shape from the tray.
   *
   * The ghost follows the pointer so you can see where the box will land
   * before letting go — dropping blind and then dragging the result into
   * place is two gestures for one intention.
   */
  const pointInChart = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  };

  const onCanvasDragOver = (e: React.DragEvent) => {
    if (!canEdit || !e.dataTransfer.types.includes(KIND_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const p = pointInChart(e);
    if (p) setDropAt(p);
  };

  const onCanvasDrop = (e: React.DragEvent) => {
    if (!canEdit) return;
    const kind = e.dataTransfer.getData(KIND_MIME) as NodeKind;
    if (!kind || !NODE_KINDS.includes(kind)) return;
    e.preventDefault();
    const p = pointInChart(e);
    setDragKind(null);
    setDropAt(null);
    if (p) addNode(kind, p);
  };

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
      const group = d.group;
      const ddx = x - d.anchor.x;
      const ddy = y - d.anchor.y;
      const ids = group.map((g) => g.id);
      // Where the pointer is asking the group to be, measured from where
      // it picked them up rather than from the last frame, so a group
      // held up against something does not drift out of the cursor's
      // grip once it is free again.
      const want = new Map(
        group.map((g) => [
          g.id,
          { x: Math.max(0, g.x + ddx), y: Math.max(0, g.y + ddy) },
        ]),
      );
      setDoc((cur) => {
        const at = limitDrag(cur.nodes, ids, want);
        return {
          ...cur,
          // Only the boxes in hand move. Everything else stays put.
          nodes: cur.nodes.map((n) => {
            const p = at.get(n.id);
            return p ? { ...n, x: p.x, y: p.y } : n;
          }),
        };
      });
    } else {
      const want = new Map([[d.id, { x, y }]]);
      setDoc((cur) => {
        const p = limitDrag(cur.nodes, [d.id], want).get(d.id);
        if (!p) return cur;
        return {
          ...cur,
          nodes: cur.nodes.map((n) => (n.id === d.id ? { ...n, x: p.x, y: p.y } : n)),
        };
      });
    }
    setDirty(true);
  };

  const endDrag = () => {
    if (dragRef.current) setHistory((h) => h); // drag already applied
    dragRef.current = null;
  };

  // ── node + edge operations ────────────────────────────────────────
  /**
   * The kind added last, reused by double-click so the common case —
   * several steps in a row — needs the toolbar once rather than once per
   * box. Scrolling back to the top for every shape was the complaint.
   */
  const [lastKind, setLastKind] = useState<NodeKind>("step");
  /** The shape being dragged off the tray, and where it would land. */
  const [dragKind, setDragKind] = useState<NodeKind | null>(null);
  const [dropAt, setDropAt] = useState<{ x: number; y: number } | null>(null);

  const addNode = (kind: NodeKind, at?: { x: number; y: number }) => {
    setLastKind(kind);
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
            // Placed where the pointer was, when there was one. A box that
            // always lands at the top-left is a box you then have to drag.
            x: at ? snap(Math.max(0, at.x - 110)) : 40,
            y: at ? snap(Math.max(0, at.y - 24)) : 40 + d.nodes.length * 12,
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
  // Up and down the FORM, not up and down within one box — see
  // moveFieldInForm for why the box-local version read as broken.
  const moveField = (id: string, i: number, dir: -1 | 1) =>
    mutate((d) => moveFieldInForm(d, id, i, dir));

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
   * The height each box's text actually needs, measured from the DOM.
   *
   * Applied to LAYOUT only — the saved document keeps the height that was
   * authored. Writing measurements back would mark a chart dirty just for
   * being opened on a different machine, where a font renders a pixel
   * taller, and would put a meaningless diff in everyone's history.
   *
   * The functional updater bails when nothing moved, so a box reporting
   * the same number every render costs nothing.
   */
  /**
   * Shape suggestions the author has waved away.
   *
   * Keyed on the box AND its wording, not the box alone. Dismissing
   * "Wait for the cut-off" should not also silence the suggester when
   * that box is later retyped into something else entirely — the reason
   * it spoke has gone, so its dismissal should go with it. Rewording
   * back to the dismissed text stays quiet, which is the behaviour you
   * want if you were experimenting.
   */
  const [dismissedShape, setDismissedShape] = useState<Set<string>>(new Set());
  const suggestionKey = (n: { id: string; text: string }) =>
    `${n.id}::${n.text.trim().toLowerCase()}`;

  const [autoH, setAutoH] = useState<Record<string, number>>({});
  const measureBox = useCallback((id: string, needed: number) => {
    setAutoH((prev) => {
      const had = prev[id];
      // Returning `prev` unchanged makes React drop the render entirely,
      // which is what makes a measurement that feeds a size safe. 2px
      // rather than 1: text metrics can differ by a fraction between
      // renders, and a fraction is enough to ping-pong for ever.
      if (had !== undefined && Math.abs(had - needed) <= 2) return prev;
      return { ...prev, [id]: needed };
    });
  }, []);

  /**
   * The chart as it is drawn: authored positions, measured heights.
   * Routing, labels and the canvas size all read this rather than `doc`,
   * so an arrow lands on the box's real edge rather than where its stored
   * height claims the edge is.
   */
  /**
   * The document as drawn.
   *
   * ONLY the height is substituted, and only to cover the single frame
   * between a box being measured and that measurement reaching the
   * document. Positions are never touched here.
   *
   * There used to be a y-shift too: every box was drawn pushed down by
   * the growth of the boxes above it. That gave a box two positions —
   * the one in the document and the one on the screen — and every piece
   * of code that read a position off the screen and wrote it back as a
   * document position silently added the shift again. Picking up a box
   * dropped it the height of the shift, which on an edited chart is
   * about a hundred pixels. Growth is applied to the document once now,
   * by settleGrowth, so there is one position per box.
   */
  const laidDoc = useMemo<ChartDoc>(() => {
    let changed = false;
    const nodes = doc.nodes.map((n) => {
      const needed = autoH[n.id];
      if (needed && Math.abs(needed - n.h) > 2) {
        changed = true;
        return { ...n, h: needed };
      }
      return n;
    });
    return changed ? { ...doc, nodes } : doc;
  }, [doc, autoH]);

  /**
   * Fold measured heights into the document, pushing down only what a
   * taller box would otherwise land on.
   *
   * Deliberately not history and not "unsaved changes": re-measuring on
   * load is not an edit the person made, and a chart should not ask to
   * be saved just because it was opened. It converges because a box's
   * height depends on its width and its text, neither of which this
   * changes — so the next measurement returns the same number and the
   * guard stops the write.
   */
  useEffect(() => {
    if (!Object.keys(autoH).length) return;
    setDoc((cur) => {
      const next = settleGrowth(cur.nodes, autoH);
      return next === cur.nodes ? cur : { ...cur, nodes: next };
    });
    // Keyed on the document as well as the measurements. Switching chart
    // or restoring a draft installs a document carrying its AUTHORED
    // heights, and the boxes then re-measure to numbers already in autoH
    // — so autoH keeps its identity and, on `[autoH]` alone, this never
    // ran again. The chart was drawn at the measured heights while
    // collision and marquee selection still used the stored ones, a gap
    // of ~9px per box on the seeded chart: boxes stopped short of each
    // other and a lasso caught a strip of empty canvas below each box.
    //
    // It cannot loop. settleGrowth returns its input array by identity
    // once the heights agree, this bails on that identity, and React
    // drops a render that sets state to the object it already holds.
  }, [autoH, doc]);

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
    const cw = Math.max(620, ...laidDoc.nodes.map((n) => n.x + n.w + 60));
    const ch = Math.max(560, ...laidDoc.nodes.map((n) => n.y + n.h + 60));

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
  }, [laidDoc.nodes, paneW]);

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
        <button onClick={resetRails} className="text-subtle hover:text-muted">
          Reset column widths
        </button>
      </p>

      {canEdit && (
        <p className="mt-1.5 text-[12.5px] text-subtle">
          Drag a shape off the tray onto the chart, or double-click empty space.
          Drag a box to move it, or drag a rectangle on empty space to pick up
          several at once. {linkFrom
            ? "Now click the box the arrow should point to, or press Escape."
            : "Click Connect on a box, then click its target to draw an arrow."}{" "}
          Click an arrow to select it, double-click it to write on it.
        </p>
      )}

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
            ? `minmax(0,1fr) ${rails.options}px`
            : undefined,
        }}
      >
      {/* The pane is `overflow-auto`, which makes it a scrollport — and a
          sticky child binds to the nearest one. Since the pane is sized to
          its content it never scrolls vertically, so a palette sticky
          INSIDE it simply rode the page off the top of the screen. The
          palette therefore lives in this wrapper, outside the scrollport,
          where sticky binds to the page instead. */}
      <div className="relative">
      {/* scrollbar-gutter: stable is load-bearing, not cosmetic.
          `scale` is computed from this element's clientWidth, and the
          canvas height is computed from `scale`. Without a reserved
          gutter, a canvas tall enough to overflow raises a vertical
          scrollbar, which takes ~15px off clientWidth, which shrinks
          `scale`, which shortens the canvas below the overflow point,
          which removes the scrollbar again — a ~15px oscillation that
          no deadband small enough to be useful can absorb. Reserving
          the gutter makes clientWidth constant, so the measurement
          stops depending on its own result. This was the third and
          last cause of "maximum update depth exceeded" here. */}
      <div
        ref={paneRef}
        style={{ scrollbarGutter: "stable" }}
        className="relative overflow-auto rounded-lg border border-line bg-card"
      >
        {/* Sized in SCREEN pixels so the pane scrolls by what is visible,
            wrapping a drawing that keeps its own coordinate system. */}
        <div style={{ width: bounds.w * scale, height: contentH * scale }}>
        <div
          ref={canvasRef}
          onPointerDown={onCanvasPointerDown}
          onDoubleClick={onCanvasDoubleClick}
          onDragOver={onCanvasDragOver}
          onDrop={onCanvasDrop}
          onDragLeave={() => setDropAt(null)}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={() => { endDrag(); finishMarquee(); }}
          onPointerLeave={() => { endDrag(); finishMarquee(); }}
          className="relative origin-top-left"
          style={{
            width: bounds.w,
            height: bounds.h,
            transform: scale === 1 ? undefined : `scale(${scale})`,
            // The chart scales; its controls must not. At the 0.45 floor a
            // 20px button lands as 9px on screen, which is smaller than the
            // pointer that has to hit it. Anything that is chrome rather
            // than content counter-scales by this.
            ["--fc-inv" as string]: String(1 / scale),
            // ...and the scale itself, for converting a length that is in
            // chart coordinates into the counter-scaled chrome's own space.
            ["--fc-scale" as string]: String(scale),
            backgroundImage:
              "radial-gradient(circle, color-mix(in srgb, var(--fg) 9%, transparent) 1px, transparent 1px)",
            backgroundSize: `${GRID * 2}px ${GRID * 2}px`,
          }}
        >
          <Arrows
            doc={laidDoc}
            selectedEdge={selectedEdge}
            onLabel={canEdit ? (id, text) => patchEdge(id, { label: text.trim().slice(0, 40) || undefined }) : undefined}
            onRemove={canEdit ? (id) => { removeEdge(id); setSelectedEdge(null); } : undefined}
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

          {dragKind && dropAt && (
            <svg
              aria-hidden
              className="pointer-events-none absolute z-20 overflow-visible"
              style={{ left: dropAt.x - 110, top: dropAt.y - 24, width: 220, height: 48 }}
              width={220}
              height={48}
            >
              <path
                d={shapePath(dragKind, 220, 48)}
                className="fill-brand-500/10 stroke-brand-400"
                strokeWidth="1.5"
                strokeDasharray="6 4"
                fillRule="evenodd"
              />
            </svg>
          )}

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

          {laidDoc.nodes.map((n) => (
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
                alignAndFlash(n.id);
              }}
              onStartLink={() => startLink(n.id)}
              onText={(text) => patchNode(n.id, { text })}
              onKind={(k) => patchNode(n.id, { kind: k })}
              onMeasure={measureBox}
            />
          ))}
        </div>
        </div>
      </div>


        {canEdit && (
          /* An overlay the width of the pane, with no overflow of its own,
             so the panel inside it sticks to the viewport as the page
             scrolls. Transparent to the pointer except the panel itself. */
          <div className="pointer-events-none absolute inset-0 z-30">
            <div className="sticky top-3 flex justify-end pr-3">
              <div className="pointer-events-auto">
                <FlowShapePalette
                  mime={KIND_MIME}
                  active={lastKind}
                  onPick={(k) => addNode(k)}
                  onDragKind={setDragKind}
                  onDragEnd={() => { setDragKind(null); setDropAt(null); }}
                />
              </div>
            </div>
          </div>
        )}
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
          onSettings={canEdit ? patchSettings : undefined}
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
          suggestionDismissed={sel ? dismissedShape.has(suggestionKey(sel)) : false}
          onDismissSuggestion={() => {
            if (!sel) return;
            const key = suggestionKey(sel);
            setDismissedShape((prev) => {
              const next = new Set(prev);
              next.add(key);
              return next;
            });
          }}
        />
        </aside>
      </div>
      </div>

      {/* Below the working columns rather than among them: the review is
          about the whole workflow, not any one pane, and it re-measures
          the coordinator's note against the chart on every edit. */}
      <FlowReviewPanel doc={doc} />
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

/**
 * The box itself is now transparent — its outline is drawn as a path
 * behind the text, so a decision can be a hexagon and a document can have
 * a wave without losing its border to a clip.
 */

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
  onKind,
  onMeasure,
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
  onKind?: (k: NodeKind) => void;
  /** Report the height this box's text actually needs. */
  onMeasure?: (id: string, needed: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [shapeOpen, setShapeOpen] = useState(false);
  // Deselecting or renaming closes the picker, so it can never be left
  // hanging over a box that is no longer the one being worked on.
  if (shapeOpen && (!selected || editing)) setShapeOpen(false);

  /**
   * Measure the content, not the box.
   *
   * The outer box has a fixed height, so its own scrollHeight only ever
   * tells you when text is overflowing — never when there is room to
   * spare. An inner wrapper is free to be its natural height, so the same
   * number both grows a cramped box and shrinks a roomy one.
   *
   * Width is the fixed dimension and height the derived one, which is
   * what keeps this from feeding back on itself: a taller box never
   * changes how the text wraps.
   */
  const contentRef = useRef<HTMLDivElement | null>(null);
  const fieldCount = fieldsOf(n).length;
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el || !onMeasure) return;
    const pad = 20; // py-2.5 top and bottom
    onMeasure(n.id, Math.ceil(el.scrollHeight) + pad);
    // Dependencies are the things that can change how tall the text is —
    // and nothing else. Measuring on EVERY render meant every box called
    // setState on every render of the chart, which only stays finite while
    // every one of those calls happens to bail out. One that does not is
    // "maximum update depth exceeded", and with seventeen boxes measuring
    // continuously the odds of that are not small.
  }, [onMeasure, n.id, n.text, n.actor, n.kind, n.w, fieldCount, editing]);

  return (
    <div
      onPointerDown={onPointerDown}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onSelect}
      onDoubleClick={() => canEdit && setEditing(true)}
      className={`absolute flex flex-col items-center justify-center gap-0.5 py-2.5 text-center ${
        canEdit ? "cursor-grab active:cursor-grabbing" : ""
      } ${selected ? "z-10" : ""}`}
      style={{
        left: n.x,
        top: n.y,
        width: n.w,
        height: n.h,
        // Slanted and chamfered outlines eat into the corners, so the
        // text is held clear of them per kind rather than globally.
        paddingLeft: 16 + (SHAPE_INSET[n.kind] ?? 0),
        paddingRight: 16 + (SHAPE_INSET[n.kind] ?? 0),
      }}
      data-node-id={n.id}
    >
      {/* The outline. Selection thickens this stroke rather than ringing a
          rectangle around a shape that is not one. */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-visible"
        width={n.w}
        height={n.h}
      >
        <path
          d={shapePath(n.kind, n.w, n.h)}
          className={`${SHAPE_PAINT[n.kind]} ${
            selected ? "stroke-brand-500" : hovered ? "stroke-brand-400" : ""
          }`}
          strokeWidth={selected ? 3 : hovered ? 2 : 1}
          strokeDasharray={DASHED_KINDS.includes(n.kind) ? "5 4" : undefined}
          fillRule="evenodd"
        />
        {linking && !isLinkSource && (
          <path
            d={shapePath(n.kind, n.w, n.h)}
            className="fill-none stroke-brand-400/50"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
        )}
      </svg>
      {/* The box's number, for pointing at it. Outside the box's own
          padding so it never pushes the label around. */}
      <span
        aria-hidden
        className="absolute -left-1.5 -top-1.5 z-10 flex h-4 min-w-4 items-center justify-center rounded-full border border-line-strong bg-card px-1 text-[9px] font-bold tabular-nums text-muted"
      >
        {number}
      </span>

      {/* `relative` so the text paints above the outline: the outline is
          absolutely positioned, and an absolute sibling covers a static
          one no matter which comes first in the markup. Opaque fills were
          hiding the label. */}
      <div ref={contentRef} className="relative flex w-full flex-col items-center gap-0.5">
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
      </div>
      {canEdit && selected && !editing && onKind && (
        /* Change the shape from the shape. The options rail can do this
           too, but nobody looks three columns right to restyle the thing
           under their cursor.
         *
         * One badge, not a rack. All thirteen outlines used to sit in a
         * pill above every selected box; at that width the pill wrapped
         * onto two rows and wore the box like a hat, hiding whatever was
         * above it and shouting louder than the chart. A single corner
         * button carrying the CURRENT outline says the same thing — this
         * is the shape, and it is changeable — and the thirteen only
         * appear once you ask for them. */
        <div
          className="absolute -left-2.5 -top-2.5 z-30 origin-top-left"
          style={{ transform: "scale(var(--fc-inv, 1))" }}
        >
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setShapeOpen((v) => !v); }}
            aria-haspopup="menu"
            aria-expanded={shapeOpen}
            title={`Shape: ${NODE_KIND_LABEL[n.kind]} — click to change`}
            className={`flex h-5 w-5 items-center justify-center rounded-full border shadow-sm transition-colors ${
              shapeOpen
                ? "border-brand-400 bg-brand-500/25"
                : "border-line bg-card hover:border-brand-400 hover:bg-elevated"
            }`}
          >
            <svg aria-hidden width="11" height="8" className="block overflow-visible">
              <path
                d={shapePath(n.kind, 11, 8)}
                className={SHAPE_PAINT[n.kind]}
                strokeWidth="1"
                strokeDasharray={DASHED_KINDS.includes(n.kind) ? "2 2" : undefined}
                fillRule="evenodd"
              />
            </svg>
          </button>

          {shapeOpen && (
            /* Opens upward, onto the empty canvas above the box, so the
               thirteen choices never cover the box being restyled — you
               need to see what you are changing. Near the top of the
               chart there is no room up there, so it drops down instead
               rather than being clipped by the pane. */
            <div
              role="menu"
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute left-0 grid w-[188px] grid-cols-5 gap-0.5 rounded-lg border border-line bg-card/95 p-1.5 shadow-card-hover backdrop-blur"
              style={
                n.y > 120
                  ? { bottom: "calc(100% + 6px)" }
                  // Dropping down has to clear the whole box, not just the
                  // badge on its corner — otherwise the choices sit on top
                  // of the thing being restyled. The badge is inset 10px
                  // above the box, and the wrapper counter-scales, so the
                  // box's own height converts back through --fc-inv.
                  : { top: `calc(${n.h + 10}px * var(--fc-scale, 1) + 6px)` }
              }
            >
              {NODE_KINDS.map((k) => (
                <button
                  key={k}
                  role="menuitem"
                  onClick={(e) => { e.stopPropagation(); onKind(k); setShapeOpen(false); }}
                  title={NODE_KIND_LABEL[k]}
                  className={`flex h-6 items-center justify-center rounded-md ${
                    k === n.kind ? "bg-brand-500/25 ring-1 ring-brand-400" : "hover:bg-elevated"
                  }`}
                >
                  <svg aria-hidden width="18" height="11" className="block overflow-visible">
                    <path
                      d={shapePath(k, 18, 11)}
                      className={SHAPE_PAINT[k]}
                      strokeWidth="1"
                      strokeDasharray={DASHED_KINDS.includes(k) ? "2 2" : undefined}
                      fillRule="evenodd"
                    />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {canEdit && selected && !editing && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onStartLink(); }}
          title="Draw an arrow from this box — then click the box it points to"
          className="absolute -bottom-3 right-1.5 inline-flex origin-bottom-right items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white shadow-sm hover:brightness-110"
          style={{ transform: "scale(var(--fc-inv, 1))" }}
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
  onLabel,
  onRemove,
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
  /** Write the text that rides on an arrow. */
  onLabel?: (edgeId: string, text: string) => void;
  onRemove?: (edgeId: string) => void;
}) {
  // Which arrow's label is open for typing. Local: nothing outside this
  // layer needs to know, and it must clear when the arrow is deselected.
  const [naming, setNaming] = useState<string | null>(null);
  // Closes only when the arrow itself is gone. It used to close whenever
  // the arrow was deselected, which threw away whatever had been typed —
  // the commit lives on the input, so nothing else may unmount it first.
  if (naming && !doc.edges.some((e) => e.id === naming)) setNaming(null);
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));

  // Route every arrow first, then place all the labels together. Labels
  // have to know about each other — placed one at a time in isolation they
  // happily stack on the same free spot.
  // Worked out for the whole chart before any arrow is routed: an arrow
  // only knows to stand aside if it knows what else is arriving.
  const fan = arrivals(doc.edges);
  const laid = doc.edges.flatMap((e) => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) return [];
    const points = routeEdge(a, b, doc.nodes, fan.get(e.id));
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
            {/* The beads. Faint by default so thirty arrows do not
                strobe, brighter on the one you are looking at. */}
            <path
              d={d} fill="none" stroke="currentColor" strokeLinecap="round"
              strokeWidth={on || lit ? 3.5 : 2.5}
              opacity={on || lit ? 0.95 : 0.4}
              className="fc-flow pointer-events-none"
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
              /* The grab strip. 24px wide against a 1.5px line: what you
                 are aiming at is a line, but what you can hit is a band
                 either side of it, because nobody clicks a hairline on
                 the first try. Double-click opens its label, matching
                 double-click-to-rename on a box. */
              <path
                d={d} fill="none"
                stroke="transparent" strokeWidth="24" strokeLinecap="round"
                className="pointer-events-auto cursor-pointer"
                onMouseEnter={() => onHoverEdge({ from: e.from, to: e.to })}
                onMouseLeave={() => onHoverEdge(null)}
                onClick={() => onSelect(e.id)}
                onDoubleClick={(ev) => {
                  ev.stopPropagation();
                  onSelect(e.id);
                  if (onLabel) setNaming(e.id);
                }}
              >
                <title>
                  {t ? `"${t}" — click to select, double-click to retype` : "Click to select, double-click to add a label"}
                </title>
              </path>
            )}

            {/* Typing a label, where the label sits. */}
            {naming === e.id && onLabel && (
              <foreignObject
                x={spot.x - 70} y={spot.y - 13} width="140" height="26"
                className="pointer-events-auto overflow-visible"
              >
                <input
                  autoFocus
                  defaultValue={t}
                  placeholder="label this arrow"
                  onPointerDown={(ev) => ev.stopPropagation()}
                  // Enter writes the text ITSELF rather than calling
                  // blur() and trusting onBlur to do it. Deselecting the
                  // arrow unmounts this input, and an unmounted input
                  // never delivers its blur — so the whole edit was
                  // being dropped whenever anything took the selection
                  // between the keypress and the event.
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") {
                      onLabel(e.id, (ev.target as HTMLInputElement).value);
                      setNaming(null);
                    }
                    if (ev.key === "Escape") setNaming(null);
                  }}
                  onBlur={(ev) => { onLabel(e.id, ev.target.value); setNaming(null); }}
                  className="w-full rounded-md border border-brand-400 bg-card px-1.5 py-0.5 text-center text-[11px] font-semibold text-fg outline-none"
                />
              </foreignObject>
            )}

            {/* Handles on a selected arrow: drag either end onto another
                box to point it there. Only on the selected one, or the
                chart would be covered in dots. */}
            {on && onGrabEnd && (
              <>
                {([["from", pts[0]], ["to", pts[pts.length - 1]]] as const).map(([end, p]) => (
                  <g key={end}>
                    {/* A wide invisible target under a small visible dot:
                        the handle can look light and still be catchable. */}
                    <circle
                      cx={p.x} cy={p.y} r="13" fill="transparent"
                      className="pointer-events-auto cursor-grab"
                      onPointerDown={(ev) => { ev.stopPropagation(); onGrabEnd(e.id, end); }}
                    >
                      <title>{end === "from" ? "Drag to change where this starts" : "Drag to change where this points"}</title>
                    </circle>
                    <circle
                      cx={p.x} cy={p.y} r="5.5"
                      className="pointer-events-none fill-card stroke-brand-500"
                      strokeWidth="2.5"
                    />
                  </g>
                ))}
                {/* Delete without leaving the arrow. The keyboard and the
                    rail both still work; this is the one that is where
                    you are already pointing. */}
                {onRemove && (() => {
                  const mid = pts[Math.floor(pts.length / 2)];
                  return (
                    <g
                      className="pointer-events-auto cursor-pointer"
                      onPointerDown={(ev) => ev.stopPropagation()}
                      onClick={(ev) => { ev.stopPropagation(); onRemove(e.id); }}
                    >
                      <title>Delete this arrow</title>
                      <circle cx={mid.x + 16} cy={mid.y - 14} r="9" className="fill-card stroke-line" strokeWidth="1" />
                      <path
                        d={`M ${mid.x + 12.5} ${mid.y - 17.5} L ${mid.x + 19.5} ${mid.y - 10.5} M ${mid.x + 19.5} ${mid.y - 17.5} L ${mid.x + 12.5} ${mid.y - 10.5}`}
                        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                        className="text-red-500"
                      />
                    </g>
                  );
                })()}
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

