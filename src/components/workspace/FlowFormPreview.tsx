"use client";

/**
 * The live form beside the chart.
 *
 * Renders whatever the chart currently says, re-evaluated on every
 * keystroke: answer a question and any branch whose condition stops
 * matching disappears, because the field is no longer reachable. Nothing
 * here is a second definition of the form — it is the chart, executed.
 */
import { useMemo } from "react";
import { CircleAlert } from "lucide-react";
import { missingRequired, visibleFields, type Answers } from "@/lib/flowchart/form";
import { FIELD_TYPE_LABEL, type ChartDoc, type FieldType } from "@/lib/flowchart/types";

const INPUT =
  "mt-1 w-full rounded-md border border-line bg-elevated px-3 py-2 text-[13.5px] text-fg outline-none transition-colors focus-visible:border-brand-500";

export function FlowFormPreview({
  doc,
  answers,
  onChange,
  onFocusNode,
}: {
  doc: ChartDoc;
  answers: Answers;
  onChange: (key: string, value: string | string[]) => void;
  onFocusNode?: (nodeId: string) => void;
}) {
  const fields = useMemo(() => visibleFields(doc, answers), [doc, answers]);
  const missing = useMemo(() => missingRequired(doc, answers), [doc, answers]);
  const total = doc.nodes.filter((n) => n.kind === "question" && n.field?.key).length;
  const hidden = total - fields.length;

  if (total === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-[12.5px] leading-relaxed text-muted">
        Add a <strong className="text-fg">question</strong> box to the chart and it becomes a
        field here. Put a condition on an arrow and the field below it only
        appears when the answer matches.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between pb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-400">
          Live form
        </p>
        <p className="text-[11.5px] text-subtle">
          {fields.length} shown{hidden > 0 ? ` · ${hidden} hidden by your answers` : ""}
        </p>
      </div>

      <div className="space-y-4">
        {fields.map((f) => {
          const def = f.node.field!;
          const val = answers[f.key];
          const isMissing = missing.some((m) => m.key === f.key);
          return (
            <div key={f.nodeId}>
              <button
                onClick={() => onFocusNode?.(f.nodeId)}
                className="block text-left"
                title="Show this box on the chart"
              >
                <span className="text-[13px] font-semibold text-fg">
                  {f.label}
                  {def.required && <span className="ml-1 text-brand-400">*</span>}
                </span>
              </button>
              {def.help && <p className="mt-0.5 text-[11.5px] text-subtle">{def.help}</p>}
              <Field
                type={def.type}
                options={def.options ?? []}
                value={val}
                onChange={(v) => onChange(f.key, v)}
              />
              {isMissing && (
                <p className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-amber-600">
                  <CircleAlert size={11} /> Needed before submitting
                </p>
              )}
            </div>
          );
        })}
      </div>

      {fields.length > 0 && (
        <p className="mt-5 border-t border-line pt-3 text-[11.5px] text-subtle">
          {missing.length === 0
            ? "Every required question is answered."
            : `${missing.length} required ${missing.length === 1 ? "answer" : "answers"} still missing.`}
        </p>
      )}
    </div>
  );
}

function Field({
  type,
  options,
  value,
  onChange,
}: {
  type: FieldType;
  options: string[];
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
}) {
  const s = typeof value === "string" ? value : "";
  const arr = Array.isArray(value) ? value : [];

  if (type === "long") {
    return <textarea rows={3} value={s} onChange={(e) => onChange(e.target.value)} className={`${INPUT} resize-y`} />;
  }
  if (type === "yesno") {
    return (
      <div className="mt-1.5 flex gap-4">
        {["Yes", "No"].map((o) => (
          <label key={o} className="flex items-center gap-1.5 text-[13px] text-fg">
            <input type="radio" checked={s === o} onChange={() => onChange(o)} />
            {o}
          </label>
        ))}
      </div>
    );
  }
  if (type === "choice") {
    return (
      <div className="mt-1.5 flex flex-col gap-1.5">
        {(options.length ? options : ["Option A", "Option B"]).map((o) => (
          <label key={o} className="flex items-center gap-1.5 text-[13px] text-fg">
            <input type="radio" checked={s === o} onChange={() => onChange(o)} />
            {o}
          </label>
        ))}
      </div>
    );
  }
  if (type === "multi") {
    return (
      <div className="mt-1.5 flex flex-col gap-1.5">
        {(options.length ? options : ["Option A", "Option B"]).map((o) => (
          <label key={o} className="flex items-center gap-1.5 text-[13px] text-fg">
            <input
              type="checkbox"
              checked={arr.includes(o)}
              onChange={(e) => onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))}
            />
            {o}
          </label>
        ))}
      </div>
    );
  }

  const inputType = type === "email" ? "email" : type === "number" ? "number" : type === "date" ? "date" : "text";
  return (
    <input
      type={inputType}
      value={s}
      placeholder={FIELD_TYPE_LABEL[type]}
      onChange={(e) => onChange(e.target.value)}
      className={`${INPUT} placeholder:text-subtle`}
    />
  );
}
