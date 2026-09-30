"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2 } from "lucide-react";
import { COURSE_TOPICS, COURSE_DELIVERY, COURSE_PROVIDERS } from "@/lib/courses/filters";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

/**
 * "New Course" modal. Topic / Delivery / Provider are managed inline
 * here — admins can add a new option (saves to the canonical list at
 * /admin/course-filters) or remove an existing one without leaving
 * the dialog. The text input itself accepts any value via input +
 * datalist; saving it as an option just promotes it to the canonical
 * vocabulary so it shows up everywhere as a suggestion.
 */
type FilterType = "topic" | "delivery" | "provider";
interface FilterOpt { id: string; type: string; value: string }

export function NewCourseButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    courseType: "scorm",
    passingScore: 80,
    topic: "",
    delivery: "",
    provider: "",
    isSpecial: false,
  });
  const [loading, setLoading] = useState(false);

  // Live filter-option list — sourced from /api/admin/courses/filter-options
  // on dialog open, falls back to the static seed lists if the fetch
  // fails (e.g. the user isn't an admin and can't read the endpoint).
  const [topics, setTopics]       = useState<FilterOpt[]>([]);
  const [deliveries, setDeliveries] = useState<FilterOpt[]>([]);
  const [providers, setProviders] = useState<FilterOpt[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  useEffect(() => {
    if (!open || loaded) return;
    fetch("/api/admin/courses/filter-options")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((j: { options: FilterOpt[] }) => {
        const opts = j.options ?? [];
        setTopics(opts.filter((o) => o.type === "topic"));
        setDeliveries(opts.filter((o) => o.type === "delivery"));
        setProviders(opts.filter((o) => o.type === "provider"));
        setLoaded(true);
      })
      .catch(() => {
        // Fallback: synthesize opts from the static seed lists so the
        // datalist still works even when the user can't manage options.
        const fab = (type: FilterType, list: readonly string[]): FilterOpt[] =>
          list.map((value, i) => ({ id: `seed-${type}-${i}`, type, value }));
        setTopics(fab("topic", COURSE_TOPICS));
        setDeliveries(fab("delivery", COURSE_DELIVERY));
        setProviders(fab("provider", COURSE_PROVIDERS));
        setLoaded(true);
      });
  }, [open, loaded]);

  async function addOption(type: FilterType, value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    const r = await fetch("/api/admin/courses/filter-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, value: trimmed }),
    });
    if (!r.ok) return;
    const j = (await r.json()) as { option: FilterOpt };
    if (type === "topic")    setTopics((cur) => [...cur, j.option]);
    if (type === "delivery") setDeliveries((cur) => [...cur, j.option]);
    if (type === "provider") setProviders((cur) => [...cur, j.option]);
  }

  async function removeOption(type: FilterType, id: string) {
    if (id.startsWith("seed-")) {
      // It's a fallback seed entry, not in the DB. Just hide locally.
      if (type === "topic")    setTopics((cur) => cur.filter((o) => o.id !== id));
      if (type === "delivery") setDeliveries((cur) => cur.filter((o) => o.id !== id));
      if (type === "provider") setProviders((cur) => cur.filter((o) => o.id !== id));
      return;
    }
    if (!(await confirmDialog({
      title: "Remove this option from the canonical list?",
      description: "Existing courses keep their value; the option just stops appearing as a suggestion.",
      confirmLabel: "Remove",
      tone: "warning",
    }))) return;
    const r = await fetch(`/api/admin/courses/filter-options/${id}`, { method: "DELETE" });
    if (!r.ok) return;
    if (type === "topic")    setTopics((cur) => cur.filter((o) => o.id !== id));
    if (type === "delivery") setDeliveries((cur) => cur.filter((o) => o.id !== id));
    if (type === "provider") setProviders((cur) => cur.filter((o) => o.id !== id));
  }

  async function create() {
    setLoading(true);
    const res = await fetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (res.ok) {
      const course = await res.json();
      setOpen(false);
      router.push(`/courses/${course.id}`);
      router.refresh();
    }
  }

  const inputCls =
    "w-full bg-card-solid text-fg placeholder:text-subtle border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="admin-glow flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        <Plus size={16} />
        New Course
      </button>

      {open && (
        <div className="fixed inset-0 bg-backdrop z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="popover p-6 w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl animate-slide-up-in">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-fg">Create Course</h2>
              <button onClick={() => setOpen(false)} className="text-subtle hover:text-fg">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Title *</label>
                <input
                  className={inputCls}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Course title"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Description</label>
                <textarea
                  className={inputCls + " resize-none"}
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Short description"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">Category</label>
                  <input
                    className={inputCls}
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    placeholder="e.g. Safety"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">Type</label>
                  <select
                    className={inputCls}
                    value={form.courseType}
                    onChange={(e) => setForm({ ...form, courseType: e.target.value })}
                  >
                    <option value="scorm">SCORM</option>
                    <option value="xapi">xAPI</option>
                    <option value="content">Content</option>
                    <option value="assessment">Assessment</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Passing Score (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={inputCls}
                  value={form.passingScore}
                  onChange={(e) => setForm({ ...form, passingScore: parseInt(e.target.value) })}
                />
              </div>

              {/* Catalog filter facets — pick from the curated list OR
                  type any custom value. The chip rows below each input
                  let admins promote a custom value to the canonical
                  list, or remove an option that's no longer relevant. */}
              <div className="border-t border-line pt-3 mt-1">
                <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-subtle mb-2">
                  Catalog filters
                </p>

                <FilterFieldWithChips
                  label="Topic"
                  type="topic"
                  value={form.topic}
                  onChange={(v) => setForm({ ...form, topic: v })}
                  options={topics}
                  inputCls={inputCls}
                  onAdd={(v) => addOption("topic", v)}
                  onRemove={(id) => removeOption("topic", id)}
                  loaded={loaded}
                />
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <FilterFieldWithChips
                    label="Delivery"
                    type="delivery"
                    value={form.delivery}
                    onChange={(v) => setForm({ ...form, delivery: v })}
                    options={deliveries}
                    inputCls={inputCls}
                    onAdd={(v) => addOption("delivery", v)}
                    onRemove={(id) => removeOption("delivery", id)}
                    loaded={loaded}
                    compact
                  />
                  <FilterFieldWithChips
                    label="Provider"
                    type="provider"
                    value={form.provider}
                    onChange={(v) => setForm({ ...form, provider: v })}
                    options={providers}
                    inputCls={inputCls}
                    onAdd={(v) => addOption("provider", v)}
                    onRemove={(id) => removeOption("provider", id)}
                    loaded={loaded}
                    compact
                  />
                </div>
                <label className="mt-3 flex items-center gap-2 text-xs text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isSpecial}
                    onChange={(e) => setForm({ ...form, isSpecial: e.target.checked })}
                    className="accent-brand-600"
                  />
                  Special program / workshop (instructor-led, limited seats)
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 border border-line text-muted text-sm font-medium py-2 rounded-lg hover:bg-elevated hover:text-fg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={create}
                disabled={!form.title || loading}
                className="flex-1 bg-brand-600 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg hover:bg-brand-700"
              >
                {loading ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmNode}
    </>
  );
}

// ── Field with inline option-management ─────────────────────────
function FilterFieldWithChips({
  label, type, value, onChange, options, inputCls, onAdd, onRemove, loaded, compact,
}: {
  label: string;
  type: FilterType;
  value: string;
  onChange: (v: string) => void;
  options: FilterOpt[];
  inputCls: string;
  onAdd: (v: string) => void | Promise<void>;
  onRemove: (id: string) => void | Promise<void>;
  loaded: boolean;
  compact?: boolean;
}) {
  const datalistId = `course-${type}-options`;
  const trimmed = value.trim();
  const isNew = !!trimmed && !options.some(
    (o) => o.value.toLowerCase() === trimmed.toLowerCase()
  );
  const [adding, setAdding] = useState(false);

  async function tryAdd() {
    if (!isNew || adding) return;
    setAdding(true);
    try { await onAdd(trimmed); } finally { setAdding(false); }
  }

  return (
    <div>
      <label className={`block ${compact ? "text-xs" : "text-sm"} font-medium text-muted mb-1`}>
        {label}
      </label>
      <div className="relative">
        <input
          list={datalistId}
          className={inputCls + (isNew ? " pr-24" : "")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={compact ? "Pick or type" : "Pick or type a custom value"}
          onKeyDown={(e) => {
            if (e.key === "Enter" && isNew) {
              e.preventDefault();
              tryAdd();
            }
          }}
        />
        <datalist id={datalistId}>
          {options.map((o) => <option key={o.id} value={o.value} />)}
        </datalist>
        {isNew && (
          <button
            type="button"
            onClick={tryAdd}
            disabled={adding}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold inline-flex items-center gap-0.5 px-2 py-1 rounded-md bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100 disabled:opacity-60"
            title={`Save "${trimmed}" as a canonical ${label.toLowerCase()} option`}
          >
            {adding ? <Loader2 size={9} className="animate-spin" /> : <Plus size={9} />}
            Save
          </button>
        )}
      </div>

      {/* Chip wrap of current options. Each chip × deletes the option
          from the canonical list. */}
      {loaded && options.length > 0 && (
        <div className={`mt-1.5 flex flex-wrap gap-1 ${compact ? "max-h-16 overflow-y-auto" : ""}`}>
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onRemove(o.id)}
              className="text-[10px] inline-flex items-center gap-1 bg-elevated/60 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 border border-line text-muted rounded-md px-1.5 py-0.5 transition-colors group"
              title={`Remove "${o.value}" from the canonical ${label.toLowerCase()} options`}
            >
              {o.value}
              <X size={9} className="opacity-50 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      )}
      {loaded && options.length === 0 && !compact && (
        <p className="mt-1.5 text-[10px] text-subtle italic">
          No canonical options yet. Type one above and click Save to add.
        </p>
      )}
    </div>
  );
}
