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
import { missingRequired, visibleFields, type AnswerValue, type Answers } from "@/lib/flowchart/form";
import {
  ACADEMIC_INSTITUTIONS,
  COMPANY_TYPES,
  HEALTH_ORGANISATIONS,
  isPlaceholder,
  withOther,
} from "@/lib/flowchart/institutions";
import {
  EMPTY_AFFILIATION,
  EMPTY_CONTACT,
  EMPTY_ORG,
  type Contact,
  type OrgEntry,
  ORG_TYPES,
  OTHER,
  ROLES,
  isComplete,
  type Affiliation,
} from "@/lib/flowchart/vocab";
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
  onChange: (key: string, value: AnswerValue) => void;
  onFocusNode?: (nodeId: string) => void;
}) {
  const fields = useMemo(() => visibleFields(doc, answers), [doc, answers]);
  const missing = useMemo(() => missingRequired(doc, answers), [doc, answers]);
  const total = doc.nodes.filter((n) => n.kind === "question" && n.field?.key).length;
  const hidden = total - fields.length;

  if (total === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-[12.5px] leading-relaxed text-muted">
        This updates as you draw. Add a <strong className="text-fg">question</strong> box to
        the chart and it appears here immediately; put a rule on an arrow and the
        field below it only shows when the answer matches.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between pb-3">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-400">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-400 motion-safe:animate-pulse" aria-hidden />
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
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
}) {
  const s = typeof value === "string" ? value : "";
  const arr = Array.isArray(value) ? (value as string[]).filter((x) => typeof x === "string") : [];

  if (type === "contact") {
    const c = (value && typeof value === "object" && !Array.isArray(value)
      ? (value as unknown as Contact)
      : EMPTY_CONTACT) as Contact;
    return <ContactBlock value={c} onChange={(v) => onChange(v as unknown as AnswerValue)} />;
  }
  if (type === "academic" || type === "health" || type === "company") {
    const o = (value && typeof value === "object" && !Array.isArray(value)
      ? (value as unknown as OrgEntry)
      : EMPTY_ORG) as OrgEntry;
    return <OrgBlock scope={type} value={o} onChange={(v) => onChange(v as unknown as AnswerValue)} />;
  }
  if (type === "affiliation") {
    const list = (Array.isArray(value) && typeof value[0] === "object"
      ? (value as Affiliation[])
      : []) as Affiliation[];
    return <AffiliationList list={list} onChange={onChange} />;
  }

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


/**
 * Affiliations, plural on purpose.
 *
 * Someone can be a PhD student at a university, a clinician at a hospital
 * and a founder of a spin-out simultaneously — a single "organisation"
 * box forces them to pick one and quietly loses the other two. Each entry
 * codes the organisation TYPE and the ROLE from a fixed list so the data
 * stays countable, with an Other box for the cases the list misses.
 */
function AffiliationList({
  list,
  onChange,
}: {
  list: Affiliation[];
  onChange: (v: Affiliation[]) => void;
}) {
  const rows = list.length ? list : [{ ...EMPTY_AFFILIATION }];

  const patch = (i: number, p: Partial<Affiliation>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const setPrimary = (i: number) =>
    onChange(rows.map((r, j) => ({ ...r, primary: j === i })));

  const SELECT =
    "mt-1 w-full rounded-md border border-line bg-elevated px-2 py-1.5 text-[12.5px] text-fg outline-none focus-visible:border-brand-500";

  return (
    <div className="mt-1.5 space-y-3">
      {rows.map((a, i) => (
        <div key={i} className="border-l-2 border-line pl-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-subtle">
              {i === 0 ? "Affiliation" : `Also affiliated with`}
            </span>
            {rows.length > 1 && (
              <button
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="text-[11px] text-muted hover:text-red-500"
              >
                Remove
              </button>
            )}
          </div>

          <label className="block">
            <span className="sr-only">Type of organisation</span>
            <select
              value={a.orgType}
              onChange={(e) => patch(i, { orgType: e.target.value })}
              className={SELECT}
            >
              <option value="">Type of organisation…</option>
              {ORG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          {a.orgType === OTHER && (
            <input
              value={a.orgOther ?? ""}
              placeholder="What kind of organisation?"
              onChange={(e) => patch(i, { orgOther: e.target.value })}
              className={SELECT}
            />
          )}

          <input
            value={a.organisation}
            placeholder="Name of the organisation"
            onChange={(e) => patch(i, { organisation: e.target.value })}
            className={SELECT}
          />
          <input
            value={a.department ?? ""}
            placeholder="Department or lab (optional)"
            onChange={(e) => patch(i, { department: e.target.value })}
            className={SELECT}
          />

          <select
            value={a.role}
            onChange={(e) => patch(i, { role: e.target.value })}
            className={SELECT}
          >
            <option value="">Your role there…</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {a.role === OTHER && (
            <input
              value={a.roleOther ?? ""}
              placeholder="What is your role?"
              onChange={(e) => patch(i, { roleOther: e.target.value })}
              className={SELECT}
            />
          )}

          {rows.length > 1 && (
            <label className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted">
              <input type="radio" checked={!!a.primary} onChange={() => setPrimary(i)} />
              This is my main affiliation
            </label>
          )}
        </div>
      ))}

      <button
        onClick={() => onChange([...rows, { ...EMPTY_AFFILIATION }])}
        className="text-[12px] font-semibold text-brand-400 hover:text-brand-200"
      >
        + Add another affiliation
      </button>
      {rows.filter(isComplete).length > 1 && (
        <p className="text-[11px] text-subtle">
          {rows.filter(isComplete).length} affiliations recorded.
        </p>
      )}
    </div>
  );
}

const SUB =
  "mt-1 w-full rounded-md border border-line bg-elevated px-2 py-1.5 text-[12.5px] text-fg outline-none focus-visible:border-brand-500";

/** Name, phone and email in one node — the details every registration needs. */
function ContactBlock({
  value,
  onChange,
}: {
  value: Contact;
  onChange: (v: Contact) => void;
}) {
  const set = (p: Partial<Contact>) => onChange({ ...value, ...p });
  return (
    <div className="mt-1.5 grid grid-cols-2 gap-2">
      <input value={value.firstName} placeholder="First name" onChange={(e) => set({ firstName: e.target.value })} className={SUB} />
      <input value={value.lastName} placeholder="Last name" onChange={(e) => set({ lastName: e.target.value })} className={SUB} />
      <input type="email" value={value.email} placeholder="Email" onChange={(e) => set({ email: e.target.value })} className={`${SUB} col-span-2`} />
      <input type="tel" value={value.phone ?? ""} placeholder="Phone (optional)" onChange={(e) => set({ phone: e.target.value })} className={`${SUB} col-span-2`} />
    </div>
  );
}

/**
 * One organisation, picked from the standardised list for its kind.
 *
 * Academic, health and company are separate questions rather than one
 * dropdown because a person can answer all three, and because the useful
 * follow-up differs: a company needs its TYPE, a university does not.
 */
function OrgBlock({
  scope,
  value,
  onChange,
}: {
  scope: "academic" | "health" | "company";
  value: OrgEntry;
  onChange: (v: OrgEntry) => void;
}) {
  const set = (p: Partial<OrgEntry>) => onChange({ ...value, ...p });
  const list =
    scope === "academic" ? ACADEMIC_INSTITUTIONS : scope === "health" ? HEALTH_ORGANISATIONS : [];
  const needsList = scope !== "company";
  const thin = needsList && isPlaceholder(list);

  return (
    <div className="mt-1.5 space-y-2">
      {needsList ? (
        <>
          <select value={value.name} onChange={(e) => set({ name: e.target.value })} className={SUB}>
            <option value="">
              {scope === "academic" ? "Choose your institution…" : "Choose your hospital or network…"}
            </option>
            {withOther(list).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {(value.name === OTHER || thin) && (
            <input
              value={value.nameOther ?? ""}
              placeholder={scope === "academic" ? "Name your institution" : "Name your hospital or network"}
              onChange={(e) => set({ name: OTHER, nameOther: e.target.value })}
              className={SUB}
            />
          )}
        </>
      ) : (
        <>
          <input
            value={value.nameOther ?? ""}
            placeholder="Company name"
            onChange={(e) => set({ name: OTHER, nameOther: e.target.value })}
            className={SUB}
          />
          <select
            value={value.companyType ?? ""}
            onChange={(e) => set({ companyType: e.target.value })}
            className={SUB}
          >
            <option value="">What kind of company?</option>
            {COMPANY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {value.companyType === OTHER && (
            <input
              value={value.companyTypeOther ?? ""}
              placeholder="Describe the company"
              onChange={(e) => set({ companyTypeOther: e.target.value })}
              className={SUB}
            />
          )}
        </>
      )}

      <input
        value={value.department ?? ""}
        placeholder={scope === "company" ? "Team (optional)" : "Department or lab (optional)"}
        onChange={(e) => set({ department: e.target.value })}
        className={SUB}
      />
      <input
        value={value.role ?? ""}
        placeholder="Your role there (optional)"
        onChange={(e) => set({ role: e.target.value })}
        className={SUB}
      />
    </div>
  );
}