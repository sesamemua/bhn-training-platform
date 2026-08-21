"use client";

/**
 * Picking which form to work on, and the builder for it.
 *
 * A thin shell: everything interesting is in FormBuilder. It exists so
 * the builder can hold one form's document in state without having to
 * also own "which form", which is the kind of coupling that makes
 * switching forms lose your unsaved work.
 */
import { useState, useTransition } from "react";
import { FilePlus2, Loader2, Trash2 } from "lucide-react";
import type { BuiltForm } from "@/lib/formbuilder/types";
import { FormBuilder } from "./FormBuilder";
import { createForm, deleteForm } from "@/app/(dashboard)/admin/workspace/forms/actions";

export interface FormRow {
  id: string; slug: string; title: string; active: boolean;
  doc: BuiltForm; updatedAt: string;
}

/**
 * @param only  This page is ABOUT one form, so the chrome for choosing
 *              between forms, making another and deleting this one is
 *              hidden. Not disabled — a delete button greyed out on the
 *              page named after the thing still reads as an offer, and
 *              deleting the symposium's registration form from the page
 *              that exists to edit it is not an offer worth making.
 */
export function FormsWorkspace({ forms, only = false }: { forms: FormRow[]; only?: boolean }) {
  const [activeId, setActiveId] = useState(forms[0]?.id ?? "");
  const [armed, setArmed] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const active = forms.find((f) => f.id === activeId) ?? forms[0] ?? null;

  return (
    <div className="mt-5">
      {/* Hidden wholesale when the page is about one form. */}
      <div className={only ? "hidden" : "flex flex-wrap items-center gap-2"}>
        <select
          value={active?.id ?? ""}
          onChange={(e) => setActiveId(e.target.value)}
          className="rounded-md border border-line bg-elevated px-2.5 py-1.5 text-[13px] font-semibold text-fg outline-none focus-visible:border-brand-500"
        >
          {forms.map((f) => (
            <option key={f.id} value={f.id}>{f.title}{f.active ? "" : " (retired)"}</option>
          ))}
          {forms.length === 0 && <option value="">No forms yet</option>}
        </select>

        <button
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12.5px] font-semibold text-fg hover:bg-elevated disabled:opacity-40"
          disabled={pending}
          onClick={() => start(async () => { const r = await createForm("New form"); if (r.ok) setActiveId(r.id); })}
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <FilePlus2 size={12} />} New form
        </button>

        {active && (
          armed === active.id ? (
            <span className="inline-flex items-center gap-2 rounded-md border border-red-500/50 bg-red-500/10 px-2 py-1 text-[11.5px] text-red-500">
              Delete “{active.title}”?
              <button className="font-bold underline"
                onClick={() => start(async () => { await deleteForm(active.id); setArmed(null); })}>Yes</button>
              <button className="underline" onClick={() => setArmed(null)}>No</button>
            </span>
          ) : (
            <button className="rounded p-1.5 text-subtle hover:bg-elevated hover:text-red-500"
              title="Delete this form" onClick={() => setArmed(active.id)}>
              <Trash2 size={14} />
            </button>
          )
        )}

        {active && (
          <span className="ml-auto font-mono text-[11px] text-subtle">/{active.slug}</span>
        )}
      </div>

      {active ? (
        // Keyed by id: switching forms rebuilds the editor rather than
        // pouring a new document into the old one's state.
        <FormBuilder key={active.id} formId={active.id} initial={active.doc} canEdit />
      ) : (
        <p className="mt-6 text-[13px] text-muted">
          No forms yet. Create one and it opens here.
        </p>
      )}
    </div>
  );
}
