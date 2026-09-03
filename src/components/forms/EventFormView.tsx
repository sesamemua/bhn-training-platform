"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DemoFiller } from "@/components/demo/DemoFiller";
import { TALENT_APPLICATION_PRESETS } from "@/lib/demo/presets";
import {
  Pencil, Save, X, Plus, Trash2, Check, AlertCircle, Loader2, ListChecks,
  ChevronUp, ChevronDown, Type, Mail, Link as LinkIcon, AlignLeft, ListChecks as RadioIcon, Heading,
  Upload, Paperclip, Eraser, FileText,
} from "lucide-react";
import { PageHero } from "@/components/ui/PageHero";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  type FormField,
  type ChoiceField,
  type InputField,
  type MultiCheckboxField,
  type FileField,
  isChoiceField,
  isInputField,
  isSectionField,
  isMultiCheckboxField,
  isFileField,
  isFieldVisible,
} from "@/lib/forms/types";
import { getCampaignAttribution } from "@/lib/campaign/attribution-client";
import { trackGoogleAdsConversion } from "@/lib/campaign/google-ads-conversions";

interface Props {
  slug: string;
  title: string;
  description: string | null;
  fields: FormField[];
  active: boolean;
  isStaff: boolean;
  userEmail: string | null;
  previousData: Record<string, string | string[]> | null;
  previousAt: string | null;
  /**
   * True when at least one default in `previousData` came from the
   * trainee's "My Application" artifacts (resume / video / pitch on
   * User), as opposed to a prior submission of THIS form. Used to
   * render a banner that explains where the pre-filled values came
   * from — different mental model than "you submitted this before".
   */
  applicationDefaultsApplied?: boolean;
  /**
   * Optional banner rendered immediately AFTER the hero (PageHero)
   * and BEFORE the form fields. The platform rule is that nothing
   * may sit above the editorial hero, so per-page notices live here
   * instead of above the EventFormView call. Used by the talent-
   * application surface to surface the admin-review notice.
   */
  topBanner?: React.ReactNode;
}

type Mode = "view" | "edit";

export function EventFormView({
  slug,
  title,
  description,
  fields: initialFields,
  active,
  isStaff,
  userEmail,
  previousData,
  previousAt,
  applicationDefaultsApplied,
  topBanner,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("view");

  // Schema (only mutated in edit mode). Source of truth for view mode too,
  // so a successful save reflects immediately without a router.refresh().
  const [schema, setSchema] = useState<FormField[]>(initialFields);
  const [draft, setDraft] = useState<FormField[]>(initialFields);
  const [savingSchema, setSavingSchema] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // Submission state. Value is string for simple fields, string[] for
  // multicheckbox, and a URL string (after R2 upload) for file fields.
  const [values, setValues] = useState<Record<string, string | string[]>>(() => {
    const v: Record<string, string | string[]> = {};
    if (previousData) {
      for (const k in previousData) {
        v[k] = previousData[k] ?? "";
      }
    }
    return v;
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Branded confirm dialog — replaces window.confirm() for the
  // "are you sure you want to clear?" prompt + any other yes/no
  // prompts this view triggers. Renders nothing until opened; the
  // hook returns the portal node we drop near the form's end.
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  const enterEdit = () => {
    setDraft(JSON.parse(JSON.stringify(schema)));
    setSchemaError(null);
    setMode("edit");
  };
  const cancelEdit = () => {
    setDraft(schema);
    setSchemaError(null);
    setMode("view");
  };

  async function saveSchema() {
    setSavingSchema(true);
    setSchemaError(null);
    try {
      const res = await fetch(`/api/forms/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: draft }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string; ok?: boolean;
      };
      if (!res.ok) {
        setSchemaError(j.error ?? "Save failed.");
        return;
      }
      setSchema(draft);
      setMode("view");
    } finally {
      setSavingSchema(false);
    }
  }

  function patchField(id: string, patch: Partial<FormField>) {
    setDraft((cur) =>
      cur.map((f) => (f.id === id ? ({ ...f, ...patch } as FormField) : f))
    );
  }

  function removeField(id: string) {
    setDraft((cur) => cur.filter((f) => f.id !== id));
  }

  function moveField(id: string, dir: -1 | 1) {
    setDraft((cur) => {
      const i = cur.findIndex((f) => f.id === id);
      if (i < 0) return cur;
      const j = i + dir;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function newId() {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `f_${crypto.randomUUID().slice(0, 8)}`
      : `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }

  // Subset of FormField["type"] the inline add-field UI exposes.
  // multicheckbox / file / date / select / tel only seedable through
  // the registry today, not via the click-to-add UI.
  function addField(type: AddableType) {
    const id = newId();
    let f: FormField;
    if (type === "section") {
      f = { id, type, label: "Section heading" };
    } else if (type === "radio") {
      f = { id, type, label: "New choice", required: false, options: ["Option 1"] };
    } else {
      // Narrowed to InputField subset (text / textarea / email / url).
      f = { id, type, label: "New field", required: false };
    }
    setDraft((cur) => [...cur, f]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    // Client-side required check (covers strings + arrays).
    // Conditionally-hidden fields are treated as optional — we
    // skip them even if `required: true` because the user can't
    // see them to fill them in. isFieldVisible walks the whole
    // showWhen chain so grandchildren of a hidden ancestor are
    // also treated as hidden.
    for (const f of schema) {
      if (isSectionField(f)) continue;
      if (!f.required) continue;
      if (!isFieldVisible(f, schema, values)) continue;
      const v = values[f.id];
      const empty =
        v === undefined ||
        (typeof v === "string" && !v.trim()) ||
        (Array.isArray(v) && v.length === 0);
      if (empty) {
        setSubmitError(`Please complete: ${f.label}`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/forms/${slug}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: values,
          campaignAttribution: getCampaignAttribution(),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string; ok?: boolean;
      };
      if (!res.ok) {
        setSubmitError(j.error ?? "Submission failed.");
        return;
      }
      if (slug === "talent-application") {
        trackGoogleAdsConversion("experience");
      }
      setSubmitted(true);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto mb-3">
            <Check size={22} />
          </div>
          <h2 className="text-xl font-semibold text-emerald-900">
            Registration submitted
          </h2>
          <p className="text-sm text-emerald-800 mt-1">
            Thanks{userEmail ? `, ${userEmail}` : ""}. We&apos;ll be in touch.
          </p>
          <button
            onClick={() => {
              setSubmitted(false);
              setValues({});
            }}
            className="mt-4 text-sm text-emerald-700 hover:text-emerald-900 underline"
          >
            Submit another response
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHero
        eyebrow={<><FileText size={11} /> BHN form</>}
        title={title}
        description={description}
      />
      {/* Per-page banner renders AFTER the hero (platform rule:
          nothing sits above the hero). */}
      {topBanner}
      <div className="max-w-2xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="flex-1 min-w-0">{/* PageHero now carries the title/description; the small slug-specific DemoFiller stays in this column.  */}
          {slug === "talent-application" && (
            <DemoFiller
              visible={isStaff}
              presets={TALENT_APPLICATION_PRESETS}
              onFill={async (preset) => {
                // Apply text + radio + multicheckbox values immediately
                // so the form looks responsive.
                setValues((cur) => {
                  const next = { ...cur };
                  for (const [k, v] of Object.entries(preset)) {
                    if (v !== undefined) next[k] = v as string | string[];
                  }
                  return next;
                });

                // For file fields the form expects R2-backed URLs that
                // start with R2_PUBLIC_URL (the submissions API
                // validates this). Seed minimal placeholder PDFs to
                // R2 once per session via the admin endpoint, then
                // patch their URLs onto resume / support_letter /
                // supporting_document. Cache URLs in sessionStorage
                // to avoid hitting the endpoint on every fill.
                try {
                  const cached = sessionStorage.getItem("bhn-talent-sample-files");
                  let urls: Record<string, string> | null = cached ? JSON.parse(cached) : null;
                  if (!urls) {
                    const r = await fetch("/api/admin/forms/talent-application/seed-samples", {
                      method: "POST",
                    });
                    if (r.ok) {
                      const j = await r.json();
                      urls = j.urls as Record<string, string>;
                      try { sessionStorage.setItem("bhn-talent-sample-files", JSON.stringify(urls)); } catch {/* ignore */}
                    }
                  }
                  if (urls) {
                    setValues((cur) => ({
                      ...cur,
                      ...(urls!.resume              ? { resume:              urls!.resume } : {}),
                      ...(urls!.support_letter      ? { support_letter:      urls!.support_letter } : {}),
                      ...(urls!.supporting_document ? { supporting_document: urls!.supporting_document } : {}),
                    }));
                  }
                } catch {/* ignore — text fields are still filled */}
              }}
              className="mt-2"
              hint="staff-only · seeds placeholder PDFs to R2"
            />
          )}
        </div>
        {isStaff && mode === "view" && (
          <div className="shrink-0 flex gap-2">
            <a
              href={`/admin/forms/${slug}`}
              className="text-xs px-3 py-2 rounded-lg border border-line hover:bg-elevated text-muted hover:text-fg transition-colors inline-flex items-center gap-1.5"
            >
              <ListChecks size={14} /> Submissions
            </a>
            <button
              type="button"
              onClick={enterEdit}
              className="text-xs px-3 py-2 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 inline-flex items-center gap-1.5 font-medium"
            >
              <Pencil size={14} /> Edit form
            </button>
          </div>
        )}
        {isStaff && mode === "edit" && (
          <div className="shrink-0 flex gap-2">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={savingSchema}
              className="text-xs px-3 py-2 rounded-lg border border-line hover:bg-elevated text-muted hover:text-fg transition-colors inline-flex items-center gap-1.5"
            >
              <X size={14} /> Cancel
            </button>
            <button
              type="button"
              onClick={saveSchema}
              disabled={savingSchema}
              className="text-xs px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60 inline-flex items-center gap-1.5 font-medium"
            >
              {savingSchema ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {savingSchema ? "Saving…" : "Save changes"}
            </button>
          </div>
        )}
      </div>

      {!active && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-sm text-amber-900">
          This form is currently inactive. New submissions are not accepted.
        </div>
      )}

      {previousAt && mode === "view" && (
        <div className="bg-elevated border border-line rounded-xl px-4 py-3 mb-4 text-sm text-muted">
          You submitted this form on{" "}
          <strong className="text-fg">
            {new Date(previousAt).toLocaleString()}
          </strong>
          . Submitting again will create a new entry.
        </div>
      )}

      {applicationDefaultsApplied && mode === "view" && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-3 mb-4 text-sm text-brand-800 flex items-start gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
          <div>
            <strong className="text-brand-900">Pre-filled from My Application.</strong>{" "}
            Your saved resume, video introduction, and elevator pitch have been imported. You can replace any of them by editing the field below.{" "}
            <a href="/profile/application" className="underline hover:no-underline">Open My Application</a>
          </div>
        </div>
      )}

      {schemaError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 mb-4 text-sm text-rose-700 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {schemaError}
        </div>
      )}

      <div className="bg-card border border-line rounded-2xl p-6 space-y-5">
        {mode === "edit" ? (
          <>
            <p className="text-xs text-muted -mt-1 mb-2">
              Edit, reorder, add, or remove fields. Click Save when done.
            </p>
            {draft.map((f, i) => (
              <FieldEditor
                key={f.id}
                field={f}
                index={i}
                total={draft.length}
                onPatch={patchField}
                onRemove={removeField}
                onMove={moveField}
              />
            ))}
            <AddFieldPanel onAdd={addField} />
          </>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            {/* Render loop with section-layout support. A section
                whose layout is "vertical-tabs" consumes every
                non-section field that follows it (up to the next
                section or schema end) and renders them in a
                left-tabs / right-content panel instead of the
                default stack. Everything else renders inline.
                showWhen visibility is checked per-field and per
                tab so chained hides cascade correctly. */}
            {(() => {
              const items: React.ReactNode[] = [];
              let i = 0;
              while (i < schema.length) {
                const f = schema[i];
                if (isSectionField(f) && f.layout === "vertical-tabs") {
                  // Collect the followers, respecting showWhen
                  // visibility so hidden sub-fields don't earn a
                  // tab entry they can't use.
                  const children: typeof schema = [];
                  let j = i + 1;
                  while (j < schema.length && !isSectionField(schema[j])) {
                    if (isFieldVisible(schema[j], schema, values)) {
                      children.push(schema[j]);
                    }
                    j++;
                  }
                  // Section itself can be conditional too — if hidden,
                  // skip the whole tab strip.
                  if (isFieldVisible(f, schema, values) && children.length > 0) {
                    items.push(
                      <VerticalTabsSection
                        key={f.id}
                        section={f}
                        fields={children}
                        slug={slug}
                        values={values}
                        onChange={(id, v) => setValues((cur) => ({ ...cur, [id]: v }))}
                      />,
                    );
                  }
                  i = j;
                  continue;
                }
                if (!isFieldVisible(f, schema, values)) { i++; continue; }
                items.push(
                  <FieldRender
                    key={f.id}
                    slug={slug}
                    field={f}
                    value={values[f.id]}
                    onChange={(v) => setValues((cur) => ({ ...cur, [f.id]: v }))}
                  />,
                );
                i++;
              }
              return items;
            })()}
            {submitError && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700 flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                {submitError}
              </div>
            )}
            {/* Submit + Clear pair. Clear is a destructive-ish action
                so we keep it visually quieter than Submit (ghost-style,
                small icon, single confirm prompt) — but always present
                next to it so a half-filled-then-abandoned draft is one
                click to recover from. */}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={submitting || !active}
                className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-medium py-2.5 px-4 rounded-lg transition-colors shadow-md shadow-brand-600/25 text-sm flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {submitting ? "Submitting…" : "Submit"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (submitting) return;
                  const ok = await confirmDialog({
                    title: "Clear every field on this form?",
                    description: "This wipes everything you've typed so far. It can't be undone — but the form's still here, so you can refill it.",
                    confirmLabel: "Clear form",
                    cancelLabel: "Keep what I've typed",
                    tone: "warning",
                  });
                  if (!ok) return;
                  setValues({});
                  setSubmitError(null);
                }}
                disabled={submitting}
                title="Clear every field — reset the form to blank"
                className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2.5 rounded-lg text-muted hover:text-fg hover:bg-elevated ring-1 ring-inset ring-line disabled:opacity-50 transition-colors"
              >
                <Eraser size={14} />
                Clear
              </button>
            </div>
          </form>
        )}
      </div>
      </div>

      {/* ConfirmDialog portal — only rendered while a confirmDialog()
          call is awaiting a response. See ConfirmDialog for the API. */}
      {confirmNode}
    </div>
  );
}

// ── Field renderers ────────────────────────────────────────────────────

/**
 * VerticalTabsSection — alternative layout for a SectionField whose
 * layout is "vertical-tabs". Renders the section header at the top,
 * then a two-column body: tab labels stacked on the left (one per
 * non-section follower), and the active tab's input on the right.
 *
 * Each tab's label comes from the underlying field's label. The
 * section header stays visible above the tab area so the section's
 * own label + hint context is intact.
 *
 * State is per-instance — the active tab is local. We don't sync
 * to URL or persist; the data stored is exactly the same as the
 * "default" layout, just reached via a different UI affordance.
 */
function VerticalTabsSection({
  section, fields, slug, values, onChange,
}: {
  section: FormField;
  fields: FormField[];
  slug: string;
  values: Record<string, string | string[]>;
  onChange: (id: string, v: string | string[]) => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const safeIdx = Math.min(activeIdx, Math.max(0, fields.length - 1));
  const active = fields[safeIdx];

  return (
    <div className="space-y-3 pt-2">
      <h3 className="text-sm font-semibold text-fg uppercase tracking-wider border-b border-line pb-2">
        {section.label}
      </h3>
      {section.hint && (
        <p className="text-xs text-subtle leading-relaxed -mt-1">{section.hint}</p>
      )}

      <div className="grid grid-cols-[160px_1fr] gap-4">
        {/* Tab strip — labels stacked vertically. Brand-tinted active
            row with a 2px brand-600 left bar (matches the active-link
            treatment in the sidebar). Each tab is keyboard-focusable
            so users navigating by Tab can drive the strip too. */}
        <nav role="tablist" aria-orientation="vertical" className="flex flex-col gap-0.5">
          {fields.map((f, i) => {
            const isActive = i === safeIdx;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${f.id}`}
                onClick={() => setActiveIdx(i)}
                className={cnTabClass(isActive)}
              >
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-brand-600"
                  />
                )}
                <span className="text-sm font-medium truncate">{f.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Active-tab content. We re-use FieldRender so each input
            renders exactly like its default-layout twin would. We
            hide FieldRender's own label since the tab strip already
            shows it — duplicating would feel cluttered in a tabs
            context — by passing a label-less clone of the field. */}
        <div
          id={`tabpanel-${active?.id}`}
          role="tabpanel"
          aria-labelledby={active?.id}
        >
          {active && (
            <FieldRender
              key={active.id}
              slug={slug}
              field={{ ...active, label: active.label } as FormField}
              value={values[active.id]}
              onChange={(v) => onChange(active.id, v)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function cnTabClass(active: boolean): string {
  const base =
    "relative text-left px-3 py-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60";
  return active
    ? `${base} bg-brand-50 text-brand-700`
    : `${base} text-muted hover:bg-raised hover:text-fg`;
}

function FieldRender({
  slug, field, value, onChange,
}: {
  slug: string;
  field: FormField;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
}) {
  if (isSectionField(field)) {
    return (
      <h3 className="text-sm font-semibold text-fg uppercase tracking-wider pt-2 first:pt-0 border-b border-line pb-2">
        {field.label}
      </h3>
    );
  }
  return (
    <div>
      <label className="block text-sm font-medium text-fg mb-1.5">
        {field.label}
        {field.required && <span className="text-rose-600 ml-0.5">*</span>}
      </label>
      {field.hint && <p className="text-xs text-subtle mb-2 leading-relaxed">{field.hint}</p>}
      {isMultiCheckboxField(field) ? (
        <MultiCheckboxInput
          field={field}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
        />
      ) : isFileField(field) ? (
        <FileInput
          slug={slug}
          field={field}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
        />
      ) : (
        <FieldInput
          field={field as InputField | ChoiceField}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
        />
      )}
    </div>
  );
}

function FieldInput({
  field, value, onChange,
}: {
  field: InputField | ChoiceField;
  value: string;
  onChange: (v: string) => void;
}) {
  const cls =
    "w-full bg-card-solid border border-line rounded-lg px-3 py-2 text-sm text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all";
  if (isInputField(field)) {
    if (field.type === "textarea") {
      const max = field.maxLength;
      const len = value.length;
      const over = max != null && len > max;
      return (
        <div>
          <textarea
            required={field.required}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={6}
            placeholder={field.placeholder}
            className={cls}
          />
          {max != null && (
            <p className={`mt-1 text-[11px] ${over ? "text-rose-600" : "text-subtle"}`}>
              {len.toLocaleString()} / {max.toLocaleString()} characters
            </p>
          )}
        </div>
      );
    }
    // Render "url" fields as plain text — most users paste urls without
    // a scheme (e.g. linkedin.com/...) and the browser's url validator
    // rejects those. We don't actually parse, so just accept anything.
    const inputType = field.type === "url" ? "text" : field.type;
    return (
      <input
        type={inputType}
        required={field.required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className={cls}
      />
    );
  }
  // Choice fields
  if (field.type === "select") {
    return (
      <select
        required={field.required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cls}
      >
        <option value="">Select…</option>
        {field.options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }
  // radio (checkbox treated as radio for now — single-choice)
  return (
    <div className="space-y-1.5">
      {field.options.map((o) => (
        <label
          key={o}
          className="flex items-start gap-2.5 px-3 py-2 rounded-lg border border-line hover:bg-elevated cursor-pointer transition-colors"
        >
          <input
            type="radio"
            name={field.id}
            value={o}
            required={field.required}
            checked={value === o}
            onChange={(e) => onChange(e.target.value)}
            className="mt-0.5 accent-brand-600"
          />
          <span className="text-sm text-fg">{o}</span>
        </label>
      ))}
    </div>
  );
}

// ── Multi-checkbox input ──────────────────────────────────────────────

function MultiCheckboxInput({
  field, value, onChange,
}: {
  field: MultiCheckboxField;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(opt: string, on: boolean) {
    if (on) onChange(value.includes(opt) ? value : [...value, opt]);
    else onChange(value.filter((v) => v !== opt));
  }
  return (
    <div className="space-y-1.5">
      {field.options.map((o) => {
        const checked = value.includes(o);
        return (
          <label
            key={o}
            className="flex items-start gap-2.5 px-3 py-2 rounded-lg border border-line hover:bg-elevated cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => toggle(o, e.target.checked)}
              className="mt-0.5 accent-brand-600"
            />
            <span className="text-sm text-fg">{o}</span>
          </label>
        );
      })}
    </div>
  );
}

// ── File input ────────────────────────────────────────────────────────

function FileInput({
  slug, field, value, onChange,
}: {
  slug: string;
  field: FileField;
  value: string;
  onChange: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(
    value ? value.split("/").pop()?.replace(/^\d+_/, "") ?? "Uploaded file" : null
  );

  // Re-sync fileName when value changes from outside the component —
  // e.g. DemoFiller injecting placeholder R2 URLs into resume /
  // support_letter / supporting_document fields. Without this the
  // input still says "no file selected" even though the form has
  // a valid URL bound.
  useEffect(() => {
    if (!value) { setFileName(null); return; }
    const display = value.split("/").pop()?.replace(/^\d+_/, "") ?? "Uploaded file";
    setFileName(display);
  }, [value]);

  const maxMB = Math.round((field.maxBytes ?? 10 * 1024 * 1024) / 1_048_576);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("fieldId", field.id);
      fd.append("file", file);
      const res = await fetch(`/api/forms/${slug}/upload`, { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as {
        url?: string; error?: string; name?: string;
      };
      if (!res.ok || !j.url) {
        setError(j.error ?? "Upload failed.");
        return;
      }
      onChange(j.url);
      setFileName(j.name ?? file.name);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function clear() {
    onChange("");
    setFileName(null);
    setError(null);
  }

  return (
    <div>
      {/* Optional downloadable template — surfaced as a small affordance
          above the upload control whenever the schema sets templateUrl
          (e.g. the BioHubNet supervisor support letter on talent-app).
          Shown whether or not a file is already attached so the user
          can still re-download for reference. */}
      {field.templateUrl && (
        <a
          href={field.templateUrl}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800 hover:underline"
        >
          <Paperclip size={11} />
          {field.templateLabel ?? "Download template"}
        </a>
      )}
      {value ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-line bg-card-solid text-sm">
          <Paperclip size={14} className="text-brand-600 shrink-0" />
          <a
            href={value}
            target="_blank"
            rel="noreferrer noopener"
            className="flex-1 truncate text-fg hover:text-brand-700 underline-offset-2 hover:underline"
          >
            {fileName ?? "Uploaded file"}
          </a>
          <button
            type="button"
            onClick={clear}
            className="text-xs text-subtle hover:text-rose-600 transition-colors"
          >
            Replace
          </button>
        </div>
      ) : (
        <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-line cursor-pointer hover:bg-elevated text-sm text-muted transition-colors">
          {uploading ? (
            <Loader2 size={14} className="animate-spin text-brand-600" />
          ) : (
            <Upload size={14} className="text-brand-600" />
          )}
          <span>{uploading ? "Uploading…" : `Choose file (max ${maxMB} MB${field.accept ? `, ${field.accept}` : ""})`}</span>
          <input
            ref={inputRef}
            type="file"
            accept={field.accept}
            onChange={onPick}
            disabled={uploading}
            className="hidden"
          />
        </label>
      )}
      {error && (
        <p className="mt-1 text-[11px] text-rose-600 flex items-center gap-1">
          <AlertCircle size={11} /> {error}
        </p>
      )}
    </div>
  );
}

// ── Edit-mode controls ────────────────────────────────────────────────

function FieldEditor({
  field, index, total, onPatch, onRemove, onMove,
}: {
  field: FormField;
  index: number;
  total: number;
  onPatch: (id: string, patch: Partial<FormField>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}) {
  if (isSectionField(field)) {
    return (
      <div className="border-b border-line pb-2 pt-2 first:pt-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-[10px] uppercase tracking-[0.18em] text-subtle">
            Section heading
          </p>
          <FieldOrderRemove
            index={index}
            total={total}
            onMove={(d) => onMove(field.id, d)}
            onRemove={() => onRemove(field.id)}
          />
        </div>
        <input
          value={field.label}
          onChange={(e) => onPatch(field.id, { label: e.target.value })}
          className="w-full text-sm font-semibold text-fg bg-transparent border-b border-line focus:outline-none focus:border-brand-500 py-1"
        />
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-line p-3 space-y-2.5 bg-elevated/30">
      <div className="flex items-center gap-2">
        <p className="text-[10px] uppercase tracking-[0.18em] text-subtle">
          {field.type}
        </p>
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) =>
              onPatch(field.id, { required: e.target.checked } as Partial<FormField>)
            }
            className="accent-brand-600"
          />
          Required
        </label>
        <FieldOrderRemove
          index={index}
          total={total}
          onMove={(d) => onMove(field.id, d)}
          onRemove={() => onRemove(field.id)}
        />
      </div>
      <input
        value={field.label}
        onChange={(e) => onPatch(field.id, { label: e.target.value })}
        className="w-full bg-card-solid border border-line rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
        placeholder="Label"
      />
      <input
        value={field.hint ?? ""}
        onChange={(e) =>
          onPatch(field.id, { hint: e.target.value || undefined } as Partial<FormField>)
        }
        className="w-full bg-card-solid border border-line rounded-lg px-3 py-2 text-xs text-muted focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
        placeholder="Hint (optional)"
      />
      {isChoiceField(field) && (
        <ChoiceOptionsEditor
          value={field.options}
          onChange={(opts) =>
            onPatch(field.id, { options: opts } as Partial<FormField>)
          }
        />
      )}
    </div>
  );
}

function ChoiceOptionsEditor({
  value, onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] text-subtle mb-1.5">
        Options
      </p>
      <div className="space-y-1.5">
        {value.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={opt}
              onChange={(e) => {
                const next = [...value];
                next[i] = e.target.value;
                onChange(next);
              }}
              className="flex-1 bg-card-solid border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              disabled={value.length <= 1}
              className="text-subtle hover:text-rose-600 disabled:opacity-30 disabled:hover:text-subtle p-1"
              aria-label="Remove option"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...value, ""])}
          className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1"
        >
          <Plus size={12} /> Add option
        </button>
      </div>
    </div>
  );
}

function FieldOrderRemove({
  index, total, onMove, onRemove,
}: {
  index: number;
  total: number;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 text-subtle">
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={index === 0}
        aria-label="Move up"
        className="p-1 rounded hover:bg-elevated hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-subtle"
      >
        <ChevronUp size={13} />
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={index === total - 1}
        aria-label="Move down"
        className="p-1 rounded hover:bg-elevated hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-subtle"
      >
        <ChevronDown size={13} />
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove field"
        className="p-1 rounded hover:bg-rose-50 hover:text-rose-600"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// Subset of FormField["type"] that the inline add-field UI exposes.
// multicheckbox / file / date / select / tel are only seedable via the
// registry today (more involved schemas — accept, maxBytes, options).
type AddableType = "text" | "textarea" | "email" | "url" | "radio" | "section";

const ADD_TYPES: { type: AddableType; label: string; Icon: typeof Type }[] = [
  { type: "text",     label: "Text",       Icon: Type },
  { type: "textarea", label: "Long text",  Icon: AlignLeft },
  { type: "email",    label: "Email",      Icon: Mail },
  { type: "url",      label: "URL",        Icon: LinkIcon },
  { type: "radio",    label: "Choice",     Icon: RadioIcon },
  { type: "section",  label: "Section",    Icon: Heading },
];

function AddFieldPanel({ onAdd }: { onAdd: (t: AddableType) => void }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-subtle mb-2">
        Add a field
      </p>
      <div className="flex flex-wrap gap-1.5">
        {ADD_TYPES.map((a) => {
          const Icon = a.Icon;
          return (
            <button
              key={a.type}
              type="button"
              onClick={() => onAdd(a.type)}
              className="text-xs px-3 py-1.5 rounded-lg border border-line bg-card-solid hover:border-brand-300 hover:text-brand-700 text-muted transition-colors inline-flex items-center gap-1.5"
            >
              <Icon size={12} /> {a.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
