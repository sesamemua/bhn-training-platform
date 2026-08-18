"use client";

/**
 * What the people running the event will see, derived from the chart.
 *
 * The registrations table is not a separate design: its columns are the
 * questions and its stages are the boxes between them. Showing it beside
 * the chart is how you find out that a process makes an unusable table —
 * thirty columns, or no way to tell who is waitlisted — while it is still
 * cheap to change.
 *
 * The rows are illustrative. There are no registrations yet, and inventing
 * plausible names would make a mock-up look like data.
 */
import { useMemo, useState } from "react";
import { CircleAlert, ExternalLink, Table2 } from "lucide-react";
import { adminColumns, parseSheetUrl, processStages } from "@/lib/flowchart/admin";
import type { ChartDoc, ChartSettings } from "@/lib/flowchart/types";

export function FlowAdminPreview({
  doc,
  canEdit,
  onSettings,
  hoverNodes = [],
  onHoverField,
  onFocusNode,
}: {
  doc: ChartDoc;
  canEdit: boolean;
  onSettings: (patch: Partial<ChartSettings>) => void;
  hoverNodes?: string[];
  onHoverField?: (nodeId: string | null) => void;
  onFocusNode?: (nodeId: string) => void;
}) {
  const columns = useMemo(() => adminColumns(doc), [doc]);
  const stages = useMemo(() => processStages(doc), [doc]);
  const [draft, setDraft] = useState(doc.settings?.rosterSheetUrl ?? "");

  const sheet = parseSheetUrl(draft);
  const saved = doc.settings?.rosterSheetUrl ?? "";

  return (
    <div>
      <div className="flex items-baseline justify-between pb-3">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-400">
          <Table2 size={12} /> Admin panel
        </p>
        <p className="text-[11.5px] text-subtle">
          {columns.length} columns · {stages.length} stages
        </p>
      </div>

      <p className="pb-4 text-[12px] leading-relaxed text-muted">
        Built from the chart. Every question becomes a column; every box
        that is not a question becomes a stage a registrant can sit in.
      </p>

      {/* ── stages ─────────────────────────────────────────────── */}
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-subtle">Stages</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {stages.length === 0 && (
          <p className="text-[12px] text-muted">
            No stages yet — add a step or decision box to the chart.
          </p>
        )}
        {stages.map((s) => (
          <button
            key={s.id}
            onMouseEnter={() => onHoverField?.(s.id)}
            onMouseLeave={() => onHoverField?.(null)}
            onClick={() => onFocusNode?.(s.id)}
            className={`rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${
              hoverNodes.includes(s.id)
                ? "border-brand-400 bg-brand-500/15 text-fg"
                : s.terminal
                  ? "border-line-strong bg-elevated text-muted"
                  : "border-brand-400/50 bg-brand-500/8 text-fg"
            }`}
            title="Show this box on the chart"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── columns ────────────────────────────────────────────── */}
      <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.12em] text-subtle">
        Columns, in the order they are asked
      </p>
      <div className="mt-1.5 overflow-x-auto rounded-md border border-line">
        <table className="w-full text-left text-[11.5px]">
          <thead>
            <tr className="border-b border-line bg-elevated/50 text-subtle">
              <th className="px-2.5 py-1.5 font-semibold">Column</th>
              <th className="px-2.5 py-1.5 font-semibold">From</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => (
              <tr
                key={c.key}
                className="border-b border-line/60 last:border-0"
              >
                <td className="px-2.5 py-1.5 text-fg">
                  {c.label}
                  {c.required && <span className="ml-1 text-brand-400">*</span>}
                  <span className="ml-1.5 font-mono text-[10.5px] text-subtle">{c.key}</span>
                </td>
                <td className="px-2.5 py-1.5 text-muted">{c.group}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {columns.length > 14 && (
        <p className="mt-1.5 flex items-start gap-1 text-[11.5px] text-amber-600">
          <CircleAlert size={11} className="mt-0.5 shrink-0" />
          <span>
            {columns.length} columns is a wide table. Anything not needed for a
            decision reads better on the person&rsquo;s own record than in the list.
          </span>
        </p>
      )}

      {/* ── the roster sheet ───────────────────────────────────── */}
      <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.12em] text-subtle">
        Existing platform users
      </p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
        Drop in the Google Sheet of current BHN Training Platform users and the
        panel can mark which registrants already have an account, instead of
        someone checking each one by hand.
      </p>
      <input
        value={draft}
        disabled={!canEdit}
        placeholder="https://docs.google.com/spreadsheets/d/…"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = draft.trim();
          if (next === saved) return;
          if (next === "") { onSettings({ rosterSheetUrl: undefined }); return; }
          if (parseSheetUrl(next).ok) onSettings({ rosterSheetUrl: next });
        }}
        className="mt-2 w-full rounded-md border border-line bg-elevated px-2.5 py-1.5 text-[12px] text-fg outline-none placeholder:text-subtle focus-visible:border-brand-500 disabled:opacity-60"
      />
      {draft.trim() !== "" && !sheet.ok && (
        <p className="mt-1.5 flex items-start gap-1 text-[11.5px] text-amber-600">
          <CircleAlert size={11} className="mt-0.5 shrink-0" /> {sheet.reason}
        </p>
      )}
      {sheet.ok && (
        <p className="mt-1.5 text-[11.5px] text-subtle">
          Sheet <span className="font-mono text-[10.5px] text-muted">{sheet.id.slice(0, 12)}…</span>
          {sheet.gid ? ` · tab ${sheet.gid}` : ""}
          {draft.trim() === saved ? " · saved with the chart" : " · leave the field to save"}
          {" "}
          <a
            href={sheet.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-0.5 text-brand-400 hover:text-brand-200"
          >
            open <ExternalLink size={9} />
          </a>
        </p>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-subtle">
        The link is stored with the chart. Nothing is read from the sheet yet —
        wiring the match-up is the next step, and it will need the sheet shared
        with the platform&rsquo;s service account.
      </p>
    </div>
  );
}
