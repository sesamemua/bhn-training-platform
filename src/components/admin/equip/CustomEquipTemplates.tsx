"use client";

/**
 * Custom EQUIP email templates — add / remove, on top of the fixed
 * lifecycle set (submission, approved, funded, …). These aren't tied to
 * any status transition: an admin names one, picks which stream(s) it
 * applies to, writes (or AI-drafts) the copy, and it shows up in every
 * application's "Send email to applicant" picker from then on. Delete
 * removes it from that picker; it never affects an email already sent.
 */
import { useState } from "react";
import {
  Mail, ChevronDown, Pencil, Sparkles, Loader2, Check, X, Eye, Plus, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EditableFields {
  subject: string;
  heading: string;
  paras: string[];
  ctaLabel?: string;
  footnote?: string;
}
type AppliesTo = "both" | "venture_connect" | "venture_lift";
type NoteSource = "reviewer" | "disbursement" | "none";
type Cta = "tracker" | "equip";

export interface CustomTemplateItem {
  id: string;
  label: string;
  appliesTo: AppliesTo;
  noteSource: NoteSource;
  cta: Cta;
  fields: EditableFields;
  subject: string;
  html: string;
  createdAt: string;
}
export interface PlaceholderDoc { token: string; desc: string }

interface Draft {
  label: string;
  appliesTo: AppliesTo;
  noteSource: NoteSource;
  cta: Cta;
  subject: string;
  heading: string;
  parasText: string;
  ctaLabel: string;
  footnote: string;
}

const BLANK_DRAFT: Draft = {
  label: "", appliesTo: "both", noteSource: "none", cta: "tracker",
  subject: "", heading: "", parasText: "Hi {{firstName}},\n\n", ctaLabel: "", footnote: "",
};

const toDraft = (t: CustomTemplateItem): Draft => ({
  label: t.label, appliesTo: t.appliesTo, noteSource: t.noteSource, cta: t.cta,
  subject: t.fields.subject, heading: t.fields.heading, parasText: t.fields.paras.join("\n\n"),
  ctaLabel: t.fields.ctaLabel ?? "", footnote: t.fields.footnote ?? "",
});
const fromDraft = (d: Draft): EditableFields => ({
  subject: d.subject.trim(),
  heading: d.heading.trim(),
  paras: d.parasText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
  ctaLabel: d.ctaLabel.trim() || undefined,
  footnote: d.footnote.trim() || undefined,
});
/** Which stream to render the preview with — "both" has no sample
 *  context of its own, so VentureConnect's stands in. */
const previewStream = (a: AppliesTo) => (a === "both" ? "venture_connect" : a);

const APPLIES_TO_LABEL: Record<AppliesTo, string> = {
  both: "Both streams", venture_connect: "VentureConnect only", venture_lift: "VentureLift only",
};
const NOTE_SOURCE_LABEL: Record<NoteSource, string> = {
  reviewer: "Reviewer note", disbursement: "Disbursement note", none: "None",
};
const CTA_LABEL: Record<Cta, string> = {
  tracker: "Their applications dashboard", equip: "EQUIP landing page",
};

export function CustomEquipTemplates({
  initial,
  placeholders,
  canEdit,
}: {
  initial: CustomTemplateItem[];
  placeholders: PlaceholderDoc[];
  canEdit: boolean;
}) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // item id, or "new"
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftPreview, setDraftPreview] = useState<{ subject: string; html: string } | null>(null);
  const [aiInstruction, setAiInstruction] = useState("");
  const [busy, setBusy] = useState<"preview" | "save" | "ai" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function closeEditor() {
    setEditing(null);
    setDraft(null);
    setDraftPreview(null);
    setAiInstruction("");
    setError(null);
    setNotice(null);
  }
  function startEdit(it: CustomTemplateItem) {
    setEditing(it.id);
    setDraft(toDraft(it));
    setDraftPreview(null);
    setAiInstruction("");
    setError(null);
    setNotice(null);
    setOpen(it.id);
  }
  function startNew() {
    setEditing("new");
    setDraft({ ...BLANK_DRAFT });
    setDraftPreview(null);
    setAiInstruction("");
    setError(null);
    setNotice(null);
  }

  async function api(path: string, init: RequestInit) {
    const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
    if (!res.ok) throw new Error(j.error ?? "Request failed.");
    return j;
  }

  async function updatePreview() {
    if (!draft) return;
    setBusy("preview");
    setError(null);
    try {
      const j = await api("/api/admin/equip/email-templates/custom/preview", {
        method: "POST",
        body: JSON.stringify({
          stream: previewStream(draft.appliesTo),
          noteSource: draft.noteSource,
          cta: draft.cta,
          fields: fromDraft(draft),
        }),
      });
      setDraftPreview({ subject: j.subject as string, html: j.html as string });
      setNotice(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function askAi() {
    if (!draft) return;
    setBusy("ai");
    setError(null);
    try {
      const j = await api("/api/admin/equip/email-templates/custom/assist", {
        method: "POST",
        body: JSON.stringify({
          label: draft.label, stream: previewStream(draft.appliesTo),
          instruction: aiInstruction, fields: fromDraft(draft),
        }),
      });
      const f = j.fields as EditableFields;
      setDraft((d) => d && ({
        ...d, subject: f.subject, heading: f.heading, parasText: f.paras.join("\n\n"),
        ctaLabel: f.ctaLabel ?? "", footnote: f.footnote ?? "",
      }));
      setDraftPreview({ subject: j.subject as string, html: j.html as string });
      setNotice("AI draft loaded — review the preview, tweak if needed, then save.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!draft) return;
    if (!draft.label.trim()) { setError("Give the template a name."); return; }
    setBusy("save");
    setError(null);
    try {
      const payload = {
        label: draft.label.trim(), appliesTo: draft.appliesTo,
        noteSource: draft.noteSource, cta: draft.cta, fields: fromDraft(draft),
      };
      if (editing === "new") {
        const j = await api("/api/admin/equip/email-templates/custom", { method: "POST", body: JSON.stringify(payload) });
        const t = j.template as { id: string; createdAt: string };
        const built = draftPreview ?? { subject: payload.fields.subject, html: "" };
        setItems((cur) => [...cur, { ...payload, id: t.id, createdAt: t.createdAt, subject: built.subject, html: built.html }]);
      } else if (editing) {
        await api(`/api/admin/equip/email-templates/custom/${editing}`, { method: "PATCH", body: JSON.stringify(payload) });
        const built = draftPreview ?? { subject: payload.fields.subject, html: "" };
        setItems((cur) => cur.map((it) => (it.id === editing ? { ...it, ...payload, subject: built.subject, html: built.html } : it)));
      }
      closeEditor();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function remove(it: CustomTemplateItem) {
    if (!confirm(`Delete “${it.label}”? This removes it from every application's send picker. Emails already sent are unaffected.`)) return;
    setBusy("delete");
    setError(null);
    try {
      await api(`/api/admin/equip/email-templates/custom/${it.id}`, { method: "DELETE" });
      setItems((cur) => cur.filter((x) => x.id !== it.id));
      if (open === it.id) setOpen(null);
      if (editing === it.id) closeEditor();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const inputCls =
    "w-full rounded-md border border-line bg-card-solid px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-400";
  const labelCls = "block text-[10px] font-bold uppercase tracking-wider text-subtle";
  const selectCls = inputCls + " font-semibold";

  function renderEditorFields() {
    if (!draft) return null;
    return (
      <div className="space-y-3 border-t border-line bg-elevated/30 px-4 py-4">
        <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-700">
            <Sparkles size={12} /> AI rewrite
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && busy === null && askAi()}
              placeholder="e.g. Make it warmer and shorter · Invite them to the pitch night"
              className="min-w-[16rem] flex-1 rounded-md border border-brand-200 bg-card-solid px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <button
              type="button"
              onClick={askAi}
              disabled={busy !== null || aiInstruction.trim().length < 3}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-1.5 text-[12px] font-bold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy === "ai" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              Rewrite
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-brand-900/70">
            The AI proposes copy into the fields below — nothing sends, and nothing saves, until you do.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={labelCls}>Template name (internal — applicants never see it)</span>
            <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. Pitch night invite" className={cn(inputCls, "mt-1")} />
          </label>
          <label className="block">
            <span className={labelCls}>Applies to</span>
            <select value={draft.appliesTo} onChange={(e) => setDraft({ ...draft, appliesTo: e.target.value as AppliesTo })} className={cn(selectCls, "mt-1")}>
              {(Object.keys(APPLIES_TO_LABEL) as AppliesTo[]).map((k) => <option key={k} value={k}>{APPLIES_TO_LABEL[k]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Append note</span>
            <select value={draft.noteSource} onChange={(e) => setDraft({ ...draft, noteSource: e.target.value as NoteSource })} className={cn(selectCls, "mt-1")}>
              {(Object.keys(NOTE_SOURCE_LABEL) as NoteSource[]).map((k) => <option key={k} value={k}>{NOTE_SOURCE_LABEL[k]}</option>)}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className={labelCls}>Subject</span>
            <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} className={cn(inputCls, "mt-1")} />
          </label>
          <label className="block">
            <span className={labelCls}>Heading</span>
            <input value={draft.heading} onChange={(e) => setDraft({ ...draft, heading: e.target.value })} className={cn(inputCls, "mt-1")} />
          </label>
          <label className="block">
            <span className={labelCls}>Button label</span>
            <input value={draft.ctaLabel} onChange={(e) => setDraft({ ...draft, ctaLabel: e.target.value })} placeholder="(no button if empty)" className={cn(inputCls, "mt-1")} />
          </label>
          {draft.ctaLabel.trim() && (
            <label className="block sm:col-span-2">
              <span className={labelCls}>Button links to</span>
              <select value={draft.cta} onChange={(e) => setDraft({ ...draft, cta: e.target.value as Cta })} className={cn(selectCls, "mt-1")}>
                {(Object.keys(CTA_LABEL) as Cta[]).map((k) => <option key={k} value={k}>{CTA_LABEL[k]}</option>)}
              </select>
            </label>
          )}
          <label className="block sm:col-span-2">
            <span className={labelCls}>Body — one paragraph per blank line</span>
            <textarea
              value={draft.parasText}
              onChange={(e) => setDraft({ ...draft, parasText: e.target.value })}
              rows={8}
              className={cn(inputCls, "mt-1 resize-y font-mono text-[12.5px] leading-relaxed")}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={labelCls}>Footnote (small print, optional)</span>
            <input value={draft.footnote} onChange={(e) => setDraft({ ...draft, footnote: e.target.value })} className={cn(inputCls, "mt-1")} />
          </label>
        </div>

        <details className="rounded-lg border border-line bg-card-solid px-3 py-2">
          <summary className="cursor-pointer text-[11.5px] font-semibold text-muted hover:text-fg">
            Placeholders you can use ( {"{{firstName}}"}, {"{{streamName}}"}, … ) + **bold**
          </summary>
          <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {placeholders.map((p) => (
              <li key={p.token} className="text-[11.5px] text-muted">
                <code className="rounded bg-elevated px-1 py-0.5 font-mono text-[10.5px] text-fg">{p.token}</code> — {p.desc}
              </li>
            ))}
          </ul>
        </details>

        {error && <p className="text-[12px] font-medium text-rose-700">{error}</p>}
        {notice && <p className="text-[12px] font-medium text-brand-700">{notice}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={updatePreview}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card-solid px-3.5 py-2 text-[12px] font-semibold text-fg hover:bg-elevated disabled:opacity-50"
          >
            {busy === "preview" ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
            Update preview
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-[12px] font-bold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy === "save" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            {editing === "new" ? "Create template" : "Save template"}
          </button>
          <button
            type="button"
            onClick={closeEditor}
            disabled={busy === "save"}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-semibold text-muted hover:text-fg disabled:opacity-50"
          >
            <X size={13} /> Cancel
          </button>
        </div>

        {draftPreview && (
          <iframe
            title="Custom template preview"
            srcDoc={draftPreview.html}
            sandbox=""
            loading="lazy"
            style={{ background: "#f1f5f9" }}
            className="h-[420px] w-full rounded-lg border border-line"
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-fg">Custom templates</p>
          <p className="text-[11.5px] text-muted">
            Not tied to any status — write your own, add it to every application&apos;s send picker, remove it any time.
          </p>
        </div>
        {canEdit && editing !== "new" && (
          <button
            type="button"
            onClick={startNew}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-1.5 text-[12px] font-bold text-white hover:bg-brand-700"
          >
            <Plus size={13} /> New template
          </button>
        )}
      </div>

      {editing === "new" && (
        <div className="overflow-hidden rounded-xl border border-brand-300 bg-card-solid">
          <div className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-fg">
            <Plus size={14} className="text-brand-600" /> New custom template
          </div>
          {renderEditorFields()}
        </div>
      )}

      {items.length === 0 && editing !== "new" && (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[12.5px] text-muted">
          No custom templates yet.
        </p>
      )}

      <ul className="space-y-3">
        {items.map((it) => {
          const isOpen = open === it.id;
          const isEditing = editing === it.id;
          const shownSubject = isEditing && draftPreview ? draftPreview.subject : it.subject;
          const shownHtml = isEditing && draftPreview ? draftPreview.html : it.html;
          return (
            <li key={it.id} className="overflow-hidden rounded-xl border border-line bg-card-solid">
              <button
                type="button"
                onClick={() => { setOpen(isOpen ? null : it.id); if (isOpen) closeEditor(); }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-elevated/40"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <Mail size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-bold text-fg">
                    {it.label}
                    <span className="rounded-full bg-elevated px-2 py-0.5 text-[10px] font-semibold text-subtle">
                      {APPLIES_TO_LABEL[it.appliesTo]}
                    </span>
                  </span>
                  <span className="block text-[11.5px] text-muted">Sent manually, from the applicant&apos;s review page</span>
                </span>
                <ChevronDown size={16} className={cn("shrink-0 text-muted transition-transform", isOpen && "rotate-180")} />
              </button>

              <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                <div className="overflow-hidden">
                  <div className={cn("border-t border-line transition-opacity duration-150 ease-out", isOpen ? "opacity-100" : "opacity-0")}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">Subject</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">{shownSubject}</span>
                      {canEdit && !isEditing && (
                        <span className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => remove(it)}
                            disabled={busy !== null}
                            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card-solid px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            <Trash2 size={11} /> Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(it)}
                            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-brand-700"
                          >
                            <Pencil size={11} /> Edit template
                          </button>
                        </span>
                      )}
                    </div>

                    {isEditing && draft ? renderEditorFields() : (
                      <iframe
                        title={`${it.label} preview`}
                        srcDoc={shownHtml}
                        sandbox=""
                        loading="lazy"
                        style={{ background: "#f1f5f9" }}
                        className="h-[420px] w-full border-0"
                      />
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
