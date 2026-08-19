"use client";

/**
 * The third column: the options behind whatever is selected.
 *
 * The chart says what the process does and the live form shows what a
 * person sees; neither has room for the settings underneath — answer
 * type, storage key, the list of choices, whether it is required. Those
 * used to live in a bar pinned to the bottom of the window, which meant
 * the page had a wide empty right-hand margin and the controls were
 * squeezed into a strip. Here they get a column of their own, and each
 * form field maps to one card you can open straight from the form.
 */
import { useEffect, useRef } from "react";
import { ArrowRight, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import {
  FIELD_TYPES,
  FIELD_TYPE_LABEL,
  NODE_KINDS,
  NODE_KIND_LABEL,
  OPS,
  type ChartDoc,
  type ConditionOp,
  type FieldDef,
  type FieldType,
  type FlowEdge,
  type FlowNode,
  type LimitDef,
  type NodeKind,
} from "@/lib/flowchart/types";
import { fieldsOf } from "@/lib/flowchart/form";
import { suggestionFor } from "@/lib/flowchart/suggest";
import { shapePath, SHAPE_PAINT, DASHED_KINDS } from "@/lib/flowchart/shapes";

const LABEL = "text-[10px] font-bold uppercase tracking-[0.12em] text-subtle";

/** So the suggestion reads as a sentence rather than as a slot filled in. */
const ARTICLE: Record<NodeKind, string> = {
  start: "a", question: "a", step: "a", decision: "a", end: "an",
  note: "a", rule: "a", document: "a", data: "", subprocess: "a",
  delay: "a", manual: "a", connector: "a",
};
const LINE =
  "mt-1 w-full border-0 border-b border-line bg-transparent px-0 py-1.5 text-[13px] text-fg outline-none focus-visible:border-brand-500";

export function FlowOptionsRail({
  doc,
  node,
  edge,
  selectedField,
  number,
  questionKeys,
  canEdit,
  onPatchNode,
  onRemoveNode,
  onStartLink,
  onPatchField,
  onMoveField,
  onPatchLimit,
  onAddField,
  onRemoveField,
  onPatchEdge,
  onRemoveEdge,
  onHoverNode,
  suggestionDismissed,
  onDismissSuggestion,
}: {
  doc: ChartDoc;
  node: FlowNode | null;
  edge: FlowEdge | null;
  /** Which of the node's questions the form asked us to open, if any. */
  selectedField: number | null;
  /** The selected box's number, matching its badge on the chart. */
  number?: number;
  questionKeys: { key: string; label: string }[];
  canEdit: boolean;
  onPatchNode: (id: string, patch: Partial<FlowNode>) => void;
  /** True once this box's current wording has been waved away. */
  suggestionDismissed: boolean;
  onDismissSuggestion: () => void;
  onRemoveNode: (id: string) => void;
  onStartLink: (id: string) => void;
  onPatchField: (id: string, i: number, patch: Partial<FieldDef>) => void;
  onMoveField: (id: string, i: number, dir: -1 | 1) => void;
  onPatchLimit: (id: string, patch: Partial<LimitDef>) => void;
  onAddField: (id: string) => void;
  onRemoveField: (id: string, i: number) => void;
  onPatchEdge: (id: string, patch: Partial<FlowEdge>) => void;
  onRemoveEdge: (id: string) => void;
  onHoverNode: (id: string | null) => void;
}) {
  const openRef = useRef<HTMLDivElement | null>(null);

  // Clicking a field in the middle column should land you on its card,
  // not somewhere in a rail you then have to search.
  //
  // Scrolled by hand rather than with scrollIntoView, because that also
  // scrolls every ancestor that can move — including the page, which
  // undoes the chart/form alignment done a moment earlier. The rail is
  // the only thing that should move here.
  useEffect(() => {
    const el = openRef.current;
    if (selectedField === null || !el) return;
    const pane = el.closest("aside");
    if (!pane) return;
    const offset = el.getBoundingClientRect().top - pane.getBoundingClientRect().top;
    const past = offset + el.offsetHeight - pane.clientHeight;
    if (offset < 0) pane.scrollTo({ top: pane.scrollTop + offset - 8, behavior: "smooth" });
    else if (past > 0) pane.scrollTo({ top: pane.scrollTop + past + 8, behavior: "smooth" });
  }, [selectedField, node?.id]);

  if (!canEdit) {
    return (
      <p className="text-[12.5px] leading-relaxed text-muted">
        Options are editable by admins. You can still follow the chart and
        try the form.
      </p>
    );
  }

  if (edge) {
    return (
      <>
        <Header>Rule on this arrow</Header>
        <p className="pb-3 text-[12.5px] text-muted">
          {nodeText(doc, edge.from)} <ArrowRight size={11} className="inline" /> {nodeText(doc, edge.to)}
        </p>
        <label className="block">
          <span className={LABEL}>Follow when</span>
          <select
            value={edge.when?.field ?? ""}
            onChange={(e) =>
              onPatchEdge(edge.id, {
                when: e.target.value
                  ? { field: e.target.value, op: edge.when?.op ?? "is", value: edge.when?.value }
                  : undefined,
              })
            }
            className={LINE}
          >
            <option value="">always</option>
            {questionKeys.map((q) => (
              <option key={q.key} value={q.key}>{q.label}</option>
            ))}
          </select>
        </label>
        {edge.when && (
          <>
            <label className="mt-3 block">
              <span className={LABEL}>Test</span>
              <select
                value={edge.when.op}
                onChange={(e) => onPatchEdge(edge.id, { when: { ...edge.when!, op: e.target.value as ConditionOp } })}
                className={LINE}
              >
                {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            {edge.when.op !== "answered" && edge.when.op !== "empty" && (
              <label className="mt-3 block">
                <span className={LABEL}>Value</span>
                <input
                  value={edge.when.value ?? ""}
                  placeholder={edge.when.op === "any of" ? "a, b, c" : "Yes"}
                  onChange={(e) => onPatchEdge(edge.id, { when: { ...edge.when!, value: e.target.value.slice(0, 120) } })}
                  className={`${LINE} placeholder:text-subtle`}
                />
              </label>
            )}
          </>
        )}
        <label className="mt-3 block">
          <span className={LABEL}>Arrow label</span>
          <input
            value={edge.label ?? ""}
            onChange={(e) => onPatchEdge(edge.id, { label: e.target.value.slice(0, 40) || undefined })}
            className={LINE}
          />
        </label>
        <button
          onClick={() => onRemoveEdge(edge.id)}
          className="mt-4 inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-red-500"
        >
          <Trash2 size={12} /> Delete arrow
        </button>
      </>
    );
  }

  if (!node) {
    return (
      <>
        <Header>Options</Header>
        <p className="text-[12.5px] leading-relaxed text-muted">
          Click a box on the chart, or a question in the live form, and its
          settings open here — answer type, the list of choices, the hint
          underneath, whether it is required.
        </p>
      </>
    );
  }

  const fields = fieldsOf(node);

  /* Read along as the label is typed and say what shape it looks like.
     Silent unless the words point somewhere clearly, and silent once
     this box's suggestion has been waved away — see onDismissSuggestion
     for why dismissal is keyed to the text and not just the box. */
  const suggestion = suggestionFor(node, fields.length);
  const showSuggestion = suggestion && !suggestionDismissed;

  return (
    <div onMouseEnter={() => onHoverNode(node.id)} onMouseLeave={() => onHoverNode(null)}>
      <Header>Selected box{number ? ` · ${number}` : ""}</Header>

      <label className="block">
        <span className={LABEL}>Label</span>
        <input
          value={node.text}
          onChange={(e) => onPatchNode(node.id, { text: e.target.value.slice(0, 240) })}
          className={LINE}
        />
      </label>

      {showSuggestion && (
        /* Under the field being typed into, where the words are — not up
           by the Shape control, which is where you would look only if you
           already knew you wanted a different shape. */
        <div className="mt-2 flex items-start gap-2 rounded-md border border-brand-500/40 bg-brand-500/8 px-2.5 py-2">
          <svg aria-hidden width="18" height="12" className="mt-0.5 shrink-0 overflow-visible">
            <path
              d={shapePath(suggestion.kind, 18, 12)}
              className={SHAPE_PAINT[suggestion.kind]}
              strokeWidth="1"
              strokeDasharray={DASHED_KINDS.includes(suggestion.kind) ? "2 2" : undefined}
              fillRule="evenodd"
            />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] leading-snug text-fg">
              This reads like{" "}
              <strong className="font-semibold">
                {ARTICLE[suggestion.kind]} {NODE_KIND_LABEL[suggestion.kind].toLowerCase()}
              </strong>{" "}
              — {suggestion.why}.
            </p>
            <div className="mt-1.5 flex items-center gap-3">
              <button
                onClick={() => onPatchNode(node.id, { kind: suggestion.kind })}
                className="text-[12px] font-semibold text-brand-400 hover:text-brand-200"
              >
                Use {NODE_KIND_LABEL[suggestion.kind].toLowerCase()}
              </button>
              <button
                onClick={onDismissSuggestion}
                className="text-[12px] text-subtle hover:text-fg"
              >
                Keep {NODE_KIND_LABEL[node.kind].toLowerCase()}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-x-4">
        <label className="block">
          <span className={LABEL}>Who acts</span>
          <input
            value={node.actor ?? ""}
            placeholder="optional"
            onChange={(e) => onPatchNode(node.id, { actor: e.target.value.slice(0, 60) })}
            className={`${LINE} placeholder:text-subtle`}
          />
        </label>
        <label className="block">
          <span className={LABEL}>Shape</span>
          <select
            value={node.kind}
            onChange={(e) => onPatchNode(node.id, { kind: e.target.value as NodeKind })}
            className={LINE}
          >
            {NODE_KINDS.map((k) => (
              <option key={k} value={k}>{NODE_KIND_LABEL[k]}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <button
          onClick={() => onStartLink(node.id)}
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-400 hover:text-brand-200"
        >
          <ArrowRight size={12} /> Connect
        </button>
        <button
          onClick={() => onRemoveNode(node.id)}
          className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-red-500"
        >
          <Trash2 size={12} /> Delete box
        </button>
      </div>

      {node.kind === "rule" && (
        <>
          <Header className="mt-6">What it limits</Header>
          <label className="block">
            <span className={LABEL}>Question</span>
            <select
              value={node.limit?.field ?? ""}
              onChange={(e) => onPatchLimit(node.id, { field: e.target.value })}
              className={LINE}
            >
              <option value="">choose a question…</option>
              {questionKeys.map((q) => (
                <option key={q.key} value={q.key}>{q.label}</option>
              ))}
            </select>
          </label>

          <label className="mt-3 block">
            <span className={LABEL}>Most that may be chosen</span>
            <input
              type="number"
              min={1}
              max={20}
              value={node.limit?.max ?? ""}
              placeholder="no limit"
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                onPatchLimit(node.id, { max: Number.isFinite(n) ? Math.min(20, Math.max(1, n)) : undefined });
              }}
              className={`${LINE} placeholder:text-subtle`}
            />
          </label>

          <p className={`${LABEL} mt-4 block`}>Sessions that run at the same time</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-subtle">
            Picking more than one from a set is allowed, but the form warns
            that only one is likely to be approved.
          </p>
          <div className="mt-2 space-y-3">
            {(node.limit?.clashes ?? []).map((c, i) => (
              <div key={i} className="rounded-md border border-line bg-elevated/40 px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <input
                    value={c.label}
                    placeholder="When they clash, e.g. Tuesday 1 PM"
                    onChange={(e) => onPatchLimit(node.id, {
                      clashes: (node.limit?.clashes ?? []).map((x, j) =>
                        j === i ? { ...x, label: e.target.value.slice(0, 60) } : x),
                    })}
                    className="min-w-0 flex-1 border-0 bg-transparent px-0 py-0.5 text-[12.5px] font-semibold text-fg outline-none placeholder:text-subtle"
                  />
                  <button
                    onClick={() => onPatchLimit(node.id, {
                      clashes: (node.limit?.clashes ?? []).filter((_, j) => j !== i),
                    })}
                    className="shrink-0 text-muted hover:text-red-500"
                    title="Remove this clash"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                <textarea
                  rows={Math.min(8, Math.max(2, c.options.length + 1))}
                  value={c.options.join("\n")}
                  placeholder="One option per line, exactly as written in the question"
                  onChange={(e) => onPatchLimit(node.id, {
                    clashes: (node.limit?.clashes ?? []).map((x, j) =>
                      j === i
                        ? { ...x, options: e.target.value.split("\n").map((t) => t.trim()).filter(Boolean).slice(0, 20) }
                        : x),
                  })}
                  className="mt-1.5 w-full resize-y rounded-md border border-line bg-elevated px-2 py-1.5 text-[12px] text-fg outline-none placeholder:text-subtle focus-visible:border-brand-500"
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => onPatchLimit(node.id, {
              clashes: [...(node.limit?.clashes ?? []), { label: "", options: [] }],
            })}
            className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-brand-500 hover:text-brand-400"
          >
            <Plus size={12} /> Add a clashing set
          </button>
        </>
      )}

      {node.kind === "question" && (
        <>
          <Header className="mt-6">
            {fields.length === 1 ? "Its question" : `Its ${fields.length} questions`}
          </Header>

          <div className="space-y-3">
            {fields.map((f, i) => {
              const open = selectedField === i;
              return (
                <div
                  key={i}
                  ref={open ? openRef : undefined}
                  className={`rounded-md border px-3 py-2.5 transition-colors ${
                    open ? "border-brand-400/70 bg-brand-500/8" : "border-line bg-elevated/40"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <input
                      value={f.key}
                      onChange={(e) => onPatchField(node.id, i, { key: e.target.value.slice(0, 40) })}
                      className="min-w-0 flex-1 border-0 bg-transparent px-0 py-0.5 font-mono text-[12px] font-semibold text-fg outline-none focus-visible:text-brand-300"
                    />
                    <span className="flex shrink-0 items-center gap-0.5">
                      <button
                        onClick={() => onMoveField(node.id, i, -1)}
                        disabled={i === 0}
                        title="Move up"
                        className="text-muted hover:text-fg disabled:opacity-30"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        onClick={() => onMoveField(node.id, i, 1)}
                        disabled={i === fields.length - 1}
                        title="Move down"
                        className="text-muted hover:text-fg disabled:opacity-30"
                      >
                        <ChevronDown size={12} />
                      </button>
                      <button
                        onClick={() => onRemoveField(node.id, i)}
                        className="text-muted hover:text-red-500"
                        title="Remove this question from the box"
                      >
                        <Trash2 size={11} />
                      </button>
                    </span>
                  </div>

                  <label className="mt-2 block">
                    <span className={LABEL}>Answer type</span>
                    <select
                      value={f.type}
                      onChange={(e) => onPatchField(node.id, i, { type: e.target.value as FieldType })}
                      className={LINE}
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t} value={t}>{FIELD_TYPE_LABEL[t]}</option>
                      ))}
                    </select>
                  </label>

                  {(f.type === "choice" || f.type === "multi") && (
                    <label className="mt-2 block">
                      <span className={LABEL}>Choices, one per line</span>
                      <textarea
                        rows={Math.min(10, Math.max(3, (f.options ?? []).length + 1))}
                        value={(f.options ?? []).join("\n")}
                        onChange={(e) =>
                          onPatchField(node.id, i, {
                            options: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 20),
                          })
                        }
                        className="mt-1 w-full resize-y rounded-md border border-line bg-elevated px-2 py-1.5 text-[12.5px] text-fg outline-none focus-visible:border-brand-500"
                      />
                    </label>
                  )}

                  <label className="mt-2 block">
                    <span className={LABEL}>Hint under the answer</span>
                    <input
                      value={f.help ?? ""}
                      onChange={(e) => onPatchField(node.id, i, { help: e.target.value.slice(0, 200) || undefined })}
                      className={LINE}
                    />
                  </label>

                  <label className="mt-2 flex items-center gap-2 text-[12.5px] text-muted">
                    <input
                      type="checkbox"
                      checked={!!f.required}
                      onChange={(e) => onPatchField(node.id, i, { required: e.target.checked })}
                    />
                    Required
                  </label>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => onAddField(node.id)}
            className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-brand-500 hover:text-brand-400"
          >
            <Plus size={12} /> Add a question to this box
          </button>
        </>
      )}
    </div>
  );
}

function Header({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`pb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-400 ${className}`}>
      {children}
    </p>
  );
}

function nodeText(doc: ChartDoc, id: string): string {
  return doc.nodes.find((n) => n.id === id)?.text ?? "?";
}
