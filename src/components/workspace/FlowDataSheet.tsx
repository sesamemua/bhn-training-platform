"use client";

/**
 * The form's questions as a spreadsheet.
 *
 * One row per question, in the order the form asks them. The point is to
 * be boring in the way a spreadsheet is boring: arrow keys move, Enter
 * edits, Escape backs out, Tab goes right, and the row numbers are down
 * the left. Anyone who has used Excel already knows how to drive it.
 *
 * LOCKED BY DEFAULT. The chart is the thing people come here to read, and
 * a grid you can type into by accident is a good way to change a live
 * form without meaning to. The padlock is the whole safety mechanism —
 * locked, every cell is selectable and none is editable.
 */
import { useMemo, useRef, useState } from "react";
import { GripVertical, Lock, LockOpen, Plus, Trash2 } from "lucide-react";
import { FIELD_TYPES, FIELD_TYPE_LABEL, type ChartDoc, type FieldType } from "@/lib/flowchart/types";
import { orderedFields } from "@/lib/flowchart/form";
import {
  addFieldTo, moveFieldToNode, moveFieldWithin, questionNodes, removeFieldAt, setFieldValue,
} from "@/lib/flowchart/sheet";

/** The columns of the sheet, left to right. */
const COLS = ["question", "key", "type", "required", "choices", "box"] as const;
type Col = (typeof COLS)[number];
const COL_LABEL: Record<Col, string> = {
  question: "Question", key: "Answer key", type: "Type",
  required: "Required", choices: "Choices", box: "Asked in",
};

interface Cell { row: number; col: Col }

export function FlowDataSheet({
  doc,
  onDoc,
  canEdit,
  onFocusNode,
  hoverNodes = [],
  onHoverField,
}: {
  doc: ChartDoc;
  onDoc?: (next: ChartDoc) => void;
  canEdit: boolean;
  onFocusNode?: (nodeId: string) => void;
  hoverNodes?: string[];
  onHoverField?: (nodeId: string | null) => void;
}) {
  const rows = useMemo(() => orderedFields(doc), [doc]);
  const boxes = useMemo(() => questionNodes(doc), [doc]);

  const [locked, setLocked] = useState(true);
  const [sel, setSel] = useState<Cell>({ row: 0, col: "question" });
  const [editing, setEditing] = useState(false);
  const dragRow = useRef<number | null>(null);
  const [dropRow, setDropRow] = useState<number | null>(null);

  const editable = canEdit && !locked && !!onDoc;
  const apply = (next: ChartDoc) => onDoc?.(next);

  const move = (d: 1 | -1, axis: "row" | "col") => {
    setEditing(false);
    setSel((c) => {
      if (axis === "row") {
        return { ...c, row: Math.min(rows.length - 1, Math.max(0, c.row + d)) };
      }
      const i = COLS.indexOf(c.col);
      return { ...c, col: COLS[Math.min(COLS.length - 1, Math.max(0, i + d))] };
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing) {
      if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
      if (e.key === "Enter") { e.preventDefault(); setEditing(false); move(1, "row"); }
      return;
    }
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); move(1, "row"); break;
      case "ArrowUp": e.preventDefault(); move(-1, "row"); break;
      case "ArrowRight": e.preventDefault(); move(1, "col"); break;
      case "ArrowLeft": e.preventDefault(); move(-1, "col"); break;
      case "Tab": e.preventDefault(); move(e.shiftKey ? -1 : 1, "col"); break;
      case "Enter": case "F2":
        if (editable) { e.preventDefault(); setEditing(true); }
        break;
      case "Delete": case "Backspace": {
        const r = rows[sel.row];
        if (editable && r) { e.preventDefault(); apply(removeFieldAt(doc, r.nodeId, r.index)); }
        break;
      }
    }
  };

  const onDrop = (to: number) => {
    const from = dragRow.current;
    dragRow.current = null;
    setDropRow(null);
    if (from === null || from === to || !editable) return;
    const a = rows[from], b = rows[to];
    if (!a || !b) return;
    // Within a box it is a reorder; across boxes it is a move, which is
    // the useful reading of dragging a row onto another box's rows.
    apply(a.nodeId === b.nodeId
      ? moveFieldWithin(doc, a.nodeId, a.index, b.index)
      : moveFieldToNode(doc, a.nodeId, a.index, b.nodeId));
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <p className="text-[11.5px] text-subtle">
          {rows.length} {rows.length === 1 ? "question" : "questions"}
        </p>
        <button
          onClick={() => { setLocked((v) => !v); setEditing(false); }}
          disabled={!canEdit}
          title={locked ? "Unlock to make changes" : "Lock to prevent accidental changes"}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] font-semibold transition-colors disabled:opacity-50 ${
            locked
              ? "border-line text-muted hover:bg-elevated hover:text-fg"
              : "border-amber-500/60 bg-amber-500/10 text-amber-600"
          }`}
        >
          {locked ? <><Lock size={11} /> Locked</> : <><LockOpen size={11} /> Unlocked — editing</>}
        </button>
      </div>

      {!locked && (
        <p className="mb-2 text-[11px] leading-relaxed text-amber-600">
          Changes here rewrite the form. Enter or double-click edits a cell,
          Escape backs out, the handle on the left drags a row to reorder it
          — or onto another group to move it there.
        </p>
      )}

      <div
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="overflow-x-auto rounded-md border border-line outline-none focus-visible:border-brand-500"
      >
        <table className="w-full border-collapse text-left text-[11.5px]">
          <thead>
            <tr className="bg-elevated/60 text-subtle">
              <th className="w-8 border-b border-r border-line px-1 py-1 text-center font-semibold">#</th>
              {COLS.map((c) => (
                <th key={c} className="whitespace-nowrap border-b border-r border-line px-2 py-1 font-semibold last:border-r-0">
                  {COL_LABEL[c]}
                </th>
              ))}
              {editable && <th className="w-7 border-b border-line" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((f, i) => {
              const lit = hoverNodes.includes(f.nodeId);
              const isDrop = dropRow === i;
              return (
                <tr
                  key={`${f.nodeId}-${f.index}-${f.key}`}
                  data-node-id={f.nodeId}
                  draggable={editable}
                  onDragStart={() => { dragRow.current = i; }}
                  onDragOver={(e) => { if (editable) { e.preventDefault(); setDropRow(i); } }}
                  onDragLeave={() => setDropRow((d) => (d === i ? null : d))}
                  onDrop={() => onDrop(i)}
                  onMouseEnter={() => onHoverField?.(f.nodeId)}
                  onMouseLeave={() => onHoverField?.(null)}
                  className={`${
                    lit ? "bg-brand-500/20 outline outline-1 -outline-offset-1 outline-brand-400" : i % 2 ? "bg-elevated/25" : ""
                  } ${
                    isDrop ? "outline outline-1 outline-brand-400" : ""
                  }`}
                >
                  <td className="border-b border-r border-line px-1 py-0.5 text-center align-middle text-[10px] text-subtle">
                    {editable ? (
                      <span className="inline-flex cursor-grab items-center gap-0.5 active:cursor-grabbing">
                        <GripVertical size={9} className="text-subtle" />
                        {i + 1}
                      </span>
                    ) : i + 1}
                  </td>

                  {COLS.map((col) => {
                    const on = sel.row === i && sel.col === col;
                    return (
                      <td
                        key={col}
                        onClick={() => { setSel({ row: i, col }); setEditing(false); }}
                        onDoubleClick={() => { if (editable) { setSel({ row: i, col }); setEditing(true); } }}
                        className={`border-b border-r border-line px-2 py-0.5 align-middle last:border-r-0 ${
                          on ? "outline outline-2 -outline-offset-2 outline-brand-500" : ""
                        }`}
                      >
                        <CellBody
                          col={col}
                          row={f}
                          boxes={boxes}
                          editing={on && editing && editable}
                          editable={editable}
                          onCommit={(next) => { apply(next); setEditing(false); }}
                          doc={doc}
                          onFocusNode={onFocusNode}
                        />
                      </td>
                    );
                  })}

                  {editable && (
                    <td className="border-b border-line px-1 text-center align-middle">
                      <button
                        onClick={() => apply(removeFieldAt(doc, f.nodeId, f.index))}
                        title="Remove this question"
                        className="text-muted hover:text-red-500"
                      >
                        <Trash2 size={10} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editable && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[11px] text-subtle">Add a question to</span>
          {boxes.map((b) => (
            <button
              key={b.id}
              onClick={() => apply(addFieldTo(doc, b.id))}
              className="inline-flex items-center gap-1 text-[11.5px] text-brand-500 hover:text-brand-400"
            >
              <Plus size={10} /> {b.text || "box"}
            </button>
          ))}
        </div>
      )}

      {rows.length === 0 && (
        <p className="px-3 py-6 text-center text-[12px] text-muted">
          No questions yet. Add a question box to the chart and it appears here.
        </p>
      )}
    </div>
  );
}

function CellBody({
  col,
  row,
  boxes,
  editing,
  editable,
  onCommit,
  doc,
  onFocusNode,
}: {
  col: Col;
  row: ReturnType<typeof orderedFields>[number];
  boxes: { id: string; text: string }[];
  editing: boolean;
  editable: boolean;
  onCommit: (next: ChartDoc) => void;
  doc: ChartDoc;
  onFocusNode?: (nodeId: string) => void;
}) {
  const f = row.field;
  const set = (patch: Parameters<typeof setFieldValue>[3]) =>
    onCommit(setFieldValue(doc, row.nodeId, row.index, patch));

  const INPUT =
    "w-full bg-transparent px-0 py-0.5 text-[11.5px] text-fg outline-none";

  if (col === "required") {
    return (
      <input
        type="checkbox"
        checked={!!f.required}
        disabled={!editable}
        onChange={(e) => set({ required: e.target.checked })}
        className="align-middle"
      />
    );
  }

  if (col === "type") {
    return editing ? (
      <select autoFocus value={f.type} onChange={(e) => set({ type: e.target.value as FieldType })} className={INPUT}>
        {FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABEL[t]}</option>)}
      </select>
    ) : <span className="text-muted">{FIELD_TYPE_LABEL[f.type]}</span>;
  }

  if (col === "box") {
    return editing ? (
      <select
        autoFocus
        value={row.nodeId}
        onChange={(e) => onCommit(moveFieldToNode(doc, row.nodeId, row.index, e.target.value))}
        className={INPUT}
      >
        {boxes.map((b) => <option key={b.id} value={b.id}>{b.text || "box"}</option>)}
      </select>
    ) : (
      <button onClick={() => onFocusNode?.(row.nodeId)} className="text-left text-muted hover:text-brand-300">
        {row.node.text}
      </button>
    );
  }

  if (col === "choices") {
    const list = (f.options ?? []).join(", ");
    const usesOptions = f.type === "choice" || f.type === "multi";
    if (!usesOptions) return <span className="text-subtle">—</span>;
    return editing ? (
      <input
        autoFocus
        defaultValue={list}
        onBlur={(e) => set({ options: e.target.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20) })}
        className={INPUT}
      />
    ) : <span className="text-muted">{list || "—"}</span>;
  }

  if (col === "key") {
    return editing ? (
      <input autoFocus defaultValue={f.key} onBlur={(e) => set({ key: e.target.value.trim().slice(0, 40) })} className={`${INPUT} font-mono`} />
    ) : <span className="font-mono text-[10.5px] text-muted">{f.key}</span>;
  }

  // question — the label the form shows
  return editing ? (
    <input autoFocus defaultValue={row.label} onBlur={(e) => set({ key: e.target.value.trim().slice(0, 40) || f.key })} className={INPUT} />
  ) : (
    <span className="text-fg">
      {row.label}
      {f.required && <span className="ml-1 text-brand-400">*</span>}
    </span>
  );
}
