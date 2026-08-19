"use client";

/**
 * The 2026 registration note, measured against the chart — live.
 *
 * Every row is one request from the coordinator's note and the status
 * the CURRENT chart earns against it. The checks re-run on every edit,
 * which is why there is no comment thread here: on a workflow people
 * change directly, a comment about the chart goes stale the moment
 * someone moves a box, but a check cannot — it looks again.
 */
import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, CircleAlert, CircleSlash, XCircle } from "lucide-react";
import type { ChartDoc } from "@/lib/flowchart/types";
import { runReview, type ReviewStatus } from "@/lib/flowchart/review";

const BADGE: Record<ReviewStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  met: { label: "Met", cls: "bg-emerald-500/12 text-emerald-500", Icon: CheckCircle2 },
  missed: { label: "Not met", cls: "bg-red-500/12 text-red-500", Icon: XCircle },
  attention: { label: "Needs a decision", cls: "bg-amber-500/12 text-amber-500", Icon: CircleAlert },
  "out-of-scope": { label: "Out of scope here", cls: "bg-elevated text-subtle", Icon: CircleSlash },
};

export function FlowReviewPanel({ doc }: { doc: ChartDoc }) {
  const [open, setOpen] = useState(true);
  const results = useMemo(() => runReview(doc), [doc]);
  const met = results.filter((r) => r.status === "met").length;
  const missed = results.filter((r) => r.status === "missed").length;

  return (
    <section className="mt-8 rounded-lg border border-line bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="inline-flex items-baseline gap-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-400">
            Review · 2026 registration note
          </span>
          <span className="text-[11.5px] text-subtle">
            {met} of {results.length} met{missed ? ` · ${missed} not met` : ""} — re-checked live
            against this chart as you edit
          </span>
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-subtle transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>

      {open && (
        <ul className="divide-y divide-line border-t border-line">
          {results.map((r) => {
            const b = BADGE[r.status];
            return (
              <li key={r.id} className="flex gap-3 px-4 py-3">
                <span
                  className={`mt-0.5 inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-[10.5px] font-bold ${b.cls}`}
                >
                  <b.Icon size={12} /> {b.label}
                </span>
                <div className="min-w-0">
                  <p className="text-[12.5px] leading-snug text-fg">{r.request}</p>
                  <p className="mt-1 text-[11.5px] leading-snug text-muted">{r.evidence}</p>
                  <p className="mt-0.5 text-[10.5px] uppercase tracking-wide text-subtle">
                    {r.source}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
