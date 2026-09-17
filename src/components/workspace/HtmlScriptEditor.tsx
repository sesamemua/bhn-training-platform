"use client";

/**
 * Editor for an "html"-format script. Keeps the original guide's exact styling
 * (mounted in a Shadow DOM — isolated CSS, renders inline, no iframe), is
 * directly editable (contentEditable), and adds:
 *   • a big floating Save button with auto-save every 30s, a live countdown,
 *     an "auto-saved/saved at HH:MM" status, and a Revert button that rolls
 *     the document back to the last MANUAL save (auto-saves and unsaved edits
 *     after it are replaced; every version stays in History);
 *   • near-real-time collaboration: a ~2s heartbeat reports who's here and
 *     which section each person's caret is in; everyone's active/recent
 *     sections are outlined + tinted in their colour (overlaid via a shadow-DOM
 *     <style>, so nothing is written into the saved content);
 *   • a right sidebar: Sections (add / move / remove) and History (who/when +
 *     restore).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Save, Loader2, CheckCircle2, AlertCircle, Code2, Pencil, History, ListTree,
  Plus, ChevronUp, ChevronDown, Trash2, RotateCcw, User as UserIcon, MessageSquare,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { colorForKey, type PresencePeer } from "@/lib/scripts/presence";
import { AccountOfferModal } from "./AccountOfferModal";
import { ScriptCommentLayer } from "./ScriptCommentLayer";
import { shieldShadowTyping } from "@/lib/workspace/typing-shield";

interface Revision {
  id: string;
  authorName: string;
  authorKind: string;
  summary: string;
  createdAt: string;
}

interface Comment {
  id: string;
  body: string;
  authorName: string;
  authorKind: string;
  status: string;
  parentId: string | null;
  createdAt: string;
}

const AUTOSAVE_SECONDS = 30;

// ── Gantt drag (comms-plan) ──
// Week columns for the 2026 Symposium runway, Aug 3 → Nov 2 (14 columns).
// The chart's bars sit in a 14-column CSS grid (grid-column: start / end,
// 1-based grid lines 1–15). The editor makes each bar draggable — move it,
// or drag either end — writing the new grid-column back to the bar's inline
// style. Used only for a drag-readout tooltip here.
const WEEK_LABELS = [
  "Jul 13", "Jul 20", "Jul 27",
  "Aug 3", "Aug 10", "Aug 17", "Aug 24", "Aug 31", "Sep 7", "Sep 14",
  "Sep 21", "Sep 28", "Oct 5", "Oct 12", "Oct 19", "Oct 26", "Nov 2",
];
const GANTT_COLS = 17;

// One 17-column Gantt row's gridline cells, built once for new rows added
// from the Timeline panel (mirrors GANTT_CELLS in symposium-comms-html.ts).
const GANTT_CELLS_HTML = Array.from({ length: GANTT_COLS }, (_, i) => `<div class="cell" style="grid-column:${i + 1}"></div>`).join("");
// Bar colours cycled for new timeline rows so successive adds don't all match.
const BAR_CLASSES = ["g", "gd", "bl", "pl", "rs"];
// Section eyebrows that get a collapse toggle: the three Phase boxes plus
// Revenue (sponsorship), the Deliverable template (sample report), and
// Execution (full task breakdown).
const COLLAPSIBLE_EYEBROW = /^(phase\s*\d|revenue|deliverable template|execution)/i;

function adaptCss(css: string): string {
  return css
    .replace(/:root\b/g, ":host")
    .replace(/(^|})(\s*)html\s*,\s*body\b/g, "$1$2:host")
    .replace(/(^|})(\s*)body\b/g, "$1$2:host")
    .replace(/(^|})(\s*)html\b/g, "$1$2:host");
}

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}
function fmtTime(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function findSections(root: HTMLElement): HTMLElement[] {
  const boxes = Array.from(root.querySelectorAll<HTMLElement>(".box"));
  if (boxes.length) return boxes;
  const main = root.querySelector("main") ?? root;
  return Array.from(main.children).filter((el) => el.tagName === "SECTION" || el.tagName === "ARTICLE") as HTMLElement[];
}

const uniqueSid = () => "x" + Math.random().toString(36).slice(2, 8);
const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
const cssStr = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export function HtmlScriptEditor({
  scriptId,
  initialHtml,
  css,
  meId,
  meName,
  apiBase,
  readOnly = false,
  initialEditCount = 0,
  alreadyConverted = false,
  scriptUrl,
  offerAccount = false,
  showStructureTabs = true,
}: {
  scriptId: string;
  initialHtml: string;
  css: string;
  meId: string;
  meName: string;
  /** Endpoint prefix for save/revisions/presence. Defaults to the admin
   *  workspace API; the public share page passes its token-scoped base. */
  apiBase?: string;
  /** View-only share links: document not editable, no save bar / structure
   *  buttons / restore. */
  readOnly?: boolean;
  /** P4: edit count so far (from the ScriptCollaborator row). */
  initialEditCount?: number;
  /** P4: collaborator already has a BHN account — never show the offer. */
  alreadyConverted?: boolean;
  /** P4: full URL of this page, emailed on account creation. */
  scriptUrl?: string;
  /** P4: may the account offer appear at all? The share page passes the
   *  server's sign-up switch; off (the default) never offers an account. */
  offerAccount?: boolean;
  /** Show the Sections + Tables sidebar tabs. Off for docs that don't need
   *  structural editing (e.g. the Symposium plan, edited on-page + on-chart),
   *  leaving just Comments + History. Defaults on (interview guide etc.). */
  showStructureTabs?: boolean;
}) {
  const myColor = useMemo(() => colorForKey(meId), [meId]);
  const base = apiBase ?? `/api/workspace/scripts/${scriptId}`;

  const hostRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  // Read by the typing shield, which is wired once at mount but must
  // follow the current read-only state rather than the first one.
  const readOnlyRef = useRef(readOnly);
  const presenceStyleRef = useRef<HTMLStyleElement | null>(null);
  const boxesRef = useRef<HTMLElement[]>([]);
  const intercutRef = useRef<HTMLElement[]>([]);
  const tablesRef = useRef<HTMLTableElement[]>([]);
  // Re-marks the Gantt grid non-editable after the document HTML is replaced
  // (source-view apply / restore), so bars stay drag-only, not text-editable.
  const markGanttStaticRef = useRef<() => void>(() => {});
  // Re-injects the collapse toggles into the Phase boxes after the document
  // HTML is replaced (source-view apply / restore). Idempotent.
  const setupPhasesRef = useRef<() => void>(() => {});
  // Re-injects the on-chart Gantt row controls (add / reorder / remove)
  // after the document HTML is replaced. Idempotent.
  const setupGanttControlsRef = useRef<() => void>(() => {});
  // Latest element-based Gantt ops, called by the delegated click handler on
  // the on-chart control buttons.
  const ganttOpsRef = useRef<{
    add: () => void;
    move: (row: HTMLElement, dir: -1 | 1) => void;
    remove: (row: HTMLElement) => void;
  }>({ add: () => {}, move: () => {}, remove: () => {} });
  const activeSidRef = useRef<string | null>(null);
  const recentRef = useRef<Map<string, number>>(new Map());
  const peersKeyRef = useRef<string>("");
  const peersRef = useRef<PresencePeer[]>([]);
  const paintRef = useRef<() => void>(() => {});
  // Auto-save bookkeeping (refs so the 1s ticker never sees stale values).
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const secondsRef = useRef(AUTOSAVE_SECONDS);
  const doSaveRef = useRef<(k: "manual" | "auto") => void>(() => {});

  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(AUTOSAVE_SECONDS);
  const [lastSaved, setLastSaved] = useState<{ at: number; kind: "manual" | "auto" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [sourceHtml, setSourceHtml] = useState(initialHtml);
  const [tab, setTab] = useState<"sections" | "tables" | "history" | "comments">(showStructureTabs ? "sections" : "comments");
  const [sections, setSections] = useState<{ heading: string }[]>([]);
  // Dialogue rows inside the "Draft Full Intercut Script" block (.intercut-row).
  const [intercut, setIntercut] = useState<{ label: string }[]>([]);
  const [hasIntercut, setHasIntercut] = useState(false);
  // Tables panel: each table with its body rows (add / reorder / remove).
  const [tables, setTables] = useState<{ label: string; rows: { label: string }[] }[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [revLoading, setRevLoading] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [peers, setPeers] = useState<PresencePeer[]>([]);
  // P4: account-offer modal. Track edit count client-side; show at multiples of 3.
  const [editCount, setEditCount] = useState(initialEditCount);
  const [converted, setConverted] = useState(alreadyConverted);
  const [showOffer, setShowOffer] = useState(false);

  // Mark unsaved. setDirty only on the clean→dirty transition (keystrokes are
  // cheap — we don't re-render on every key).
  const markDirty = useCallback(() => {
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      setDirty(true);
    }
  }, []);

  const refreshSections = useCallback(() => {
    const root = contentRef.current;
    if (!root) return;
    const boxes = findSections(root);
    boxes.forEach((b) => { if (!b.getAttribute("data-sid")) b.setAttribute("data-sid", uniqueSid()); });
    boxesRef.current = boxes;
    setSections(boxes.map((b) => ({
      heading: (b.querySelector("h1,h2,h3")?.textContent ?? "Untitled section").trim().slice(0, 70) || "Untitled section",
    })));

    // The intercut script's dialogue rows — managed as their own sub-list.
    const rows = Array.from(root.querySelectorAll<HTMLElement>(".intercut-row"));
    intercutRef.current = rows;
    setIntercut(rows.map((r) => {
      const speaker = r.querySelector(".speaker")?.textContent?.trim() || "—";
      const copy = (r.querySelector(".script-copy")?.textContent ?? "").trim().replace(/\s+/g, " ");
      return { label: `${speaker} · ${copy.slice(0, 46)}${copy.length > 46 ? "…" : ""}` };
    }));
    setHasIntercut(rows.length > 0 || !!root.querySelector(".full-script, .intercut-list"));
  }, []);

  // Scan every <table> for the Tables panel (add/move/remove rows + a date
  // slider on dated rows). Row label = first-cell text; week = an explicit
  // data-week or one detected from the first cell's date.
  const refreshTables = useCallback(() => {
    const root = contentRef.current;
    if (!root) return;
    const tbls = Array.from(root.querySelectorAll<HTMLTableElement>("table"));
    tablesRef.current = tbls;
    setTables(tbls.map((t) => {
      const heading = t.closest(".box")?.querySelector("h2,h3,h4");
      const label = (heading?.textContent ?? "Table").trim().slice(0, 42) || "Table";
      const body = Array.from(t.querySelectorAll<HTMLTableRowElement>("tbody tr"));
      const rows = body.length
        ? body
        : Array.from(t.querySelectorAll<HTMLTableRowElement>("tr")).filter((r) => !r.querySelector("th"));
      return {
        label,
        rows: rows.map((r) => {
          const txt = (r.querySelector("td")?.textContent ?? "").trim().replace(/\s+/g, " ");
          return { label: txt.slice(0, 46) || "Row" };
        }),
      };
    }));
  }, []);

  // Live body-row list for a table index (prefers tbody; falls back to
  // non-header rows). Re-queried per op so it always reflects the DOM.
  const rowsOf = useCallback((ti: number): HTMLTableRowElement[] => {
    const t = tablesRef.current[ti];
    if (!t) return [];
    const body = Array.from(t.querySelectorAll<HTMLTableRowElement>("tbody tr"));
    return body.length
      ? body
      : Array.from(t.querySelectorAll<HTMLTableRowElement>("tr")).filter((r) => !r.querySelector("th"));
  }, []);

  // Reorder the Pre-event table's linked rows to match the Gantt's current
  // row order, so reordering a workstream on the chart is reflected in the
  // table below. Keyed by data-track; table rows without a matching bar keep
  // their place at the front.
  const syncTableOrderToGantt = useCallback(() => {
    const root = contentRef.current;
    if (!root) return;
    const tbody = root.querySelector<HTMLTableSectionElement>('[data-sid="pre-event"] table tbody');
    if (!tbody) return;
    const order = Array.from(root.querySelectorAll<HTMLElement>(".gantt .gantt-row .bar[data-track]"))
      .map((b) => b.getAttribute("data-track"));
    const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr[data-track]"));
    rows.sort((a, b) => order.indexOf(a.getAttribute("data-track")) - order.indexOf(b.getAttribute("data-track")));
    rows.forEach((r) => tbody.appendChild(r));
  }, []);

  // Keep the Pre-event table's LINKED rows honest against the Gantt:
  //   • orphan — a row whose data-track has no matching bar (its bar was
  //     removed) → drop it, so "removed on the chart" never lingers here;
  //   • duplicate — two rows sharing one data-track (e.g. a stray table-panel
  //     clone) → keep the one with the most content, drop the rest.
  // Runs on load and after every Gantt op. Rows without a data-track (plain,
  // unlinked table rows) are never touched. Returns whether it changed anything.
  const reconcileTable = useCallback((): boolean => {
    const root = contentRef.current;
    if (!root) return false;
    const tbody = root.querySelector<HTMLTableSectionElement>('[data-sid="pre-event"] table tbody');
    if (!tbody) return false;
    const bars = new Set(
      Array.from(root.querySelectorAll<HTMLElement>(".gantt .gantt-row .bar[data-track]"))
        .map((b) => b.getAttribute("data-track")),
    );
    let changed = false;
    const seen = new Map<string, HTMLTableRowElement>();
    for (const tr of Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr[data-track]"))) {
      const track = tr.getAttribute("data-track");
      if (!track) continue;
      if (!bars.has(track)) { tr.remove(); changed = true; continue; }
      const prev = seen.get(track);
      if (prev) {
        const keepPrev = (prev.textContent ?? "").trim().length >= (tr.textContent ?? "").trim().length;
        (keepPrev ? tr : prev).remove();
        if (!keepPrev) seen.set(track, tr);
        changed = true;
      } else {
        seen.set(track, tr);
      }
    }
    return changed;
  }, []);

  // Inject the on-chart Gantt controls: a reorder/remove cluster into every
  // workstream label, plus an "Add workstream row" button at the bottom of the
  // chart. Idempotent — safe to re-run after the document HTML is replaced.
  // The label's text is moved into an editable span so it stays renamable
  // while the injected buttons (contenteditable=false) don't disturb editing.
  const setupGanttControls = useCallback(() => {
    const root = contentRef.current;
    const gantt = root?.querySelector<HTMLElement>(".gantt");
    if (!root || !gantt) return;
    for (const label of Array.from(gantt.querySelectorAll<HTMLElement>(".gantt-row .gantt-label"))) {
      if (!label.querySelector(":scope > .gantt-label-text")) {
        const span = document.createElement("span");
        span.className = "gantt-label-text";
        span.setAttribute("contenteditable", "true");
        while (label.firstChild) span.appendChild(label.firstChild);
        label.appendChild(span);
      }
      if (!label.querySelector(":scope > .gantt-row-ctrls")) {
        const ctrls = document.createElement("span");
        ctrls.className = "gantt-row-ctrls";
        ctrls.setAttribute("contenteditable", "false");
        ctrls.innerHTML =
          '<button type="button" class="gantt-ctrl gantt-ctrl-up" title="Move row up" aria-label="Move row up">▲</button>' +
          '<button type="button" class="gantt-ctrl gantt-ctrl-down" title="Move row down" aria-label="Move row down">▼</button>' +
          '<button type="button" class="gantt-ctrl gantt-ctrl-del" title="Remove row" aria-label="Remove row">✕</button>';
        label.appendChild(ctrls);
      }
    }
    if (!gantt.querySelector(":scope > .gantt-add")) {
      const add = document.createElement("div");
      add.className = "gantt-add";
      add.setAttribute("contenteditable", "false");
      add.innerHTML = '<button type="button" class="gantt-add-btn" aria-label="Add a workstream row">+ Add workstream row</button>';
      gantt.appendChild(add);
    }
  }, []);

  // Give each collapsible section a collapse toggle: the three Phase boxes
  // plus Revenue (sponsorship) and the Deliverable template (sample report),
  // matched by their eyebrow label. Idempotent: adds the `phase` collapse-hook
  // class and injects one `.phase-toggle` per box only if absent, so it's safe
  // to re-run after the document HTML is replaced or reloaded (the toggle is
  // part of the saved HTML the second time around).
  const setupPhases = useCallback(() => {
    const root = contentRef.current;
    if (!root) return;
    for (const box of Array.from(root.querySelectorAll<HTMLElement>(".box"))) {
      const eyebrow = box.querySelector(".eyebrow")?.textContent?.trim() ?? "";
      if (!COLLAPSIBLE_EYEBROW.test(eyebrow)) continue;
      box.classList.add("phase");
      if (box.querySelector(":scope > .phase-toggle")) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "phase-toggle";
      btn.setAttribute("contenteditable", "false");
      btn.setAttribute("aria-label", "Collapse or expand this section");
      btn.setAttribute("aria-expanded", box.classList.contains("collapsed") ? "false" : "true");
      btn.innerHTML = '<span class="chev">▾</span>';
      box.insertBefore(btn, box.firstChild);
    }
  }, []);

  // Mount the styled, editable document into a shadow root once + wire caret
  // tracking for presence + dirty-marking for auto-save.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || host.shadowRoot) return;
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `${adaptCss(css)}\n:host{display:block}\n:host main{max-width:100%}`
      + `\n:host .gantt .bar{user-select:none;-webkit-user-select:none;touch-action:none}`
      + `\n:host .gantt .bar.hf-dragging{filter:brightness(1.08);box-shadow:0 0 0 2px rgba(0,0,0,0.18);z-index:6}`;
    const presenceStyle = document.createElement("style");
    presenceStyleRef.current = presenceStyle;

    const content = document.createElement("div");
    content.innerHTML = initialHtml;
    content.contentEditable = readOnly ? "false" : "true";
    content.spellcheck = true;
    content.style.outline = "none";
    contentRef.current = content;
    shadow.append(style, presenceStyle, content);

    findSections(content).forEach((b, i) => { if (!b.getAttribute("data-sid")) b.setAttribute("data-sid", `s${i}`); });
    refreshSections();
    refreshTables();
    setupPhases();
    setupGanttControls();
    // Self-heal any orphaned / duplicate linked table rows on load.
    reconcileTable();

    const sidOf = (node: Node | null): string | null => {
      const el = node && node.nodeType === 1 ? (node as Element) : node?.parentElement ?? null;
      return (el?.closest?.("[data-sid]") as HTMLElement | null)?.getAttribute("data-sid") ?? null;
    };
    const updateActive = () => {
      const s = shadow as unknown as { getSelection?: () => Selection | null };
      const sel = typeof s.getSelection === "function" ? s.getSelection() : window.getSelection();
      const node = sel?.anchorNode ?? null;
      if (node && content.contains(node)) activeSidRef.current = sidOf(node);
    };
    const onSel = () => { updateActive(); paintRef.current(); };
    // Mirror a workstream's left-column label onto its Gantt bar as you type,
    // but only for bars tagged data-mirror-label (the ones added from the
    // chart) — seeded bars keep their own curated captions.
    const syncMirrorBar = () => {
      const s = shadow as unknown as { getSelection?: () => Selection | null };
      const sel = typeof s.getSelection === "function" ? s.getSelection() : window.getSelection();
      const node = sel?.anchorNode ?? null;
      const el = node && node.nodeType === 1 ? (node as Element) : node?.parentElement ?? null;
      const span = el?.closest?.(".gantt-label-text") as HTMLElement | null;
      if (!span) return;
      const bar = span.closest(".gantt-row")?.querySelector<HTMLElement>(".bar[data-mirror-label]");
      if (bar) bar.textContent = span.textContent || "";
    };
    const onInput = () => {
      markDirty();
      updateActive();
      syncMirrorBar();
      const sid = activeSidRef.current;
      if (sid) recentRef.current.set(sid, Date.now());
      paintRef.current();
    };
    content.addEventListener("keyup", onSel);
    content.addEventListener("mouseup", onSel);
    content.addEventListener("focusin", onSel);
    content.addEventListener("input", onInput);

    // The Vercel Toolbar (and any page-level single-key shortcut) decides
    // "is the user typing?" from the event target, which outside this shadow
    // root is the plain host <div> — so it swallowed "c", its comment
    // shortcut, mid-sentence. See shieldShadowTyping for why this is an
    // attribute and not stopPropagation.
    shieldShadowTyping(host, shadow, () => !readOnlyRef.current);

    // ── Gantt bars: drag to reschedule (move whole bar, or drag either end) ──
    // The chart lives inside the editable document, so we drive it from here:
    // the grid is made non-editable, and delegated pointer handlers rewrite
    // each bar's `grid-column: start / end` (grid lines 1–15 over 14 week
    // columns). The inline style is part of the saved HTML, so drags persist.
    const markGanttStatic = () => {
      // The grid (bars + cells + labels) is drag-only / non-editable; the
      // per-label `.gantt-label-text` span opts back into editing on its own
      // (see setupGanttControls), so nothing else here needs to.
      const g = content.querySelector<HTMLElement>(".gantt");
      if (g) g.contentEditable = "false";
    };
    markGanttStaticRef.current = markGanttStatic;
    markGanttStatic();

    // ── Delegated clicks for injected, contenteditable=false controls ──
    // Covers both the Phase collapse toggles and the on-chart Gantt row
    // controls (add / reorder / remove). Delegated so it also catches
    // controls injected after this mount; the buttons are contenteditable=
    // false, so a click never lands a caret.
    const onDelegatedClick = (e: MouseEvent) => {
      const target = e.target as Element | null;

      // Left-rail doc tabs (.doc-tab[data-tab] → .doc-panel[data-tab]).
      // View state only: not marked dirty, but the active tab rides along
      // with the next save.
      const docTab = target?.closest?.(".doc-tab") as HTMLElement | null;
      if (docTab) {
        e.preventDefault();
        const key = docTab.getAttribute("data-tab");
        docTab.closest(".doc-tabs")?.querySelectorAll<HTMLElement>(".doc-tab, .doc-panel").forEach((el) => {
          const on = el.getAttribute("data-tab") === key;
          el.classList.toggle("active", on);
          if (el.classList.contains("doc-tab")) el.setAttribute("aria-selected", on ? "true" : "false");
        });
        return;
      }

      // Phase collapse toggle.
      const phaseBtn = target?.closest?.(".phase-toggle") as HTMLElement | null;
      if (phaseBtn) {
        e.preventDefault();
        e.stopPropagation();
        const box = phaseBtn.closest(".phase") as HTMLElement | null;
        if (box) {
          const collapsed = box.classList.toggle("collapsed");
          phaseBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
          markDirty();
        }
        return;
      }

      // On-chart "add workstream row".
      if (target?.closest?.(".gantt-add-btn")) {
        e.preventDefault();
        e.stopPropagation();
        ganttOpsRef.current.add();
        return;
      }

      // On-chart per-row reorder / remove.
      const ctrl = target?.closest?.(".gantt-ctrl") as HTMLElement | null;
      if (ctrl) {
        e.preventDefault();
        e.stopPropagation();
        const row = ctrl.closest(".gantt-row") as HTMLElement | null;
        if (!row) return;
        if (ctrl.classList.contains("gantt-ctrl-up")) ganttOpsRef.current.move(row, -1);
        else if (ctrl.classList.contains("gantt-ctrl-down")) ganttOpsRef.current.move(row, 1);
        else if (ctrl.classList.contains("gantt-ctrl-del")) ganttOpsRef.current.remove(row);
        return;
      }
    };
    content.addEventListener("click", onDelegatedClick);

    const gLine = (track: HTMLElement, clientX: number) => {
      const r = track.getBoundingClientRect();
      const col = r.width / GANTT_COLS;
      return Math.min(GANTT_COLS + 1, Math.max(1, 1 + Math.round((clientX - r.left) / col)));
    };
    const readCols = (bar: HTMLElement): [number, number] => {
      const parts = (bar.style.gridColumn || "").split("/").map((s) => parseInt(s.trim(), 10));
      const s = Number.isFinite(parts[0]) ? parts[0] : 1;
      const e = Number.isFinite(parts[1]) ? parts[1] : s + 1;
      return [s, e];
    };
    // Keep any linked table row (via data-track) in sync with its bar: rewrite
    // the row's `.date-cell` to the bar's span and its `.deadline-cell` to the
    // finish date. One-way (Gantt → table), fires live while dragging.
    const syncTrack = (bar: HTMLElement, ns: number, ne: number) => {
      const key = bar.getAttribute("data-track");
      if (!key) return;
      const row = content.querySelector<HTMLElement>(`tr[data-track="${key}"]`);
      if (!row) return;
      const startLabel = WEEK_LABELS[ns - 1];
      const endLabel = WEEK_LABELS[ne - 2];
      const dateCell = row.querySelector<HTMLElement>(".date-cell");
      if (dateCell && startLabel && endLabel) dateCell.textContent = `${startLabel} – ${endLabel}`;
      const deadlineCell = row.querySelector<HTMLElement>(".deadline-cell");
      if (deadlineCell && endLabel) deadlineCell.textContent = endLabel;
    };
    let drag: { bar: HTMLElement; track: HTMLElement; mode: "move" | "l" | "r"; s0: number; e0: number; line0: number } | null = null;
    const onDragMove = (e: PointerEvent) => {
      if (!drag) return;
      const line = gLine(drag.track, e.clientX);
      let ns = drag.s0, ne = drag.e0;
      if (drag.mode === "move") {
        const d = line - drag.line0;
        ns = drag.s0 + d; ne = drag.e0 + d;
        if (ns < 1) { ne += 1 - ns; ns = 1; }
        if (ne > GANTT_COLS + 1) { ns -= ne - (GANTT_COLS + 1); ne = GANTT_COLS + 1; }
      } else if (drag.mode === "l") {
        ns = Math.min(Math.max(1, line), drag.e0 - 1);
      } else {
        ne = Math.max(Math.min(GANTT_COLS + 1, line), drag.s0 + 1);
      }
      drag.bar.style.gridColumn = `${ns} / ${ne}`;
      drag.bar.title = `Wk ${ns}–${ne - 1} · ${WEEK_LABELS[ns - 1]} → ${WEEK_LABELS[ne - 2]}`;
      syncTrack(drag.bar, ns, ne);
    };
    const onDragUp = () => {
      if (!drag) return;
      drag.bar.classList.remove("hf-dragging");
      drag = null;
      window.removeEventListener("pointermove", onDragMove);
      markDirty();
    };
    const onDragDown = (e: PointerEvent) => {
      if (readOnly) return;
      const bar = (e.target as Element)?.closest?.(".gantt .bar") as HTMLElement | null;
      const track = bar?.closest?.(".gantt-track") as HTMLElement | null;
      if (!bar || !track) return;
      e.preventDefault();
      const [s0, e0] = readCols(bar);
      const rect = bar.getBoundingClientRect();
      const rel = e.clientX - rect.left;
      const edge = Math.min(18, rect.width * 0.28);
      const mode = rel <= edge ? "l" : rel >= rect.width - edge ? "r" : "move";
      drag = { bar, track, mode, s0, e0, line0: gLine(track, e.clientX) };
      bar.classList.add("hf-dragging");
      window.addEventListener("pointermove", onDragMove);
      window.addEventListener("pointerup", onDragUp, { once: true });
    };
    const onDragHover = (e: PointerEvent) => {
      if (readOnly || drag) return;
      const bar = (e.target as Element)?.closest?.(".gantt .bar") as HTMLElement | null;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const rel = e.clientX - rect.left;
      const edge = Math.min(18, rect.width * 0.28);
      bar.style.cursor = rel <= edge || rel >= rect.width - edge ? "ew-resize" : "grab";
    };
    content.addEventListener("pointerdown", onDragDown);
    content.addEventListener("pointermove", onDragHover);
  }, [css, initialHtml, refreshSections, refreshTables, setupGanttControls, setupPhases, reconcileTable, markDirty, readOnly]);

  // Keep the restore/source-apply paths able to re-inject the phase toggles
  // and the on-chart Gantt controls.
  useEffect(() => { setupPhasesRef.current = setupPhases; }, [setupPhases]);
  useEffect(() => { setupGanttControlsRef.current = setupGanttControls; }, [setupGanttControls]);
  useEffect(() => { readOnlyRef.current = readOnly; }, [readOnly]);

  // ── Presence heartbeat (~2s) ──
  useEffect(() => {
    let cancelled = false;
    async function beat() {
      const now = Date.now();
      const recent: string[] = [];
      for (const [sid, t] of recentRef.current) {
        if (now - t < 30_000) recent.push(sid);
        else recentRef.current.delete(sid);
      }
      try {
        const res = await fetch(`${base}/presence`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ editorKey: meId, name: meName, color: myColor, activeSid: activeSidRef.current, recentSids: recent }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; peers?: PresencePeer[] };
        if (!cancelled && j.ok && Array.isArray(j.peers)) {
          const key = JSON.stringify(j.peers);
          if (key !== peersKeyRef.current) {
            peersKeyRef.current = key;
            setPeers(j.peers);
          }
        }
      } catch { /* best-effort */ }
    }
    beat();
    const iv = setInterval(beat, 2000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [base, meId, meName, myColor]);

  // ── Paint peer highlights (never on the local caret's own section). ──
  const paint = useCallback(() => {
    const ps = presenceStyleRef.current;
    if (!ps) return;
    const mine = activeSidRef.current;
    let out = "";
    const seen = new Set<string>();
    for (const p of peersRef.current) {
      const sid = p.activeSid;
      if (sid && sid !== mine && !seen.has(sid)) {
        seen.add(sid);
        const c = p.color;
        out += `[data-sid="${sid}"]{outline:2px solid ${c};outline-offset:2px;border-radius:6px;position:relative}`;
        out += `[data-sid="${sid}"]::after{content:"${cssStr(p.name)}";position:absolute;top:-0.85em;right:8px;background:${c};color:#fff;font:600 10px/1.5 ui-sans-serif,system-ui,sans-serif;padding:0 6px;border-radius:5px;white-space:nowrap;pointer-events:none;z-index:5}`;
      }
    }
    for (const p of peersRef.current) {
      for (const sid of p.recentSids) {
        if (sid === mine || seen.has(sid)) continue;
        seen.add(sid);
        out += `[data-sid="${sid}"]{box-shadow:inset 4px 0 0 ${p.color}}`;
      }
    }
    ps.textContent = out;
  }, []);

  useEffect(() => { paintRef.current = paint; }, [paint]);
  useEffect(() => { peersRef.current = peers; paint(); }, [peers, paint]);

  const loadRevisions = useCallback(async () => {
    setRevLoading(true);
    try {
      const res = await fetch(`${base}/revisions`);
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; revisions?: Revision[] };
      if (j.ok && Array.isArray(j.revisions)) setRevisions(j.revisions);
    } finally {
      setRevLoading(false);
    }
  }, [base]);

  useEffect(() => { loadRevisions(); }, [loadRevisions]);

  // The anchored comment experience lives in ScriptCommentLayer; here we only
  // load the list to badge the Comments tab with the open count.
  const loadComments = useCallback(async () => {
    const res = await fetch(`${base}/comments`).catch(() => null);
    const j = (await res?.json().catch(() => ({}))) as { ok?: boolean; comments?: Comment[] };
    if (j?.ok && Array.isArray(j.comments)) setComments(j.comments);
  }, [base]);

  useEffect(() => { loadComments(); }, [loadComments]);

  const currentHtml = () => contentRef.current?.innerHTML ?? sourceHtml;

  const doSave = useCallback(async (kind: "manual" | "auto") => {
    if (savingRef.current) return;
    // Auto-save only when there's something to save.
    if (kind === "auto" && !dirtyRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const html = showSource ? sourceHtml : currentHtml();
    try {
      const res = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "html", richContent: { kind: "html", html, css }, summary: kind === "auto" ? "Auto-saved" : "Edited script" }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; editCount?: number; converted?: boolean };
      if (!res.ok || !j.ok) {
        setError(j.error ?? "Save failed.");
        return;
      }
      if (showSource && contentRef.current) {
        contentRef.current.innerHTML = sourceHtml;
        refreshSections();
        refreshTables();
        setupPhasesRef.current();
        markGanttStaticRef.current();
        setupGanttControlsRef.current();
        reconcileTable();
      }
      dirtyRef.current = false;
      secondsRef.current = AUTOSAVE_SECONDS;
      setDirty(false);
      setSecondsLeft(AUTOSAVE_SECONDS);
      setLastSaved({ at: Date.now(), kind });
      loadRevisions();
      // P4: after each save on the shared route the server returns the new editCount.
      // Show the account offer at every multiple of 3 while the collab hasn't converted.
      if (typeof j.editCount === "number" && !j.converted && !converted && scriptUrl && offerAccount) {
        const newCount = j.editCount;
        setEditCount(newCount);
        const dismissed = sessionStorage.getItem(`offer-dismissed-${scriptId}`);
        if (newCount > 0 && newCount % 3 === 0 && dismissed !== String(newCount)) {
          setShowOffer(true);
        }
      }
      if (j.converted) setConverted(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [base, css, showSource, sourceHtml, refreshSections, refreshTables, reconcileTable, loadRevisions]);

  useEffect(() => { doSaveRef.current = doSave; }, [doSave]);

  // ── Auto-save ticker: 1s pulse, counts down only while there are unsaved
  //    changes, fires an auto-save at zero, then resets. ──
  useEffect(() => {
    const iv = setInterval(() => {
      if (savingRef.current) return;
      if (!dirtyRef.current) {
        if (secondsRef.current !== AUTOSAVE_SECONDS) {
          secondsRef.current = AUTOSAVE_SECONDS;
          setSecondsLeft(AUTOSAVE_SECONDS);
        }
        return;
      }
      secondsRef.current -= 1;
      if (secondsRef.current <= 0) {
        secondsRef.current = AUTOSAVE_SECONDS;
        setSecondsLeft(AUTOSAVE_SECONDS);
        doSaveRef.current("auto");
      } else {
        setSecondsLeft(secondsRef.current);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  function toggleSource() {
    if (!showSource) {
      setSourceHtml(currentHtml());
    } else if (contentRef.current) {
      contentRef.current.innerHTML = sourceHtml;
      refreshSections();
    }
    setShowSource((s) => !s);
  }

  function moveSection(i: number, dir: -1 | 1) {
    const a = boxesRef.current[i];
    const b = boxesRef.current[i + dir];
    if (!a || !b || !b.parentNode) return;
    if (dir === -1) b.parentNode.insertBefore(a, b);
    else b.parentNode.insertBefore(a, b.nextSibling);
    markDirty();
    refreshSections();
  }
  function removeSection(i: number) {
    const b = boxesRef.current[i];
    if (!b) return;
    if (!confirm("Remove this section?")) return;
    const parent = b.parentElement;
    b.remove();
    if (parent && parent.tagName === "SECTION" && parent.children.length === 0) parent.remove();
    markDirty();
    refreshSections();
  }
  function addSection() {
    const root = contentRef.current;
    if (!root) return;
    // In a tabbed doc, add to the tab being viewed.
    const host = root.querySelector(".doc-panel.active") ?? root.querySelector("main") ?? root;
    const sec = document.createElement("section");
    const art = document.createElement("article");
    art.className = "box";
    art.setAttribute("data-sid", uniqueSid());
    art.innerHTML = "<h2>New section</h2><p>Write here…</p>";
    sec.appendChild(art);
    host.appendChild(sec);
    markDirty();
    refreshSections();
    art.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ── Intercut-script rows (under "Draft Full Intercut Script") ──
  function moveIntercut(i: number, dir: -1 | 1) {
    const a = intercutRef.current[i];
    const b = intercutRef.current[i + dir];
    if (!a || !b || !b.parentNode) return;
    if (dir === -1) b.parentNode.insertBefore(a, b);
    else b.parentNode.insertBefore(a, b.nextSibling);
    markDirty();
    refreshSections();
  }
  function removeIntercut(i: number) {
    const r = intercutRef.current[i];
    if (!r) return;
    if (!confirm("Remove this script line?")) return;
    r.remove();
    markDirty();
    refreshSections();
  }
  function addIntercut() {
    const root = contentRef.current;
    if (!root) return;
    // Append inside the existing list; create the list inside the full-script
    // section if it was emptied out.
    let list = root.querySelector<HTMLElement>(".intercut-list");
    if (!list) {
      const host = root.querySelector<HTMLElement>(".full-script");
      if (!host) return;
      list = document.createElement("div");
      list.className = "intercut-list";
      host.appendChild(list);
    }
    const row = document.createElement("article");
    row.className = "intercut-row";
    row.innerHTML =
      '<div class="speaker">Speaker</div><p class="script-copy">Write the line…</p><p class="visual-note">Visual note for the editor…</p>';
    list.appendChild(row);
    markDirty();
    refreshSections();
    row.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ── Table rows (Tables panel: add / move / remove + date slider) ──
  function addTableRow(ti: number) {
    const t = tablesRef.current[ti];
    if (!t) return;
    const rows = rowsOf(ti);
    const last = rows[rows.length - 1];
    let nr: HTMLTableRowElement;
    if (last) {
      nr = last.cloneNode(true) as HTMLTableRowElement;
      nr.removeAttribute("data-week");
      // A cloned row must NOT inherit the source row's data-track, or it
      // becomes a phantom second row linked to the same Gantt bar (which the
      // bar-drag / remove sync can't keep straight). Plain new rows are
      // unlinked; link one to the chart via the Gantt's "Add workstream row".
      nr.removeAttribute("data-track");
      Array.from(nr.querySelectorAll("td")).forEach((td, i) => {
        td.innerHTML = i === 0 ? '<span class="when">New</span><br>—' : "…";
      });
      last.parentNode?.insertBefore(nr, last.nextSibling);
    } else {
      const body = t.querySelector("tbody") ?? t;
      const cols = t.querySelectorAll("thead th").length || 3;
      nr = document.createElement("tr");
      for (let i = 0; i < cols; i++) {
        const td = document.createElement("td");
        td.textContent = "…";
        nr.appendChild(td);
      }
      body.appendChild(nr);
    }
    markDirty();
    refreshTables();
    nr.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function moveTableRow(ti: number, ri: number, dir: -1 | 1) {
    const rows = rowsOf(ti);
    const a = rows[ri];
    const b = rows[ri + dir];
    if (!a || !b || !b.parentNode) return;
    if (dir === -1) b.parentNode.insertBefore(a, b);
    else b.parentNode.insertBefore(a, b.nextSibling);
    markDirty();
    refreshTables();
  }
  function removeTableRow(ti: number, ri: number) {
    const r = rowsOf(ti)[ri];
    if (!r) return;
    if (!confirm("Remove this row?")) return;
    r.remove();
    markDirty();
    refreshTables();
  }

  // ── On-chart Gantt row ops (add / reorder / remove) ──
  // Element-based (the delegated click handler passes the clicked row), so
  // they stay correct no matter how the chart was re-rendered. Every op keeps
  // the Pre-event table below in sync: add creates a linked row, remove drops
  // it, reorder re-sorts the linked rows to match the new chart order.

  // Previous / next sibling that is itself a `.gantt-row` (skips the header
  // and the injected `.gantt-add` footer).
  const adjacentGanttRow = (row: HTMLElement, dir: -1 | 1): HTMLElement | null => {
    let el = (dir === -1 ? row.previousElementSibling : row.nextElementSibling) as HTMLElement | null;
    while (el && !el.classList.contains("gantt-row")) {
      el = (dir === -1 ? el.previousElementSibling : el.nextElementSibling) as HTMLElement | null;
    }
    return el;
  };

  const addGanttRow = useCallback(() => {
    const root = contentRef.current;
    const gantt = root?.querySelector<HTMLElement>(".gantt");
    if (!root || !gantt) return;
    const uid = "t" + Math.random().toString(36).slice(2, 7);
    const cls = BAR_CLASSES[gantt.querySelectorAll(".gantt-row").length % BAR_CLASSES.length];
    const row = document.createElement("div");
    row.className = "gantt-row";
    // The bar starts with the same caption as the label and is tagged
    // data-mirror-label, so renaming the left-column label updates the bar.
    row.innerHTML =
      `<div class="gantt-label">New workstream</div>` +
      `<div class="gantt-track">${GANTT_CELLS_HTML}` +
      `<div class="bar ${cls}" data-track="${uid}" data-mirror-label="1" style="grid-column:4 / 7">New workstream</div>` +
      `</div>`;
    // Insert before the "add row" footer so it stays at the bottom.
    gantt.insertBefore(row, gantt.querySelector(":scope > .gantt-add"));

    // Linked row in the Pre-event promotion table (the "table below").
    const tbody = root.querySelector<HTMLTableSectionElement>('[data-sid="pre-event"] table tbody');
    if (tbody) {
      const tr = document.createElement("tr");
      tr.setAttribute("data-track", uid);
      tr.innerHTML =
        `<td><span class="when">New workstream</span><br><span class="date-cell">Aug 3 – Aug 17</span></td>` +
        `<td class="deadline-cell">Aug 17</td>` +
        `<td>Describe the milestone &amp; goal…</td>` +
        `<td>Deliverables &amp; channels…</td>`;
      tbody.appendChild(tr);
    }

    markGanttStaticRef.current();
    setupGanttControlsRef.current(); // give the new row its controls + editable label
    reconcileTable();
    markDirty();
    refreshTables();
    row.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [reconcileTable, markDirty, refreshTables]);

  const moveGanttRow = useCallback((row: HTMLElement, dir: -1 | 1) => {
    const sibling = adjacentGanttRow(row, dir);
    if (!sibling || !row.parentNode) return;
    if (dir === -1) row.parentNode.insertBefore(row, sibling);
    else row.parentNode.insertBefore(sibling, row);
    syncTableOrderToGantt();
    markDirty();
    refreshTables();
  }, [syncTableOrderToGantt, markDirty, refreshTables]);

  const removeGanttRow = useCallback((row: HTMLElement) => {
    if (!confirm("Remove this timeline row (and its linked table row, if any)?")) return;
    const track = row.querySelector<HTMLElement>(".bar[data-track]")?.getAttribute("data-track");
    row.remove();
    // Remove EVERY table row linked to this bar (not just the first), so a
    // stray duplicate can never be left behind on the table.
    if (track) contentRef.current?.querySelectorAll(`tr[data-track="${track}"]`).forEach((tr) => tr.remove());
    reconcileTable();
    markDirty();
    refreshTables();
  }, [reconcileTable, markDirty, refreshTables]);

  useEffect(() => {
    ganttOpsRef.current = { add: addGanttRow, move: moveGanttRow, remove: removeGanttRow };
  }, [addGanttRow, moveGanttRow, removeGanttRow]);

  // Newest revision that was a deliberate act — a manual Save, a section
  // edit, or an earlier revert. Auto-saves tag themselves "Auto-saved".
  const lastManual = revisions.find((r) => r.summary !== "Auto-saved");
  const canRevert = !!lastManual && (dirty || revisions[0]?.id !== lastManual.id);

  async function revertToLastManual() {
    if (!lastManual) return;
    if (!confirm(
      `Revert to the last manual save — by ${lastManual.authorName}, ${fmtWhen(lastManual.createdAt)}?\n\n` +
      "Unsaved edits are discarded. Newer auto-saved versions stay in History."
    )) return;
    await applyRestore(lastManual.id);
  }

  async function restore(revId: string) {
    if (!confirm("Restore this version? The current content is replaced and saved as a new version.")) return;
    await applyRestore(revId);
  }

  async function applyRestore(revId: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${base}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restoreId: revId }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; snapshot?: { richContent?: { html?: string } } };
      if (!res.ok || !j.ok) {
        setError(j.error ?? "Restore failed.");
        return;
      }
      const html = j.snapshot?.richContent?.html;
      if (typeof html === "string" && contentRef.current) {
        contentRef.current.innerHTML = html;
        setSourceHtml(html);
        refreshSections();
        refreshTables();
        setupPhasesRef.current();
        markGanttStaticRef.current();
        setupGanttControlsRef.current();
        reconcileTable();
      }
      dirtyRef.current = false;
      setDirty(false);
      setLastSaved({ at: Date.now(), kind: "manual" });
      loadRevisions();
    } finally {
      setSaving(false);
    }
  }

  const miniBtn = "inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-fg hover:bg-elevated disabled:opacity-30";
  const roster = [{ editorKey: meId, name: `${meName} (you)`, color: myColor }, ...peers];
  const openCount = comments.filter((c) => !c.parentId && c.status !== "resolved").length;

  return (
    <div className="space-y-3 pb-24">
      {/* Sticky toolbar — presence + view toggle (Save lives in the floating bar). */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card-solid px-3 py-2 shadow-card-rest">
        <div className="flex items-center gap-3">
          <div className="flex items-center -space-x-1.5">
            {roster.slice(0, 6).map((p) => (
              <span
                key={p.editorKey}
                title={p.name}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-card-solid"
                style={{ background: p.color }}
              >
                {initials(p.name)}
              </span>
            ))}
          </div>
          <span className="hidden items-center gap-1.5 text-xs text-muted sm:inline-flex">
            <Pencil size={12} />
            {readOnly
              ? "View-only link"
              : peers.length > 0 ? `${peers.length + 1} editing live` : "Click in the document to edit"}
          </span>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={toggleSource}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card-solid px-3 py-1.5 text-xs font-semibold text-fg hover:bg-elevated"
          >
            <Code2 size={13} /> {showSource ? "Visual" : "HTML"}
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className={cn("min-w-0", showSource && "hidden")}>
          <div ref={hostRef} />
        </div>
        {showSource && (
          <textarea
            value={sourceHtml}
            spellCheck={false}
            onChange={(e) => { setSourceHtml(e.target.value); markDirty(); }}
            className="min-h-[560px] w-full min-w-0 resize-y rounded-xl border border-line bg-card-solid px-3 py-2 font-mono text-xs leading-relaxed text-fg focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        )}

        <aside className="self-start space-y-3 lg:sticky lg:top-16">
          <div className={cn("grid gap-1 rounded-lg bg-elevated/60 p-1", showStructureTabs ? "grid-cols-4" : "grid-cols-2")}>
            {showStructureTabs && (
              <button
                type="button"
                onClick={() => setTab("sections")}
                className={cn("inline-flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-xs font-semibold transition-colors", tab === "sections" ? "bg-card-solid text-fg shadow-card-rest" : "text-muted hover:text-fg")}
              >
                <ListTree size={13} /> Sections
              </button>
            )}
            {showStructureTabs && (
              <button
                type="button"
                onClick={() => { setTab("tables"); refreshTables(); }}
                className={cn("inline-flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-xs font-semibold transition-colors", tab === "tables" ? "bg-card-solid text-fg shadow-card-rest" : "text-muted hover:text-fg")}
              >
                <Table2 size={13} /> Tables
              </button>
            )}
            <button
              type="button"
              onClick={() => { setTab("comments"); loadComments(); }}
              className={cn("relative inline-flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-xs font-semibold transition-colors", tab === "comments" ? "bg-card-solid text-fg shadow-card-rest" : "text-muted hover:text-fg")}
            >
              <MessageSquare size={13} /> Comments
              {openCount > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[9px] font-bold leading-[1.4] text-white">{openCount}</span>}
            </button>
            <button
              type="button"
              onClick={() => { setTab("history"); loadRevisions(); }}
              className={cn("inline-flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-xs font-semibold transition-colors", tab === "history" ? "bg-card-solid text-fg shadow-card-rest" : "text-muted hover:text-fg")}
            >
              <History size={13} /> History
            </button>
          </div>

          {tab === "sections" && (
            <div className="rounded-xl border border-line bg-card-solid p-2">
              <div className="flex items-center justify-between px-1 py-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-subtle">Sections</span>
                {!readOnly && (
                  <button type="button" onClick={addSection} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900">
                    <Plus size={12} /> Add
                  </button>
                )}
              </div>
              <ul className="space-y-0.5">
                {sections.map((s, i) => (
                  <li key={i} className="group flex items-center gap-0.5 rounded-md px-1.5 py-1 hover:bg-elevated">
                    <span className="flex-1 truncate text-xs text-fg" title={s.heading}>{s.heading}</span>
                    {!readOnly && (
                      <>
                        <button type="button" title="Move up" disabled={i === 0} onClick={() => moveSection(i, -1)} className={miniBtn}><ChevronUp size={13} /></button>
                        <button type="button" title="Move down" disabled={i === sections.length - 1} onClick={() => moveSection(i, 1)} className={miniBtn}><ChevronDown size={13} /></button>
                        <button type="button" title="Remove" onClick={() => removeSection(i)} className={cn(miniBtn, "hover:text-rose-700")}><Trash2 size={12} /></button>
                      </>
                    )}
                  </li>
                ))}
                {sections.length === 0 && <li className="px-2 py-2 text-[11px] text-muted">No sections detected.</li>}
              </ul>

              {hasIntercut && (
                <>
                  <div className="mt-2 flex items-center justify-between border-t border-line px-1 pb-1 pt-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-subtle">Intercut script</span>
                    {!readOnly && (
                      <button type="button" onClick={addIntercut} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900">
                        <Plus size={12} /> Add line
                      </button>
                    )}
                  </div>
                  <ul className="space-y-0.5">
                    {intercut.map((r, i) => (
                      <li key={i} className="group flex items-center gap-0.5 rounded-md px-1.5 py-1 hover:bg-elevated">
                        <span className="w-4 shrink-0 text-right font-mono text-[10px] text-subtle">{i + 1}</span>
                        <span className="flex-1 truncate text-xs text-fg" title={r.label}>{r.label}</span>
                        {!readOnly && (
                          <>
                            <button type="button" title="Move up" disabled={i === 0} onClick={() => moveIntercut(i, -1)} className={miniBtn}><ChevronUp size={13} /></button>
                            <button type="button" title="Move down" disabled={i === intercut.length - 1} onClick={() => moveIntercut(i, 1)} className={miniBtn}><ChevronDown size={13} /></button>
                            <button type="button" title="Remove line" onClick={() => removeIntercut(i)} className={cn(miniBtn, "hover:text-rose-700")}><Trash2 size={12} /></button>
                          </>
                        )}
                      </li>
                    ))}
                    {intercut.length === 0 && (
                      <li className="px-2 py-2 text-[11px] text-muted">No script lines yet — Add line starts the intercut.</li>
                    )}
                  </ul>
                </>
              )}

              <p className="px-1.5 pt-1.5 text-[10px] leading-relaxed text-muted">Structure changes save with the document.</p>
            </div>
          )}

          {tab === "tables" && (
            <div className="space-y-2 rounded-xl border border-line bg-card-solid p-2">
              <p className="px-1.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-subtle">Tables</p>
              {tables.length === 0 && (
                <p className="px-2 py-2 text-[11px] text-muted">No tables in this document.</p>
              )}
              {tables.map((tb, ti) => (
                <div key={ti} className="overflow-hidden rounded-lg border border-line">
                  <div className="flex items-center justify-between bg-elevated/60 px-2 py-1.5">
                    <span className="truncate text-xs font-semibold text-fg" title={tb.label}>{tb.label}</span>
                    {!readOnly && (
                      <button type="button" onClick={() => addTableRow(ti)} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900">
                        <Plus size={12} /> Row
                      </button>
                    )}
                  </div>
                  <ul className="space-y-0.5 p-1">
                    {tb.rows.map((r, ri) => (
                      <li key={ri} className="rounded-md px-1.5 py-1 hover:bg-elevated">
                        <div className="flex items-center gap-0.5">
                          <span className="w-4 shrink-0 text-right font-mono text-[10px] text-subtle">{ri + 1}</span>
                          <span className="flex-1 truncate text-xs text-fg" title={r.label}>{r.label}</span>
                          {!readOnly && (
                            <>
                              <button type="button" title="Move up" disabled={ri === 0} onClick={() => moveTableRow(ti, ri, -1)} className={miniBtn}><ChevronUp size={13} /></button>
                              <button type="button" title="Move down" disabled={ri === tb.rows.length - 1} onClick={() => moveTableRow(ti, ri, 1)} className={miniBtn}><ChevronDown size={13} /></button>
                              <button type="button" title="Remove row" onClick={() => removeTableRow(ti, ri)} className={cn(miniBtn, "hover:text-rose-700")}><Trash2 size={12} /></button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                    {tb.rows.length === 0 && <li className="px-2 py-1.5 text-[11px] text-muted">No rows.</li>}
                  </ul>
                </div>
              ))}
              <p className="px-1.5 pb-1 text-[10px] leading-relaxed text-muted">Add, reorder, or remove table rows here. Type in any cell to edit it. To change a schedule date, drag its bar on the Gantt chart. Changes save with the document.</p>
            </div>
          )}

          {tab === "comments" && (
            <ScriptCommentLayer contentRef={contentRef} base={base} />
          )}

          {tab === "history" && (
            <div className="rounded-xl border border-line bg-card-solid p-2">
              <div className="flex items-center justify-between px-1 py-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-subtle">History</span>
                {revLoading && <Loader2 size={12} className="animate-spin text-muted" />}
              </div>
              <ul className="max-h-[58vh] space-y-0.5 overflow-y-auto">
                {revisions.map((r) => (
                  <li key={r.id} className="rounded-md px-1.5 py-1.5 hover:bg-elevated">
                    <div className="flex items-center gap-1.5">
                      <UserIcon size={11} className="shrink-0 text-muted" />
                      <span className="flex-1 truncate text-xs font-medium text-fg" title={r.authorName}>{r.authorName}</span>
                      {r.authorKind === "anon" && <span className="rounded bg-elevated px-1 text-[9px] uppercase tracking-wide text-subtle">guest</span>}
                      {!readOnly && (
                        <button type="button" title="Restore this version" onClick={() => restore(r.id)} className={cn(miniBtn, "hover:text-brand-700")}><RotateCcw size={12} /></button>
                      )}
                    </div>
                    <div className="mt-0.5 pl-[18px] text-[10px] text-muted">{fmtWhen(r.createdAt)}{r.summary ? ` · ${r.summary}` : ""}</div>
                  </li>
                ))}
                {!revLoading && revisions.length === 0 && (
                  <li className="px-2 py-2 text-[11px] text-muted">No saved versions yet. Hit Save to start the history.</li>
                )}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* ── Floating Save bar (bottom-centre, clear of the bottom-right tour
          button). Big Save button + auto-save countdown + saved status. ── */}
      {!readOnly && (
      <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-card-solid/95 px-3 py-2 shadow-elevated backdrop-blur supports-[backdrop-filter]:bg-card-solid/80">
        <div className="pl-1.5 text-xs">
          {error ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-rose-700"><AlertCircle size={13} /> {error}</span>
          ) : saving ? (
            <span className="inline-flex items-center gap-1.5 text-muted"><Loader2 size={13} className="animate-spin" /> Saving…</span>
          ) : dirty ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Unsaved · auto-save in {secondsLeft}s
            </span>
          ) : lastSaved ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700">
              <CheckCircle2 size={13} /> {lastSaved.kind === "auto" ? "Auto-saved" : "Saved"} at {fmtTime(lastSaved.at)}
            </span>
          ) : (
            <span className="text-muted">All changes saved</span>
          )}
        </div>
        <button
          type="button"
          onClick={revertToLastManual}
          disabled={saving || !canRevert}
          title={
            !lastManual
              ? "No manual save to revert to yet"
              : canRevert
                ? `Revert to the last manual save — ${fmtWhen(lastManual.createdAt)} by ${lastManual.authorName}`
                : "Already at the last manual save"
          }
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card-solid px-4 py-3 text-xs font-semibold text-fg transition-colors hover:bg-elevated disabled:opacity-40"
        >
          <RotateCcw size={14} /> Revert
        </button>
        <button
          type="button"
          onClick={() => doSave("manual")}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white shadow-sm shadow-brand-600/30 transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save
        </button>
      </div>
      )}

      {showOffer && scriptUrl && offerAccount && (
        <AccountOfferModal
          scriptId={scriptId}
          scriptUrl={scriptUrl}
          onDismiss={() => {
            sessionStorage.setItem(`offer-dismissed-${scriptId}`, String(editCount));
            setShowOffer(false);
          }}
          onConverted={() => {
            setConverted(true);
            setShowOffer(false);
          }}
        />
      )}
    </div>
  );
}
