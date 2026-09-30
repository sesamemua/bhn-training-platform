"use client";
/**
 * Page editor — single client form for /admin/pages/new and
 * /admin/pages/[id]/edit. Talks to /api/admin/pages and
 * /api/admin/pages/[id].
 *
 * Layout: two columns on lg+ (form left, live markdown preview
 * right), stacked on smaller screens. The preview re-renders on
 * every keystroke via react-markdown — no debounce; the body is
 * usually short enough that perf isn't a concern.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Save, Trash2, Loader2 } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  PAGE_AUDIENCES,
  PAGE_AUDIENCE_LABEL,
  PAGE_STATUSES,
  type PageAudience,
  type PageStatus,
} from "@/lib/cms/audience";

interface InitialPage {
  id?: string;
  slug: string;
  title: string;
  body: string;
  excerpt: string | null;
  status: PageStatus;
  audience: PageAudience;
}

interface Props {
  initial: InitialPage;
  mode: "create" | "edit";
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function PageEditor({ initial, mode }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [body, setBody] = useState(initial.body);
  const [excerpt, setExcerpt] = useState(initial.excerpt ?? "");
  const [status, setStatus] = useState<PageStatus>(initial.status);
  const [audience, setAudience] = useState<PageAudience>(initial.audience);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  function onTitleChange(v: string) {
    setTitle(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  async function save() {
    setError(null);
    if (!title.trim()) { setError("Title is required."); return; }
    if (!slug.trim()) { setError("Slug is required."); return; }
    if (!body.trim()) { setError("Body is required."); return; }

    setSaving(true);
    try {
      const url = mode === "create" ? "/api/admin/pages" : `/api/admin/pages/${initial.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          slug: slug.trim(),
          body,
          excerpt: excerpt.trim() || null,
          status,
          audience,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Save failed.");
        return;
      }
      const j = await res.json();
      if (mode === "create" && j.id) {
        router.push(`/admin/pages/${j.id}/edit`);
        router.refresh();
      } else {
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!initial.id) return;
    if (!(await confirmDialog({ title: `Delete "${title}"?`, description: "This can't be undone.", confirmLabel: "Delete", tone: "destructive" }))) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/pages/${initial.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/admin/pages");
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {confirmNode}
      {/* ─── Form ─── */}
      <div className="space-y-5">
        <Field label="Title">
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="w-full bg-card border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-300 rounded-lg"
            placeholder="Page title"
          />
        </Field>

        <Field
          label="Slug"
          hint="The URL this page lives at: /p/[slug]"
        >
          <input
            type="text"
            value={slug}
            onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true); }}
            className="w-full bg-card border border-line px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-300 rounded-lg"
            placeholder="my-page"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as PageStatus)}
              className="w-full bg-card border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-300 rounded-lg"
            >
              {PAGE_STATUSES.map((s) => (
                <option key={s} value={s}>{s === "published" ? "Published" : "Draft"}</option>
              ))}
            </select>
          </Field>

          <Field label="Audience">
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as PageAudience)}
              className="w-full bg-card border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-300 rounded-lg"
            >
              {PAGE_AUDIENCES.map((a) => (
                <option key={a} value={a}>{PAGE_AUDIENCE_LABEL[a]}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Excerpt"
          hint="Optional one-liner shown on listings. ~140 chars."
        >
          <input
            type="text"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            maxLength={200}
            className="w-full bg-card border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-300 rounded-lg"
            placeholder="Short preview text…"
          />
        </Field>

        <Field
          label="Body (markdown)"
          hint="Supports GitHub-flavoured markdown — headings, lists, links, code, tables."
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={20}
            className="w-full bg-card border border-line px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-300 rounded-lg"
            placeholder={"# Hello world\n\nWrite your page body here…"}
          />
        </Field>

        {error && (
          <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {mode === "create" ? "Create page" : "Save changes"}
          </button>
          {mode === "edit" && (
            <button
              type="button"
              onClick={remove}
              disabled={saving}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-700 hover:text-rose-900 px-3 py-2 disabled:opacity-60"
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* ─── Preview ─── */}
      <div className="border border-line bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-line text-[10px] uppercase tracking-[0.22em] font-bold text-fg-subtle">
          Preview · /p/{slug || "…"}
        </div>
        <div className="px-5 py-6 prose prose-sm max-w-none">
          <h1 className="!mt-0 text-2xl font-bold text-fg tracking-tight">{title || "Untitled"}</h1>
          {excerpt && <p className="text-sm text-fg-muted italic">{excerpt}</p>}
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body || "*(empty body)*"}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.22em] font-bold text-fg-subtle mb-1.5">
        {label}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-fg-muted mt-1">{hint}</span>}
    </label>
  );
}
