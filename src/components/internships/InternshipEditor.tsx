"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles, Save, Loader2, AlertCircle, Trash2, X, Plus, Upload, Paperclip,
} from "lucide-react";
import { DemoFiller } from "@/components/demo/DemoFiller";
import { POSTING_PRESETS } from "@/lib/demo/presets";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

export interface PostingValues {
  companyName: string;
  website: string;
  title: string;
  duration: string;
  hours: string;
  location: string;
  type: string;
  compensation: string;
  deadline: string;          // YYYY-MM-DD or ""
  keySkills: string[];
  positionDetails: string;
  status: "active" | "closed" | "draft";
  /** Apply-direct contact. Required end-state: contactEmail must be
   *  set before the trainee detail page can render the apply CTA;
   *  the form warns rather than blocks so existing draft postings
   *  without contact info don't suddenly become uneditable. */
  contactEmail: string;
  contactName: string;
  contactPhone: string;
}

const EMPTY: PostingValues = {
  companyName: "", website: "", title: "", duration: "", hours: "",
  location: "", type: "", compensation: "", deadline: "",
  keySkills: [], positionDetails: "", status: "active",
  contactEmail: "", contactName: "", contactPhone: "",
};

export function InternshipEditor({
  mode, postingId, initial,
}: {
  mode: "new" | "edit";
  postingId?: string;
  initial?: Partial<PostingValues>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<PostingValues>({ ...EMPTY, ...initial });
  const [pasteText, setPasteText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseSuccess, setParseSuccess] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function set<K extends keyof PostingValues>(k: K, v: PostingValues[K]) {
    setValues((cur) => ({ ...cur, [k]: v }));
  }

  async function runParse(payload: { text?: string; file?: File }) {
    setParsing(true);
    setParseError(null);
    setParseSuccess(false);
    try {
      const init: RequestInit = payload.file
        ? { method: "POST", body: (() => { const fd = new FormData(); fd.append("file", payload.file!); return fd; })() }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: payload.text }),
          };
      const res = await fetch("/api/admin/internships/parse", init);
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean; posting?: Partial<PostingValues>; error?: string; raw?: string;
      };
      if (!res.ok || !j.posting) {
        const detail = j.raw ? ` (model said: ${j.raw.slice(0, 200)}…)` : "";
        setParseError((j.error ?? "Couldn't parse.") + detail);
        return;
      }
      setValues((cur) => ({
        ...cur,
        ...j.posting,
        keySkills: j.posting!.keySkills?.slice(0, 5) ?? [],
      } as PostingValues));
      setParseSuccess(true);
    } finally {
      setParsing(false);
      setPendingFile(null);
    }
  }

  async function parseFromPaste() {
    if (pasteText.trim().length < 30) {
      setParseError("Paste at least a few sentences, or drop a file.");
      return;
    }
    await runParse({ text: pasteText });
  }

  async function handleFile(f: File) {
    // Plain-text files: read in-browser and reuse the text path. Saves
    // a round trip and the AI quota for trivial cases.
    if (
      f.type === "text/plain" ||
      f.type === "text/markdown" ||
      f.name.match(/\.(txt|md|markdown)$/i)
    ) {
      const text = await f.text();
      setPasteText(text);
      await runParse({ text });
      return;
    }
    setPendingFile(f);
    await runParse({ file: f });
  }

  function onDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDropOver(true);
    }
  }
  function onDragLeave() { setDropOver(false); }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDropOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }
  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function save() {
    if (!values.companyName.trim() || !values.title.trim() || !values.positionDetails.trim()) {
      setSaveError("Company name, title, and position details are required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const url = mode === "new"
        ? "/api/admin/internships"
        : `/api/admin/internships/${postingId}`;
      const res = await fetch(url, {
        method: mode === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean; posting?: { id: string }; error?: string;
      };
      if (!res.ok) {
        setSaveError(j.error ?? "Save failed.");
        return;
      }
      const id = j.posting?.id ?? postingId;
      router.push(id ? `/internships/${id}` : "/internships");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function destroy() {
    if (!postingId) return;
    if (!(await confirmDialog({ title: "Delete this posting?", description: "This cannot be undone.", confirmLabel: "Delete", tone: "destructive" }))) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/internships/${postingId}`, { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setSaveError(j.error ?? "Delete failed.");
        return;
      }
      router.push("/internships");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  function addSkill() {
    if (values.keySkills.length >= 5) return;
    set("keySkills", [...values.keySkills, ""]);
  }
  function setSkill(i: number, v: string) {
    const next = [...values.keySkills];
    next[i] = v;
    set("keySkills", next);
  }
  function removeSkill(i: number) {
    set("keySkills", values.keySkills.filter((_, j) => j !== i));
  }

  const ipt =
    "w-full bg-card-solid border border-line rounded-lg px-3 py-2 text-sm text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {confirmNode}
      {/* DemoFiller — admin-only sample preset filler */}
      <DemoFiller
        visible={true}
        presets={POSTING_PRESETS}
        onFill={(preset) => {
          setValues((cur) => ({
            ...cur,
            ...(preset.companyName !== undefined ? { companyName: preset.companyName } : {}),
            ...(preset.website !== undefined     ? { website: preset.website } : {}),
            ...(preset.title !== undefined       ? { title: preset.title } : {}),
            ...(preset.duration !== undefined    ? { duration: preset.duration } : {}),
            ...(preset.hours !== undefined       ? { hours: preset.hours } : {}),
            ...(preset.location !== undefined    ? { location: preset.location } : {}),
            ...(preset.type !== undefined        ? { type: preset.type } : {}),
            ...(preset.compensation !== undefined? { compensation: preset.compensation } : {}),
            ...(preset.deadline !== undefined    ? { deadline: preset.deadline } : {}),
            ...(preset.keySkills !== undefined   ? { keySkills: preset.keySkills } : {}),
            ...(preset.positionDetails !== undefined ? { positionDetails: preset.positionDetails } : {}),
            ...(preset.status !== undefined ? { status: preset.status as PostingValues["status"] } : {}),
          }));
        }}
        hint="admin-only — sample posting"
      />

      {/* AI paste-and-parse — only on new */}
      {mode === "new" && (
        <section className="bg-card border border-line rounded-2xl p-6">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
              <Sparkles size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-fg">Drop a file or paste the job description</h2>
              <p className="text-xs text-muted mt-0.5">
                Drag in a PDF, DOCX, image, or text file — or paste from any source. The AI extracts company, role, dates, skills, and details. You review and save.
              </p>
            </div>
          </div>

          {/* Drop zone wraps the textarea + browse pill. preventDefault on
              dragover/drop is critical — without it, the browser opens the
              file in a new tab. */}
          <div
            onDragOver={onDragOver}
            onDragEnter={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`relative rounded-xl border-2 border-dashed transition-colors ${
              dropOver
                ? "border-brand-400 bg-brand-50/50"
                : "border-line bg-elevated/30"
            }`}
          >
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={8}
              placeholder="Paste anything — an emailed posting, copy from a PDF, an internal description… or drag a file in."
              className={`w-full bg-transparent border-0 rounded-xl px-3 py-3 text-sm text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-all`}
            />

            {/* Drop overlay — visible while dragging a file */}
            {dropOver && (
              <div className="absolute inset-0 rounded-xl bg-brand-50/85 backdrop-blur-sm flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <Upload size={28} className="mx-auto text-brand-600 mb-1" />
                  <p className="text-sm font-semibold text-brand-700">Drop to parse with AI</p>
                  <p className="text-xs text-brand-700/80 mt-0.5">PDF, DOCX, image, or text · up to 20 MB</p>
                </div>
              </div>
            )}
          </div>

          {pendingFile && (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted">
              <Paperclip size={12} className="text-brand-600" />
              <span className="truncate">{pendingFile.name}</span>
              <span className="text-subtle">· {(pendingFile.size / 1024).toFixed(0)} KB</span>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 text-[11px] text-subtle">
              <span>{pasteText.length.toLocaleString()} characters</span>
              <span aria-hidden>·</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-brand-700 hover:underline inline-flex items-center gap-1"
              >
                <Upload size={11} /> Browse for a file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,image/png,image/jpeg,image/webp,text/plain,text/markdown"
                onChange={onPickFile}
                className="hidden"
              />
            </div>
            <button
              type="button"
              onClick={parseFromPaste}
              disabled={parsing || pasteText.trim().length < 30}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-medium text-sm px-4 py-2 rounded-lg shadow-sm shadow-brand-600/25 transition-colors"
            >
              {parsing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {parsing ? "Parsing…" : "Parse with AI"}
            </button>
          </div>

          {parseError && (
            <div className="mt-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertCircle size={13} className="mt-0.5 shrink-0" /> {parseError}
            </div>
          )}
          {parseSuccess && !parseError && (
            <div className="mt-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg px-3 py-2">
              Parsed — review the fields below and edit as needed before saving.
            </div>
          )}
        </section>
      )}

      {/* Form */}
      <section className="bg-card border border-line rounded-2xl p-6 space-y-5">
        <h2 className="font-semibold text-fg">{mode === "new" ? "Posting" : "Edit posting"}</h2>

        <Group title="Employer">
          <Field label="Company name" required>
            <input className={ipt} value={values.companyName} onChange={(e) => set("companyName", e.target.value)} />
          </Field>
          <Field label="Website">
            <input className={ipt} value={values.website} onChange={(e) => set("website", e.target.value)} placeholder="example.com" />
          </Field>
        </Group>

        <Group title="Apply-direct contact">
          <Field label="Contact email" full required hint="Trainees email this address with their pitch + resume URL.">
            <input
              type="email"
              className={ipt}
              value={values.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
              placeholder="careers@example.com"
            />
          </Field>
          <Field label="Contact name">
            <input
              className={ipt}
              value={values.contactName}
              onChange={(e) => set("contactName", e.target.value)}
              placeholder="Anita Patel, HR"
            />
          </Field>
          <Field label="Contact phone">
            <input
              className={ipt}
              value={values.contactPhone}
              onChange={(e) => set("contactPhone", e.target.value)}
              placeholder="+1 (905) 555-0142"
            />
          </Field>
        </Group>

        <Group title="Position">
          <Field label="Title" full required>
            <input className={ipt} value={values.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field label="Duration">
            <input className={ipt} value={values.duration} onChange={(e) => set("duration", e.target.value)} placeholder="4 months" />
          </Field>
          <Field label="Hours">
            <input className={ipt} value={values.hours} onChange={(e) => set("hours", e.target.value)} placeholder="Full-time, 40h/week" />
          </Field>
          <Field label="Location">
            <input className={ipt} value={values.location} onChange={(e) => set("location", e.target.value)} placeholder="Toronto, ON" />
          </Field>
          <Field label="Type">
            <input className={ipt} value={values.type} onChange={(e) => set("type", e.target.value)} placeholder="Internship / Co-op" />
          </Field>
          <Field label="Compensation">
            <input className={ipt} value={values.compensation} onChange={(e) => set("compensation", e.target.value)} placeholder="$25/hr, Paid, Unpaid…" />
          </Field>
          <Field label="Deadline">
            <input type="date" className={ipt} value={values.deadline} onChange={(e) => set("deadline", e.target.value)} />
          </Field>
        </Group>

        <Group title="Key skills (up to 5)">
          <div className="col-span-full space-y-2">
            {values.keySkills.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className={ipt}
                  value={s}
                  onChange={(e) => setSkill(i, e.target.value)}
                  placeholder={`Skill ${i + 1}`}
                />
                <button
                  type="button"
                  onClick={() => removeSkill(i)}
                  className="text-subtle hover:text-rose-600 p-1.5"
                  aria-label="Remove"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {values.keySkills.length < 5 && (
              <button
                type="button"
                onClick={addSkill}
                className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1"
              >
                <Plus size={12} /> Add skill
              </button>
            )}
          </div>
        </Group>

        <Group title="Position details">
          <div className="col-span-full">
            <textarea
              className={ipt}
              value={values.positionDetails}
              onChange={(e) => set("positionDetails", e.target.value)}
              rows={10}
              placeholder="Multi-paragraph description. Will display with paragraph breaks preserved."
            />
          </div>
        </Group>

        <Group title="Status">
          <div className="col-span-full flex gap-2">
            {(["active", "draft", "closed"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set("status", s)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  values.status === s
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-card text-muted border-line hover:border-line-strong"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </Group>
      </section>

      {saveError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {saveError}
        </div>
      )}

      <div className="flex items-center gap-2 justify-end">
        {mode === "edit" && (
          <button
            type="button"
            onClick={destroy}
            disabled={deleting || saving}
            className="inline-flex items-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-sm font-medium px-4 py-2 rounded-lg border border-rose-200 disabled:opacity-50 mr-auto"
          >
            <Trash2 size={14} /> {deleting ? "Deleting…" : "Delete posting"}
          </button>
        )}
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-muted hover:text-fg px-4 py-2 rounded-lg"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold text-sm px-5 py-2 rounded-lg shadow-md shadow-brand-600/25 transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "Saving…" : mode === "new" ? "Publish posting" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-subtle mb-3">{title}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Field({
  label, required, full, hint, children,
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${full ? "col-span-full" : ""}`}>
      <span className="block text-xs font-medium text-muted mb-1.5">
        {label}
        {required && <span className="text-rose-600 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-subtle mt-1">{hint}</span>}
    </label>
  );
}
