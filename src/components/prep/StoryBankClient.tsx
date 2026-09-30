"use client";
/**
 * Story Bank client component.
 *
 * Lists every StarStory and supports inline edit + delete. Reuses
 * the same heuristic structure validator as the prep flow so a
 * trainee editing a story sees the same readiness feedback.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ChevronDown, Trash2, Save, Loader2, CheckCircle2, AlertCircle, Hourglass, ExternalLink,
} from "lucide-react";
import { validateStarStructure } from "@/lib/prep/star";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

interface Story {
  id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  tags: string[];
  skills: Array<{ id: string; name: string }>;
  source: { id: string; title: string; companyName: string } | null;
  updatedAt: string;
}

export function StoryBankClient({ initialStories }: { initialStories: Story[] }) {
  const [stories, setStories] = useState(initialStories);
  const [openId, setOpenId] = useState<string | null>(null);

  function patchStory(id: string, patch: Partial<Story>) {
    setStories((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  function removeStory(id: string) {
    setStories((s) => s.filter((x) => x.id !== id));
    if (openId === id) setOpenId(null);
  }

  return (
    // Hairline-divided list, no rounded card chrome on each row.
    // The whole bank reads as one column; sections + dividers come
    // from the page-level layout instead of from per-row boxes.
    <ul className="divide-y divide-line border-y border-line">
      {stories.map((s) => (
        <StoryCard
          key={s.id}
          story={s}
          open={openId === s.id}
          onToggle={() => setOpenId(openId === s.id ? null : s.id)}
          onChange={(p) => patchStory(s.id, p)}
          onRemove={() => removeStory(s.id)}
        />
      ))}
    </ul>
  );
}

function StoryCard({
  story,
  open,
  onToggle,
  onChange,
  onRemove,
}: {
  story: Story;
  open: boolean;
  onToggle: () => void;
  onChange: (p: Partial<Story>) => void;
  onRemove: () => void;
}) {
  const [savingTransition, startSaving] = useTransition();
  const [savedFlash, setSavedFlash] = useState(false);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  const feedback = validateStarStructure({
    situation: story.situation,
    task: story.task,
    action: story.action,
    result: story.result,
  });

  async function save() {
    startSaving(async () => {
      const res = await fetch(`/api/prep/star/${story.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: story.title,
          situation: story.situation,
          task: story.task,
          action: story.action,
          result: story.result,
          tags: story.tags,
        }),
      });
      if (res.ok) {
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2500);
      }
    });
  }

  async function del() {
    if (!(await confirmDialog({
      title: "Delete this story?",
      description: "It's only in your private Story Bank — but the action is permanent.",
      confirmLabel: "Delete",
      tone: "destructive",
    }))) {
      return;
    }
    const res = await fetch(`/api/prep/star/${story.id}`, { method: "DELETE" });
    if (res.ok) onRemove();
  }

  const readinessChip = {
    ready: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    almost: "bg-amber-100 text-amber-800 ring-amber-200",
    "needs-work": "bg-rose-100 text-rose-800 ring-rose-200",
  }[feedback.readiness];

  return (
    // No card chrome — the surrounding <ul> provides the hairline
    // dividers. Hover/open state uses a subtle elevated wash so the
    // active row stands out without a rounded box around it.
    <li className={open ? "bg-elevated/30" : ""}>
      {confirmNode}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start justify-between gap-3 px-4 sm:px-5 py-4 text-left hover:bg-elevated/40 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-fg leading-tight">{story.title}</h2>
            <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-0.5 rounded-full ring-1 ring-inset ${readinessChip}`}>
              {feedback.readiness === "ready" ? <><CheckCircle2 size={10} className="mr-0.5" /> Ready</> :
               feedback.readiness === "almost" ? <><Hourglass size={10} className="mr-0.5" /> Almost</> :
               <><AlertCircle size={10} className="mr-0.5" /> Needs work</>}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {story.skills.map((sk) => (
              <span key={sk.id} className="text-[10px] font-semibold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-200">
                {sk.name}
              </span>
            ))}
          </div>
          {story.source && (
            <p className="text-[11px] text-subtle mt-1.5">
              Originally drafted for{" "}
              <Link href={`/internships/${story.source.id}`} className="hover:text-fg hover:underline inline-flex items-center gap-0.5">
                {story.source.title} @ {story.source.companyName}
                <ExternalLink size={9} />
              </Link>
            </p>
          )}
        </div>
        <ChevronDown size={16} className={`text-subtle shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 sm:px-5 pb-5 border-t border-line space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            <Field label="Title" value={story.title} onChange={(v) => onChange({ title: v })} type="input" />
          </div>
          <Field label="Situation" hint={feedback.perField.situation.nudge} value={story.situation} onChange={(v) => onChange({ situation: v })} />
          <Field label="Task" hint={feedback.perField.task.nudge} value={story.task} onChange={(v) => onChange({ task: v })} />
          <Field label="Action" hint={feedback.perField.action.nudge} value={story.action} onChange={(v) => onChange({ action: v })} />
          <Field label="Result" hint={feedback.perField.result.nudge} value={story.result} onChange={(v) => onChange({ result: v })} />

          {feedback.tips.length > 0 && (
            <div className="rounded-xl bg-amber-50 ring-1 ring-inset ring-amber-200 p-3 text-xs leading-relaxed text-amber-900">
              <p className="font-bold mb-1">Tips</p>
              <ul className="space-y-0.5">
                {feedback.tips.map((t, i) => <li key={i}>· {t}</li>)}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-line">
            <button
              type="button"
              onClick={del}
              className="text-xs text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"
            >
              <Trash2 size={12} /> Delete story
            </button>
            <div className="flex items-center gap-2">
              {savedFlash && <span className="text-[11px] text-emerald-700">Saved.</span>}
              <button
                type="button"
                disabled={savingTransition}
                onClick={save}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-bold hover:bg-brand-700 disabled:opacity-50"
              >
                {savingTransition ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  type = "textarea",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  type?: "input" | "textarea";
}) {
  return (
    <div>
      <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-subtle block mb-1">{label}</label>
      {type === "input" ? (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-card border border-line rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
        />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full bg-card border border-line rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-y leading-relaxed"
        />
      )}
      {hint && <p className="text-[10px] text-amber-700 mt-1">{hint}</p>}
    </div>
  );
}
