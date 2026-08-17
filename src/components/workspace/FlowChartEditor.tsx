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
  FIELD_TYPES,
  FIELD_TYPE_LABEL,
  NODE_KINDS,
  NODE_KIND_LABEL,
  OPS,
  type ChartDoc,
  type ConditionOp,
  type FieldType,
  type FlowEdge,
  type FlowNode,
  type NodeKind,
} from "@/lib/flowchart/types";
import { orderedFields, suggestKey, type AnswerValue, type Answers } from "@/lib/flowchart/form";
import { midpointWithDir, routeEdge, toPath } from "@/lib/flowchart/route";
import { FlowFormPreview } from "./FlowFormPreview";

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
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
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
    // Capture is an optimisation, not a requirement: if the pointer id is
    // not capturable the drag must still work rather than dying here.
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* keep dragging */ }
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
    mutate((d) => {
      const taken = d.nodes.map((n) => n.field?.key).filter(Boolean) as string[];
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

      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-subtle">
        <span className="inline-flex items-center gap-1.5">
          <svg width="26" height="6" aria-hidden><line x1="0" y1="3" x2="26" y2="3" stroke="currentColor" strokeWidth="1.5" className="text-brand-400" /></svg>
          always follows
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="26" height="6" aria-hidden><line x1="0" y1="3" x2="26" y2="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 4" className="text-brand-400" /></svg>
          only when its rule matches
        </span>
        <span>Click an arrow to set or clear its rule.</span>
      </p>

      {canEdit && (
        <p className="mt-1.5 text-[12.5px] text-subtle">
          Drag a box to move it. {linkFrom
            ? "Now click the box the arrow should point to, or press Escape."
            : "Click Connect on a box, then click its target to draw an arrow."}
        </p>
      )}

      {/* ── canvas + live form, side by side ─────────────────────── */}
      <div className="mt-3 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="overflow-auto rounded-lg border border-line bg-card">
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
          <Arrows doc={doc} selectedEdge={selectedEdge} onSelect={canEdit ? setSelectedEdge : undefined} />

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

      {/* Sticky: the point of the pane is watching the form change as you
          edit the chart, which only works if it stays on screen while you
          scroll a canvas taller than the viewport. */}
      <aside className="min-w-0 self-start rounded-lg border border-line bg-card p-4 xl:sticky xl:top-4 xl:max-h-[80vh] xl:overflow-auto">
        <FlowFormPreview
          doc={doc}
          answers={answers}
          onChange={(k, v: AnswerValue) => setAnswers((a) => ({ ...a, [k]: v }))}
          onFocusNode={(id) => { setSelected(id); setSelectedEdge(null); }}
        />
      </aside>
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

      {/* what this question asks in the form */}
      {canEdit && sel?.kind === "question" && sel.field && (
        <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-3">
          <label className="w-40">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-subtle">Answer type</span>
            <select
              value={sel.field.type}
              onChange={(e) => patchNode(sel.id, { field: { ...sel.field!, type: e.target.value as FieldType } })}
              className="mt-1 w-full border-0 border-b border-line bg-transparent px-0 py-1.5 text-[13.5px] text-fg outline-none focus-visible:border-brand-500"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>{FIELD_TYPE_LABEL[t]}</option>
              ))}
            </select>
          </label>
          <label className="w-36">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-subtle">Answer key</span>
            <input
              value={sel.field.key}
              onChange={(e) => patchNode(sel.id, { field: { ...sel.field!, key: e.target.value.slice(0, 40) } })}
              className="mt-1 w-full border-0 border-b border-line bg-transparent px-0 py-1.5 font-mono text-[12.5px] text-fg outline-none focus-visible:border-brand-500"
            />
          </label>
          {(sel.field.type === "choice" || sel.field.type === "multi") && (
            <label className="min-w-[16rem] flex-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-subtle">Choices, comma separated</span>
              <input
                value={(sel.field.options ?? []).join(", ")}
                onChange={(e) =>
                  patchNode(sel.id, {
                    field: {
                      ...sel.field!,
                      options: e.target.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20),
                    },
                  })
                }
                className="mt-1 w-full border-0 border-b border-line bg-transparent px-0 py-1.5 text-[13.5px] text-fg outline-none focus-visible:border-brand-500"
              />
            </label>
          )}
          <label className="flex items-center gap-2 pb-1.5 text-[12.5px] text-muted">
            <input
              type="checkbox"
              checked={!!sel.field.required}
              onChange={(e) => patchNode(sel.id, { field: { ...sel.field!, required: e.target.checked } })}
            />
            Required
          </label>
        </div>
      )}

      {/* the rule on an arrow */}
      {canEdit && selEdge && (
        <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-3 border-t border-line pt-4">
          <p className="w-full text-[11px] font-bold uppercase tracking-[0.12em] text-brand-400">
            Rule on this arrow
          </p>
          <p className="text-[12.5px] text-muted">
            {nodeText(doc, selEdge.from)} <ArrowRight size={11} className="inline" /> {nodeText(doc, selEdge.to)}
          </p>
          <label className="w-40">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-subtle">Follow when</span>
            <select
              value={selEdge.when?.field ?? ""}
              onChange={(e) =>
                patchEdge(selEdge.id, {
                  when: e.target.value
                    ? { field: e.target.value, op: selEdge.when?.op ?? "is", value: selEdge.when?.value }
                    : undefined,
                })
              }
              className="mt-1 w-full border-0 border-b border-line bg-transparent px-0 py-1.5 text-[13px] text-fg outline-none focus-visible:border-brand-500"
            >
              <option value="">always</option>
              {questionKeys.map((q) => (
                <option key={q.key} value={q.key}>{q.label}</option>
              ))}
            </select>
          </label>
          {selEdge.when && (
            <>
              <label className="w-32">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-subtle">Test</span>
                <select
                  value={selEdge.when.op}
                  onChange={(e) => patchEdge(selEdge.id, { when: { ...selEdge.when!, op: e.target.value as ConditionOp } })}
                  className="mt-1 w-full border-0 border-b border-line bg-transparent px-0 py-1.5 text-[13px] text-fg outline-none focus-visible:border-brand-500"
                >
                  {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              {selEdge.when.op !== "answered" && selEdge.when.op !== "empty" && (
                <label className="w-44">
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-subtle">Value</span>
                  <input
                    value={selEdge.when.value ?? ""}
                    placeholder={selEdge.when.op === "any of" ? "a, b, c" : "Yes"}
                    onChange={(e) => patchEdge(selEdge.id, { when: { ...selEdge.when!, value: e.target.value.slice(0, 120) } })}
                    className="mt-1 w-full border-0 border-b border-line bg-transparent px-0 py-1.5 text-[13px] text-fg outline-none placeholder:text-subtle focus-visible:border-brand-500"
                  />
                </label>
              )}
            </>
          )}
          <label className="w-32">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-subtle">Arrow label</span>
            <input
              value={selEdge.label ?? ""}
              onChange={(e) => patchEdge(selEdge.id, { label: e.target.value.slice(0, 40) || undefined })}
              className="mt-1 w-full border-0 border-b border-line bg-transparent px-0 py-1.5 text-[13px] text-fg outline-none focus-visible:border-brand-500"
            />
          </label>
          <button
            onClick={() => { removeEdge(selEdge.id); setSelectedEdge(null); }}
            className="inline-flex items-center gap-1 pb-1.5 text-[12.5px] text-muted hover:text-red-500"
          >
            <Trash2 size={12} /> Delete arrow
          </button>
        </div>
      )}
    </div>
  );
}

function nodeText(doc: ChartDoc, id: string): string {
  return doc.nodes.find((n) => n.id === id)?.text ?? "?";
}

// ── boxes ───────────────────────────────────────────────────────────

const KIND_CLASS: Record<NodeKind, string> = {
  start: "rounded-full border-brand-400/70 bg-brand-500/12",
  question: "rounded-md border-brand-400/70 bg-brand-500/8",
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
  selectedEdge,
  onSelect,
}: {
  doc: ChartDoc;
  selectedEdge: string | null;
  onSelect?: (id: string) => void;
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
        const pts = routeEdge(a, b, doc.nodes);
        const d = toPath(pts);
        const mid = midpointWithDir(pts);
        // Push the label off the line along its perpendicular, so the
        // plate behind it never covers the arrow it belongs to.
        const off = 11;
        const mx = mid.x + -mid.dy * off;
        const my = mid.y + mid.dx * off;
        const on = selectedEdge === e.id;
        // A conditional arrow is dashed: the rule is visible on the chart,
        // not only in the inspector.
        return (
          <g key={e.id} className={on ? "text-brand-200" : "text-brand-400"}>
            <path
              d={d} fill="none"
              stroke="currentColor" strokeWidth={on ? 2.5 : 1.5}
              strokeDasharray={e.when ? "5 4" : undefined}
              markerEnd="url(#fc-arrow)" opacity={on ? 1 : 0.75}
            />
            {(e.label || e.when) && (() => {
              const t = e.label ?? `${e.when!.field} ${e.when!.op}${e.when!.value ? " " + e.when!.value : ""}`;
              return (
                <>
                  {/* a plate under the label so it never sits on the line */}
                  <rect
                    x={mx - t.length * 2.9 - 5} y={my - 7} rx="3"
                    width={t.length * 5.8 + 10} height="14"
                    className="fill-card"
                  />
                  <text
                    x={mx} y={my} dominantBaseline="middle" textAnchor="middle"
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
                stroke="transparent" strokeWidth="14" className="cursor-pointer"
                onClick={() => onSelect(e.id)}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

