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
import { CopyPlus, DoorOpen, FilePlus2, Loader2, Trash2 } from "lucide-react";
import type { BuiltForm } from "@/lib/formbuilder/types";
import { FormBuilder } from "./FormBuilder";
import {
  createForm, deleteForm, duplicateFormAsVersion, openForm,
} from "@/app/(dashboard)/admin/workspace/forms/actions";

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
  // Which closed form is one "Yes" away from opening. Keyed by id like
  // `armed`, so picking another form never carries the question along.
  const [openArmed, setOpenArmed] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [duplicating, startDuplicate] = useTransition();
  const [opening, startOpen] = useTransition();
  // Reported by the builder. Duplicate and Open both act on the SAVED
  // form, so with unsaved edits on screen they would skip them — and
  // Duplicate then remounts the builder on the copy, throwing them away.
  const [builderDirty, setBuilderDirty] = useState(false);
  // The copy just made, held until the refreshed page carries it, so it
  // can be selected the moment the action answers rather than a render
  // later — when the picker would briefly fall back to the first form.
  const [made, setMade] = useState<FormRow | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "problem"; text: string } | null>(null);
  const all = made && !forms.some((f) => f.id === made.id) ? [made, ...forms] : forms;
  const active = all.find((f) => f.id === activeId) ?? all[0] ?? null;

  return (
    <div className="mt-5">
      {/* Hidden wholesale when the page is about one form. */}
      <div className={only ? "hidden" : "flex flex-wrap items-center gap-2"}>
        <select
          value={active?.id ?? ""}
          onChange={(e) => { setActiveId(e.target.value); setNotice(null); }}
          className="rounded-md border border-line bg-elevated px-2.5 py-1.5 text-[13px] font-semibold text-fg outline-none focus-visible:border-brand-500"
        >
          {/* "closed", not "retired": a new version starts closed too,
              and calling a draft retired says the opposite of what it is. */}
          {all.map((f) => (
            <option key={f.id} value={f.id}>{f.title}{f.active ? "" : " (closed)"}</option>
          ))}
          {all.length === 0 && <option value="">No forms yet</option>}
        </select>

        <button
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12.5px] font-semibold text-fg hover:bg-elevated disabled:opacity-40"
          disabled={pending}
          onClick={() => start(async () => { const r = await createForm("New form"); if (r.ok) setActiveId(r.id); })}
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <FilePlus2 size={12} />} New form
        </button>

        {active && (
          <button
            data-form-duplicate-version=""
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12.5px] font-semibold text-fg hover:bg-elevated disabled:opacity-40"
            disabled={pending || duplicating || opening || builderDirty}
            title={builderDirty
              ? "Save your changes first — the copy is made from the saved form."
              : "Copy this form to a new link. Registrations stay with the original, and the copy starts closed."}
            onClick={() => startDuplicate(async () => {
              setNotice(null);
              try {
                const r = await duplicateFormAsVersion(active.id);
                if (!r.ok) { setNotice({ tone: "problem", text: r.problem }); return; }
                setMade(r.form);
                setActiveId(r.form.id);
                setNotice({
                  tone: "ok",
                  text: `Made “${r.form.title}” at /${r.form.slug}. It starts closed, so nobody can register on it yet — check it in Preview, then use Open registration when it is ready. The original is unchanged.`,
                });
              } catch {
                setNotice({ tone: "problem", text: "The copy could not be made. Nothing was changed." });
              }
            })}
          >
            {duplicating ? <Loader2 size={12} className="animate-spin" /> : <CopyPlus size={12} />} Duplicate as new version
          </button>
        )}

        {/* Open only, and only on a closed form. No Close beside it: one
            mis-click there would shut the live registration form, and
            Delete already closes a form that has registrations. */}
        {!only && active && !active.active && (
          openArmed === active.id ? (
            <span className="inline-flex items-center gap-2 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 text-[11.5px] text-emerald-600">
              Open /apply/{active.slug} to the public?
              <button className="font-bold underline disabled:opacity-40"
                disabled={opening || builderDirty}
                onClick={() => startOpen(async () => {
                  const id = active.id;
                  try {
                    const r = await openForm(id);
                    if (!r.ok) { setOpenArmed(null); setNotice({ tone: "problem", text: r.problem }); return; }
                    // The held copy is not in `forms` yet, so it would still
                    // read closed. Rows the page refreshed read open already,
                    // and the question stays up until they do.
                    setMade((m) => (m?.id === id ? { ...m, active: true } : m));
                    setNotice({ tone: "ok", text: `/apply/${r.slug} is open. People can register on it now.` });
                  } catch {
                    setOpenArmed(null);
                    setNotice({ tone: "problem", text: "It could not be opened. Nothing was changed." });
                  }
                })}>
                {opening ? <Loader2 size={11} className="inline animate-spin" /> : "Yes"}
              </button>
              <button className="underline disabled:opacity-40" disabled={opening} onClick={() => setOpenArmed(null)}>No</button>
            </span>
          ) : (
            <button
              data-form-open=""
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12.5px] font-semibold text-fg hover:bg-elevated disabled:opacity-40"
              disabled={pending || duplicating || opening || builderDirty}
              title={builderDirty
                ? "Save your changes first — what opens is the saved form."
                : `Let people register at /apply/${active.slug}.`}
              onClick={() => { setArmed(null); setNotice(null); setOpenArmed(active.id); }}
            >
              <DoorOpen size={12} /> Open registration
            </button>
          )
        )}

        {active && (
          armed === active.id ? (
            <span className="inline-flex items-center gap-2 rounded-md border border-red-500/50 bg-red-500/10 px-2 py-1 text-[11.5px] text-red-500">
              Delete “{active.title}”?
              <button className="font-bold underline"
                onClick={() => start(async () => {
                  const { id, title } = active;
                  const r = await deleteForm(id);
                  setArmed(null);
                  // Otherwise the held copy would put a deleted form back in
                  // the picker. A closed one stays, marked closed.
                  if (made?.id === id) setMade(r.deactivated ? { ...made, active: false } : null);
                  // A form with registrations is closed, not deleted. Said,
                  // because otherwise the picker just shows it again.
                  setNotice(r.deactivated
                    ? {
                        tone: "ok",
                        text: `“${title}” has ${r.submissions} registration${r.submissions === 1 ? "" : "s"}, so it was closed instead of deleted.`,
                      }
                    : null);
                })}>Yes</button>
              <button className="underline" onClick={() => setArmed(null)}>No</button>
            </span>
          ) : (
            <button className="rounded p-1.5 text-subtle hover:bg-elevated hover:text-red-500"
              title="Delete this form" onClick={() => { setOpenArmed(null); setArmed(active.id); }}>
              <Trash2 size={14} />
            </button>
          )
        )}

        {active && (
          <span className="ml-auto font-mono text-[11px] text-subtle">/{active.slug}</span>
        )}
      </div>

      {notice && !only && (
        <p role="status" className={`mt-2 text-[12px] ${notice.tone === "ok" ? "text-muted" : "text-red-500"}`}>
          {notice.text}
        </p>
      )}

      {active ? (
        // Keyed by id: switching forms rebuilds the editor rather than
        // pouring a new document into the old one's state.
        <FormBuilder
          key={active.id}
          formId={active.id}
          initial={active.doc}
          title={active.title}
          slug={only ? active.slug : undefined}
          onDirtyChange={setBuilderDirty}
          canEdit
        />
      ) : (
        <p className="mt-6 text-[13px] text-muted">
          No forms yet. Create one and it opens here.
        </p>
      )}
    </div>
  );
}
