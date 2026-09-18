"use client";

/**
 * The lunch list under Catering → Lunch: one pill per person, × to take
 * someone off, a box to add someone. Saves on each change; the page's
 * totals recompute from the saved list.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { setLunchGuests } from "@/lib/video/production-cost-actions";

export function LunchGuests({ projectId, initial }: { projectId: string; initial: string[] }) {
  const router = useRouter();
  const [names, setNames] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(next: string[]) {
    const before = names;
    setNames(next);
    setError(null);
    start(async () => {
      const r = await setLunchGuests(projectId, next);
      if (!r.ok) { setNames(before); setError(r.error); return; }
      router.refresh();
    });
  }
  function add() {
    const n = draft.trim();
    if (!n || names.includes(n)) { setDraft(""); return; }
    save([...names, n]);
    setDraft("");
  }

  return (
    <div className="mt-2">
      <ul className="flex flex-wrap gap-1.5" aria-label="Lunch list">
        {names.map((n) => (
          <li key={n} className="inline-flex items-center gap-1 rounded-full border border-line bg-elevated py-0.5 pl-2.5 pr-1 text-[12px] font-medium text-fg">
            {n}
            <button
              type="button"
              onClick={() => save(names.filter((x) => x !== n))}
              disabled={pending}
              aria-label={`Take ${n} off the lunch list`}
              title="No lunch needed"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted hover:bg-rose-500/15 hover:text-rose-700 disabled:opacity-40"
            >
              <X size={11} />
            </button>
          </li>
        ))}
        <li className="inline-flex items-center gap-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="Add a name"
            aria-label="Add someone to the lunch list"
            maxLength={60}
            className="w-28 rounded-full border border-dashed border-line bg-transparent px-2.5 py-0.5 text-[12px] text-fg placeholder:text-subtle focus:border-brand-400 focus:outline-none"
          />
          <button type="button" onClick={add} disabled={pending || !draft.trim()} aria-label="Add" className="inline-flex h-5 w-5 items-center justify-center rounded-full text-brand-700 hover:bg-brand-500/10 disabled:opacity-30">
            {pending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={12} />}
          </button>
        </li>
      </ul>
      {error && <p className="mt-1 text-[11.5px] text-rose-600">{error}</p>}
    </div>
  );
}
