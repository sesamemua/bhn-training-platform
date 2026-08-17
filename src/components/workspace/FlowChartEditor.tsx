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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Loader2, Plus, Trash2, Undo2 } from "lucide-react";
import {
  NODE_KINDS,
  NODE_KIND_LABEL,
  type ChartDoc,
  type FlowEdge,
  type FlowNode,
  type NodeKind,
} from "@/lib/flowchart/types";

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
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

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

  const mutate = useCallback((next: (d: ChartDoc) => ChartDoc) => {
    setDoc((cur) => {
      setHistory((h) => [...h.slice(-24), cur]);
      setDirty(true);
      return next(cur);
    });
  }, []);

  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      setDoc(h[h.length - 1]);
      setDirty(true);
      return h.slice(0, -1);
    });
  };

  // ── drag ──────────────────────────────────────────────────────────
  const onNodePointerDown = (n: FlowNode) => (e: React.PointerEvent) => {
    if (!canEdit) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      id: n.id,
      dx: e.clientX - rect.left - n.x,
      dy: e.clientY - rect.top - n.y,
    };
    setSelected(n.id);
  };

  const onCanvasPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const x = snap(Math.max(0, e.clientX - rect.left - d.dx));
    const y = snap(Math.max(0, e.clientY - rect.top - d.dy));
    setDoc((cur) => ({
      ...cur,
      nodes: cur.nodes.map((n) => (n.id === d.id ? { ...n, x, y } : n)),
    }));
    setDirty(true);
  };

  const endDrag = () => {
    if (dragRef.current) setHistory((h) => h); // drag already applied
    dragRef.current = null;
  };

  // ── node + edge operations ────────────────────────────────────────
  const addNode = (kind: NodeKind) => {
    const id = uid();
    mutate((d) => ({
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
          text: NODE_KIND_LABEL[kind],
        },
      ],
    }));
    setSelected(id);
  };

  const removeNode = (id: string) =>
    mutate((d) => ({
      nodes: d.nodes.filter((n) => n.id !== id),
      edges: d.edges.filter((e) => e.from !== id && e.to !== id),
    }));

  const link = (toId: string) => {
    if (!linkFrom || linkFrom === toId) { setLinkFrom(null); return; }
    mutate((d) =>
      d.edges.some((e) => e.from === linkFrom && e.to === toId)
        ? d
        : { ...d, edges: [...d.edges, { id: uid(), from: linkFrom, to: toId }] },
    );
    setLinkFrom(null);
  };

  const patchNode = (id: string, patch: Partial<FlowNode>) =>
    mutate((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));

  const patchEdge = (id: string, patch: Partial<FlowEdge>) =>
    mutate((d) => ({ ...d, edges: d.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));

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

  const bounds = useMemo(() => {
    const w = Math.max(1040, ...doc.nodes.map((n) => n.x + n.w + 60));
    const h = Math.max(560, ...doc.nodes.map((n) => n.y + n.h + 60));
    return { w, h };
  }, [doc.nodes]);

  const sel = doc.nodes.find((n) => n.id === selected) ?? null;

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

      {msg && <p className="mt-3 text-[12.5px] text-muted">{msg}</p>}

      {canEdit && (
        <p className="mt-3 text-[12.5px] text-subtle">
          Drag a box to move it. {linkFrom
            ? "Now click the box the arrow should point to, or press Escape."
            : "Click Connect on a box, then click its target to draw an arrow."}
        </p>
      )}

      {/* ── canvas ───────────────────────────────────────────────── */}
      <div className="mt-3 overflow-auto rounded-lg border border-line bg-card">
        <div
          ref={canvasRef}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          className="relative"
          style={{
            width: bounds.w,
            height: bounds.h,
            backgroundImage:
              "radial-gradient(circle, color-mix(in srgb, var(--fg) 9%, transparent) 1px, transparent 1px)",
            backgroundSize: `${GRID * 2}px ${GRID * 2}px`,
          }}
        >
          <Arrows doc={doc} onRemove={canEdit ? removeEdge : undefined} onLabel={canEdit ? patchEdge : undefined} />

          {doc.nodes.map((n) => (
            <Box
              key={n.id}
              node={n}
              selected={selected === n.id}
              linking={linkFrom !== null}
              isLinkSource={linkFrom === n.id}
              canEdit={canEdit}
              onPointerDown={onNodePointerDown(n)}
              onSelect={() => (linkFrom ? link(n.id) : setSelected(n.id))}
              onStartLink={() => setLinkFrom(n.id)}
              onText={(text) => patchNode(n.id, { text })}
            />
          ))}
        </div>
      </div>

      {/* ── inspector ────────────────────────────────────────────── */}
      {canEdit && sel && (
        <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-line pt-4">
          <label className="min-w-[16rem] flex-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-subtle">Label</span>
            <input
              value={sel.text}
              onChange={(e) => patchNode(sel.id, { text: e.target.value.slice(0, 240) })}
              className="mt-1 w-full border-0 border-b border-line bg-transparent px-0 py-1.5 text-[13.5px] text-fg outline-none focus-visible:border-brand-500"
            />
          </label>
          <label className="w-44">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-subtle">Who acts</span>
            <input
              value={sel.actor ?? ""}
              placeholder="optional"
              onChange={(e) => patchNode(sel.id, { actor: e.target.value.slice(0, 60) })}
              className="mt-1 w-full border-0 border-b border-line bg-transparent px-0 py-1.5 text-[13.5px] text-fg outline-none placeholder:text-subtle focus-visible:border-brand-500"
            />
          </label>
          <label className="w-32">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-subtle">Shape</span>
            <select
              value={sel.kind}
              onChange={(e) => patchNode(sel.id, { kind: e.target.value as NodeKind })}
              className="mt-1 w-full border-0 border-b border-line bg-transparent px-0 py-1.5 text-[13.5px] text-fg outline-none focus-visible:border-brand-500"
            >
              {NODE_KINDS.map((k) => (
                <option key={k} value={k}>{NODE_KIND_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() => setLinkFrom(sel.id)}
            className="inline-flex items-center gap-1 pb-1.5 text-[12.5px] font-semibold text-brand-400 hover:text-brand-200"
          >
            <ArrowRight size={12} /> Connect
          </button>
          <button
            onClick={() => { removeNode(sel.id); setSelected(null); }}
            className="inline-flex items-center gap-1 pb-1.5 text-[12.5px] text-muted hover:text-red-500"
          >
            <Trash2 size={12} /> Delete box
          </button>
        </div>
      )}
    </div>
  );
}

// ── boxes ───────────────────────────────────────────────────────────

const KIND_CLASS: Record<NodeKind, string> = {
  start: "rounded-full border-brand-400/70 bg-brand-500/12",
  end: "rounded-full border-line-strong bg-elevated",
  step: "rounded-md border-line-strong bg-elevated",
  decision: "rounded-md border-amber-500/60 bg-amber-500/10",
  note: "rounded-md border-dashed border-line-strong bg-transparent",
};

function Box({
  node: n,
  selected,
  linking,
  isLinkSource,
  canEdit,
  onPointerDown,
  onSelect,
  onStartLink,
  onText,
}: {
  node: FlowNode;
  selected: boolean;
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
      onClick={onSelect}
      onDoubleClick={() => canEdit && setEditing(true)}
      className={`absolute flex flex-col items-center justify-center gap-0.5 border px-3 text-center transition-shadow ${KIND_CLASS[n.kind]} ${
        canEdit ? "cursor-grab active:cursor-grabbing" : ""
      } ${selected ? "shadow-card-hover ring-2 ring-brand-500/60" : ""} ${
        linking && !isLinkSource ? "ring-1 ring-brand-400/40" : ""
      }`}
      style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
    >
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
      {canEdit && selected && !editing && (
        <button
          onClick={(e) => { e.stopPropagation(); onStartLink(); }}
          className="absolute -bottom-2.5 right-2 rounded bg-brand px-1.5 text-[9.5px] font-bold text-white"
        >
          connect
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
  onRemove,
  onLabel,
}: {
  doc: ChartDoc;
  onRemove?: (id: string) => void;
  onLabel?: (id: string, patch: Partial<FlowEdge>) => void;
}) {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  return (
    <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="false">
      <defs>
        <marker id="fc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
      {doc.edges.map((e) => {
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b) return null;
        const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
        const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        const p1 = edgePoint(ac, bc, a);
        const p2 = edgePoint(bc, ac, b);
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        return (
          <g key={e.id} className="text-brand-400">
            <line
              x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke="currentColor" strokeWidth="1.5" markerEnd="url(#fc-arrow)" opacity="0.75"
            />
            {e.label && (
              <text
                x={mx} y={my - 5} textAnchor="middle"
                className="fill-current text-[10px] font-semibold"
              >
                {e.label}
              </text>
            )}
            {onRemove && (
              <circle
                cx={mx} cy={my} r="7" fill="transparent" className="cursor-pointer"
                onClick={() => {
                  const next = window.prompt("Arrow label (blank to keep, DELETE to remove)", e.label ?? "");
                  if (next === null) return;
                  if (next.trim().toUpperCase() === "DELETE") onRemove(e.id);
                  else onLabel?.(e.id, { label: next.trim().slice(0, 40) || undefined });
                }}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Where the line from `from` toward `to` crosses `box`'s edge. */
function edgePoint(from: { x: number; y: number }, to: { x: number; y: number }, box: FlowNode) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return from;
  const hw = box.w / 2 + 4;
  const hh = box.h / 2 + 4;
  const scale = Math.min(
    dx === 0 ? Infinity : hw / Math.abs(dx),
    dy === 0 ? Infinity : hh / Math.abs(dy),
  );
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}
