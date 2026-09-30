"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Plus, Save, Trash2, Loader2, AlertCircle, GripVertical, X,
} from "lucide-react";

/**
 * Custom-questions manager — admin UI for adding / editing / deleting
 * the per-event registration questions that show up on the public
 * registration form below the standard fields.
 *
 * Five widget kinds supported:
 *   • text        — single-line input
 *   • longtext    — textarea
 *   • select      — radio cards (options[])
 *   • multiselect — checkbox group (options[])
 *   • checkbox    — single yes/no acknowledgement
 *
 * No drag-and-drop reorder yet; displayOrder is editable via the
 * up/down arrows (keeps the component dependency-free).
 */

export interface QuestionRow {
  id: string;
  key: string;
  label: string;
  hint: string | null;
  kind: "text" | "longtext" | "select" | "multiselect" | "checkbox";
  options: Array<{ value: string; label: string }> | null;
  required: boolean;
  displayOrder: number;
}

const KIND_LABELS = {
  text:        "Short text",
  longtext:    "Long text",
  select:      "Single choice (radio)",
  multiselect: "Multiple choice (checkboxes)",
  checkbox:    "Yes / no",
} as const;

export function CustomQuestionsManager({
  slug,
  initial,
}: {
  slug: string;
  initial: QuestionRow[];
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState<QuestionRow[]>(initial);
  const [editing, setEditing] = useState<QuestionRow | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  function refresh() {
    router.refresh();
  }

  async function deleteQuestion(id: string, label: string) {
    if (!(await confirmDialog({
      title: `Delete "${label}"?`,
      description: "Any answers from existing registrations will also be deleted. This can't be undone.",
      confirmLabel: "Delete",
      tone: "destructive",
    }))) return;
    const res = await fetch(`/api/admin/events/${slug}/questions/${id}`, { method: "DELETE" });
    if (res.ok) {
      setQuestions((qs) => qs.filter((q) => q.id !== id));
      refresh();
    } else {
      const json = await res.json().catch(() => ({}));
      await confirmDialog({ title: `Failed to delete: ${json.error ?? res.status}`, acknowledgeOnly: true });
    }
  }

  if (creatingNew || editing) {
    return (
      <QuestionEditor
        slug={slug}
        initial={editing}
        onSave={(saved) => {
          if (editing) {
            setQuestions((qs) => qs.map((q) => (q.id === saved.id ? saved : q)));
          } else {
            setQuestions((qs) => [...qs, saved]);
          }
          setEditing(null);
          setCreatingNew(false);
          refresh();
        }}
        onCancel={() => {
          setEditing(null);
          setCreatingNew(false);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {confirmNode}
      {questions.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card p-8 text-center">
          <p className="text-sm text-muted">
            No custom questions yet. Add one to ask attendees for extra info on the registration form.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {questions.map((q) => (
            <li
              key={q.id}
              className="rounded-xl border border-line bg-card p-4 flex items-start gap-3"
            >
              <GripVertical size={14} className="text-fg-subtle mt-1 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <p className="text-sm font-bold text-fg">{q.label}</p>
                  {q.required && (
                    <span className="text-[10px] uppercase tracking-[0.16em] font-bold text-rose-700 bg-rose-50 ring-1 ring-inset ring-rose-200 px-1.5 py-0.5 rounded">
                      Required
                    </span>
                  )}
                  <span className="text-[10px] uppercase tracking-[0.16em] font-bold text-fg-subtle bg-elevated px-1.5 py-0.5 rounded">
                    {KIND_LABELS[q.kind]}
                  </span>
                </div>
                <p className="text-xs text-fg-subtle font-mono mt-0.5">key: {q.key}</p>
                {q.hint && <p className="text-xs text-muted mt-1.5">{q.hint}</p>}
                {q.options && q.options.length > 0 && (
                  <p className="text-xs text-muted mt-1.5">
                    Options: {q.options.map((o) => o.label).join(", ")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditing(q)}
                  className="px-2.5 py-1 rounded-md text-xs font-semibold text-fg-muted hover:text-fg hover:bg-elevated"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => deleteQuestion(q.id, q.label)}
                  className="px-2.5 py-1 rounded-md text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  <Trash2 size={12} className="inline mr-1" />
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setCreatingNew(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 transition-colors"
      >
        <Plus size={14} />
        Add a question
      </button>
    </div>
  );
}

function QuestionEditor({
  slug,
  initial,
  onSave,
  onCancel,
}: {
  slug: string;
  initial: QuestionRow | null;
  onSave: (q: QuestionRow) => void;
  onCancel: () => void;
}) {
  const [key, setKey]         = useState(initial?.key ?? "");
  const [label, setLabel]     = useState(initial?.label ?? "");
  const [hint, setHint]       = useState(initial?.hint ?? "");
  const [kind, setKind]       = useState<QuestionRow["kind"]>(initial?.kind ?? "text");
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>(
    initial?.options ?? [],
  );
  const [required, setRequired] = useState(initial?.required ?? false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const needsOptions = kind === "select" || kind === "multiselect";
  const slugifiedKey = key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const keyValid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugifiedKey) && slugifiedKey.length >= 2;
  const labelValid = label.trim().length > 0;
  const optionsValid = !needsOptions || options.filter((o) => o.value && o.label).length > 0;
  const canSubmit = keyValid && labelValid && optionsValid && !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    const body = {
      key: slugifiedKey,
      label: label.trim(),
      hint: hint.trim() || null,
      kind,
      options: needsOptions ? options.filter((o) => o.value && o.label) : null,
      required,
    };
    const url = initial
      ? `/api/admin/events/${slug}/questions/${initial.id}`
      : `/api/admin/events/${slug}/questions`;
    const method = initial ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      setError(json.error || `Failed (${res.status})`);
      setSaving(false);
      return;
    }
    onSave(json.question);
  }

  return (
    <div className="rounded-2xl border border-brand-200 bg-card p-5 space-y-4 surface-shadow">
      <header>
        <h3 className="font-bold text-fg">
          {initial ? `Edit "${initial.label}"` : "New question"}
        </h3>
      </header>

      <Field label="Question text" required>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="What is your t-shirt size?"
          className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm"
          required
        />
      </Field>

      <Field
        label="Internal key"
        required
        hint={`Used in CSV exports — kebab-case. Current: ${slugifiedKey || "<key>"}`}
      >
        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="tshirt-size"
          className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm font-mono"
          required
        />
      </Field>

      <Field label="Hint" hint="Optional helper text shown below the input.">
        <input
          type="text"
          value={hint ?? ""}
          onChange={(e) => setHint(e.target.value)}
          placeholder="We'll have a few extras at registration."
          className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm"
        />
      </Field>

      <Field label="Widget kind">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as QuestionRow["kind"])}
          className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm"
        >
          {Object.entries(KIND_LABELS).map(([k, lbl]) => (
            <option key={k} value={k}>{lbl}</option>
          ))}
        </select>
      </Field>

      {needsOptions && (
        <Field label="Options" required hint="Add the choices the user can pick from.">
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={opt.label}
                  onChange={(e) => {
                    const next = [...options];
                    next[i] = { label: e.target.value, value: opt.value || slugify(e.target.value) };
                    setOptions(next);
                  }}
                  placeholder="Label"
                  className="flex-1 bg-background border border-line rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={opt.value}
                  onChange={(e) => {
                    const next = [...options];
                    next[i] = { ...opt, value: e.target.value };
                    setOptions(next);
                  }}
                  placeholder="value"
                  className="w-32 bg-background border border-line rounded-lg px-3 py-2 text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={() => setOptions(options.filter((_, j) => j !== i))}
                  className="p-1.5 rounded-md text-fg-subtle hover:text-rose-700 hover:bg-rose-50"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setOptions([...options, { value: "", label: "" }])}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline"
            >
              <Plus size={12} /> Add option
            </button>
          </div>
        </Field>
      )}

      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
        />
        <span className="text-sm">
          <span className="font-semibold text-fg">Required</span>
          <span className="text-xs text-muted ml-2">Block submission until this is answered</span>
        </span>
      </label>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 inline-flex items-center gap-2">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-line">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-fg-muted hover:text-fg hover:bg-elevated"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 disabled:bg-elevated disabled:text-subtle disabled:cursor-not-allowed transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {initial ? "Save changes" : "Create question"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label, required, hint, children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
        {label}
        {required && <span className="text-rose-700 normal-case tracking-normal">*</span>}
      </div>
      {children}
      {hint && <p className="text-xs text-subtle mt-1.5">{hint}</p>}
    </label>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
