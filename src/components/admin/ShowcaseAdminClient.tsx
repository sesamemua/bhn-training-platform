"use client";

/**
 * ShowcaseAdminClient — grid of showcase submissions on
 * /admin/showcase.
 *
 * Each row carries: headshot thumbnail, name, LinkedIn link,
 * created date, last-downloaded date (if any), and three actions —
 *   Download    — opens the photo URL + the LinkedIn URL in new
 *                 tabs; on success calls the mark-downloaded API
 *                 (so the row records who/when).
 *   Mark done   — explicit toggle (sets/clears last-downloaded
 *                 manually, in case the auto-mark missed).
 *   Delete      — hard-deletes the row + drops the R2 object.
 *
 * Filtering: program tab + a "show only undownloaded" toggle.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Download, Trash2, CheckCircle2, Circle, ExternalLink, Filter, AlertCircle,
  Plus, X, Layers, Home,
} from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

/** A structured group/cohort membership (the single source of truth). */
interface Membership { membershipId: string; groupId: string; isHome: boolean; label: string; sub: string | null }
/** The "add to group" picker catalog: groups bucketed by pathway. */
type GroupCatalog = { pathwayName: string | null; groups: { id: string; label: string }[] }[];

interface Submission {
  id: string;
  programSlug: string;
  name: string;
  linkedinHandle: string;
  linkedinUrl: string | null;
  photoUrl: string;
  photoKey: string;
  submittedFromIp: string | null;
  submittedFromUa: string | null;
  createdAt: string;
  lastDownloadedAt: string | null;
  lastDownloadedBy: string | null;
  adminNote: string | null;
  /** The answer to the group's written question, when it asks one. */
  quote?: string | null;
  /** Award round, assigned here by an admin. */
  round?: number | null;
  /** When they ticked the link's consent box. */
  consentAt?: string | null;
  memberships: Membership[];
}

interface Props {
  initialSubmissions: Submission[];
  adminName: string;
  groupCatalog: GroupCatalog;
  /** Open filtered to this group (from ?group=<slug>). */
  initialGroupId?: string | null;
}

export function ShowcaseAdminClient({ initialSubmissions, adminName, groupCatalog, initialGroupId = null }: Props) {
  const router = useRouter();
  const { confirmDialog, node: confirmNode } = useConfirmDialog();
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [onlyUndownloaded, setOnlyUndownloaded] = useState(false);
  // "" = every round, "none" = not assigned yet, else a round number.
  const [roundFilter, setRoundFilter] = useState("");
  const [programFilter, setProgramFilter] = useState<string | null>(initialGroupId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Filter tabs come from every membership (home + additional), keyed by
  // group id with a friendly "Pathway › Cohort" label — so someone added to
  // a second pathway shows up under that pathway's tab too.
  const groupOptions = (() => {
    const map = new Map<string, string>();
    submissions.forEach((s) =>
      s.memberships.forEach((m) => {
        if (!map.has(m.groupId)) map.set(m.groupId, m.sub ? `${m.label} › ${m.sub}` : m.label);
      }),
    );
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  })();
  const visible = submissions.filter((s) => {
    if (onlyUndownloaded && s.lastDownloadedAt) return false;
    if (roundFilter === "none" ? s.round != null : roundFilter && String(s.round ?? "") !== roundFilter) return false;
    if (programFilter && !s.memberships.some((m) => m.groupId === programFilter)) return false;
    return true;
  });

  /** Assign (or clear) the award round. Saved straight away; put back if the save fails. */
  async function setRound(s: Submission, round: number | null) {
    const before = s.round ?? null;
    setSubmissions((cur) => cur.map((x) => (x.id === s.id ? { ...x, round } : x)));
    const res = await fetch(`/api/admin/showcase/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round }),
    }).catch(() => null);
    if (!res?.ok) {
      setSubmissions((cur) => cur.map((x) => (x.id === s.id ? { ...x, round: before } : x)));
      setError("Couldn't save the round — try again.");
    }
  }

  async function markDownloaded(s: Submission, mark: boolean) {
    setBusyId(s.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/showcase/${s.id}/mark-downloaded`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        submission?: Submission;
        error?: string;
      };
      if (!res.ok || !j.submission) {
        setError(j.error ?? `Update failed (HTTP ${res.status}).`);
        return;
      }
      setSubmissions((cur) => cur.map((x) => (x.id === s.id ? j.submission! : x)));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRow(s: Submission) {
    const ok = await confirmDialog({
      title: `Delete ${s.name}'s submission?`,
      description: "Removes the row AND deletes the headshot from storage. Cannot be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Keep it",
      tone: "destructive",
    });
    if (!ok) return;
    setBusyId(s.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/showcase/${s.id}`, { method: "DELETE" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setError(j.error ?? `Delete failed (HTTP ${res.status}).`);
        return;
      }
      setSubmissions((cur) => cur.filter((x) => x.id !== s.id));
    } finally {
      setBusyId(null);
    }
  }

  function downloadPhoto(s: Submission) {
    // Open the photo URL in a new tab — browser handles the actual
    // save. Then in the background, mark this row as downloaded.
    window.open(s.photoUrl, "_blank");
    startTransition(() => {
      void markDownloaded(s, true);
    });
  }

  /** Add this person to another group/cohort (a second membership — no photo). */
  async function addMembership(s: Submission, groupId: string) {
    if (!groupId || s.memberships.some((m) => m.groupId === groupId)) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/showcase/submissions/${s.id}/memberships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; membership?: Membership; error?: string };
      if (!res.ok || !j.ok || !j.membership) {
        setError(j.error ?? `Adding to group failed (HTTP ${res.status}).`);
        return;
      }
      const m = j.membership;
      setSubmissions((cur) =>
        cur.map((x) =>
          x.id === s.id && !x.memberships.some((e) => e.groupId === m.groupId)
            ? { ...x, memberships: [...x.memberships, m] }
            : x,
        ),
      );
    } catch {
      setError("Adding to group failed — check your connection.");
    }
  }

  /** Remove this person from a group (delete the membership). Home is protected. */
  async function removeMembership(s: Submission, m: Membership) {
    if (m.isHome) { setError("That's the person's home group — delete the person instead."); return; }
    setError(null);
    const prev = s.memberships;
    setSubmissions((cur) =>
      cur.map((x) => (x.id === s.id ? { ...x, memberships: x.memberships.filter((e) => e.membershipId !== m.membershipId) } : x)),
    );
    try {
      const res = await fetch(`/api/admin/showcase/submissions/${s.id}/memberships`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: m.groupId }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setError(j.error ?? `Removing from group failed (HTTP ${res.status}).`);
        setSubmissions((cur) => cur.map((x) => (x.id === s.id ? { ...x, memberships: prev } : x)));
      }
    } catch {
      setError("Removing from group failed — check your connection.");
      setSubmissions((cur) => cur.map((x) => (x.id === s.id ? { ...x, memberships: prev } : x)));
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line/70 bg-card-solid px-4 py-2.5">
        <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] font-bold text-fg-subtle">
          <Filter size={11} /> Filters
        </div>
        <button
          type="button"
          onClick={() => setProgramFilter(null)}
          className={
            "text-[11.5px] px-2 py-1 rounded-md transition-colors " +
            (programFilter === null
              ? "bg-brand-600 text-white font-semibold"
              : "text-fg-muted hover:text-fg hover:bg-elevated")
          }
        >
          All ({submissions.length})
        </button>
        {groupOptions.map((g) => {
          const n = submissions.filter((s) => s.memberships.some((m) => m.groupId === g.id)).length;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setProgramFilter(g.id)}
              className={
                "text-[11.5px] px-2 py-1 rounded-md transition-colors " +
                (programFilter === g.id
                  ? "bg-brand-600 text-white font-semibold"
                  : "text-fg-muted hover:text-fg hover:bg-elevated")
              }
            >
              {g.label} ({n})
            </button>
          );
        })}
        <span className="text-line">·</span>
        <label className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-muted">
          <input
            type="checkbox"
            checked={onlyUndownloaded}
            onChange={(e) => setOnlyUndownloaded(e.target.checked)}
            className="accent-brand-600"
          />
          Only show un-downloaded
        </label>
        <label className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-muted">
          Round
          <select value={roundFilter} onChange={(e) => setRoundFilter(e.target.value)} className="rounded-md border border-line bg-card px-1.5 py-0.5 text-[11.5px] text-fg">
            <option value="">All</option>
            <option value="none">Not assigned</option>
            {[...new Set(submissions.map((x) => x.round).filter((r): r is number => r != null))].sort((a, b) => a - b).map((r) => <option key={r} value={r}>Round {r}</option>)}
          </select>
        </label>
        <div className="flex-1" />
        <p className="text-[11px] text-fg-subtle">
          Signed in as <span className="font-semibold">{adminName}</span>
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="inline-flex items-start gap-2 rounded-lg bg-rose-50 ring-1 ring-inset ring-rose-200 px-3 py-2 text-[12px] text-rose-900">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Empty state */}
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-10 text-center text-[13px] text-fg-subtle">
          {submissions.length === 0
            ? "No submissions yet. Share /showcase/regulatory-affairs and they'll appear here."
            : "No submissions match the current filter."}
        </div>
      ) : (
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => (
            <li key={s.id}>
              <SubmissionCard
                submission={s}
                busy={busyId === s.id}
                onDownload={() => downloadPhoto(s)}
                onToggleMark={() => markDownloaded(s, !s.lastDownloadedAt)}
                onDelete={() => deleteRow(s)}
                onAddMembership={(groupId) => addMembership(s, groupId)}
                onRemoveMembership={(m) => removeMembership(s, m)}
                onRound={(round) => setRound(s, round)}
                groupCatalog={groupCatalog}
              />
            </li>
          ))}
        </ol>
      )}

      <p className="text-[11.5px] text-fg-muted italic">
        Public submission URL: <code className="text-fg-subtle">/showcase/regulatory-affairs</code>
        {" · "}
        <button
          type="button"
          onClick={() => router.refresh()}
          className="font-semibold hover:underline"
        >
          Refresh list
        </button>
      </p>
      {confirmNode}
    </div>
  );
}

function SubmissionCard({
  submission, busy, onDownload, onToggleMark, onDelete, onAddMembership, onRemoveMembership, onRound, groupCatalog,
}: {
  submission: Submission;
  busy: boolean;
  onDownload: () => void;
  onRound: (round: number | null) => void;
  onToggleMark: () => void;
  onDelete: () => void;
  onAddMembership: (groupId: string) => void;
  onRemoveMembership: (m: Membership) => void;
  groupCatalog: GroupCatalog;
}) {
  const downloaded = !!submission.lastDownloadedAt;
  return (
    <article
      className={
        "relative rounded-xl border bg-card-solid overflow-hidden " +
        (downloaded ? "border-line opacity-90" : "border-brand-200 ring-1 ring-brand-100/50")
      }
    >
      {/* Status strip across the top */}
      <span
        aria-hidden
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ backgroundColor: downloaded ? "var(--fg-subtle)" : "var(--brand-500)" }}
      />

      <div className="p-3.5 flex gap-3">
        {/* Headshot */}
        <a
          href={submission.photoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 w-20 h-20 rounded-full overflow-hidden ring-2 ring-line bg-elevated"
          title="Open full-size"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={submission.photoUrl}
            alt={`${submission.name}'s headshot`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </a>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-fg leading-tight truncate">
            {submission.name}
          </p>
          {submission.linkedinUrl && (
            <a
              href={submission.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-brand-700 hover:underline truncate"
            >
              {submission.linkedinHandle} <ExternalLink size={9} />
            </a>
          )}
          <label className="mt-1.5 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-fg-muted">
            Round
            <select
              value={submission.round ?? ""}
              onChange={(e) => onRound(e.target.value ? Number(e.target.value) : null)}
              className="rounded-md border border-line bg-card px-1.5 py-0.5 text-[12px] font-semibold text-fg"
              aria-label={`Award round for ${submission.name}`}
            >
              <option value="">—</option>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {submission.consentAt && (
            <p className="mt-1 text-[10.5px] text-fg-subtle">Consented {new Date(submission.consentAt).toLocaleDateString()}</p>
          )}
          {submission.quote && (
            <blockquote className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap border-l-2 border-brand-400 pl-2 text-[12px] leading-relaxed text-fg">
              {submission.quote}
            </blockquote>
          )}
          <p className="mt-1.5 text-[11px] text-fg-subtle">
            Submitted {new Date(submission.createdAt).toLocaleString()}
          </p>
          {downloaded && (
            <p className="text-[10.5px] text-fg-subtle italic">
              Downloaded {new Date(submission.lastDownloadedAt!).toLocaleDateString()} by {submission.lastDownloadedBy ?? "—"}
            </p>
          )}
        </div>
      </div>

      {/* Structured group/cohort memberships (single source of truth) */}
      <div className="px-3.5 pb-3 -mt-0.5">
        <MembershipChips
          memberships={submission.memberships}
          groupCatalog={groupCatalog}
          onAdd={onAddMembership}
          onRemove={onRemoveMembership}
          disabled={busy}
        />
      </div>

      {/* Action row */}
      <div className="flex items-center gap-1 border-t border-line/60 px-3 py-2">
        <button
          type="button"
          onClick={onDownload}
          disabled={busy}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
          title="Open the headshot in a new tab + mark this row as downloaded"
        >
          <Download size={11} /> Download
        </button>
        <button
          type="button"
          onClick={onToggleMark}
          disabled={busy}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] font-semibold text-fg-muted hover:bg-elevated disabled:opacity-50"
          title={downloaded ? "Mark as not-yet-downloaded" : "Manually mark as downloaded"}
        >
          {downloaded ? <CheckCircle2 size={11} /> : <Circle size={11} />}
          {downloaded ? "Mark undone" : "Mark done"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          title="Delete this row + the headshot file"
        >
          <Trash2 size={11} /> Delete
        </button>
      </div>
    </article>
  );
}

/**
 * MembershipChips — the structured group/cohort membership on a card, the
 * single source of truth (backed by real ShowcaseGroup rows, not free text).
 * A cohort group renders "Pathway › Cohort"; a standalone group renders its
 * name. The home membership carries a home icon and can't be removed here
 * (delete the person from their card instead). "+ Group" adds the person to
 * another group/cohort — no photo needed since they already exist.
 */
function MembershipChips({
  memberships, groupCatalog, onAdd, onRemove, disabled,
}: {
  memberships: Membership[];
  groupCatalog: GroupCatalog;
  onAdd: (groupId: string) => void;
  onRemove: (m: Membership) => void;
  disabled: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const memberGroupIds = new Set(memberships.map((m) => m.groupId));
  const buckets = groupCatalog
    .map((b) => ({ ...b, groups: b.groups.filter((g) => !memberGroupIds.has(g.id)) }))
    .filter((b) => b.groups.length > 0);
  const canAdd = buckets.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {memberships.map((m) => (
        <span
          key={m.membershipId}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1 ring-inset bg-brand-50 text-brand-800 ring-brand-200"
        >
          <Layers size={9} className="opacity-70" />
          <span className="max-w-[130px] truncate">{m.label}</span>
          {m.sub && (
            <>
              <span className="-mx-0.5 opacity-45" aria-hidden>›</span>
              <span className="max-w-[90px] truncate italic opacity-90">{m.sub}</span>
            </>
          )}
          {m.isHome ? (
            <Home size={9} className="ml-0.5 opacity-45" aria-label="Home group" />
          ) : (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onRemove(m)}
              disabled={disabled}
              title="Remove from this group"
              className="-mr-0.5 opacity-50 transition hover:opacity-100"
            >
              <X size={9} />
            </button>
          )}
        </span>
      ))}

      {canAdd &&
        (adding ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-elevated px-1.5 py-0.5 ring-1 ring-inset ring-line">
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <select
              autoFocus
              defaultValue=""
              aria-label="Add to pathway / cohort"
              disabled={disabled}
              onChange={(e) => { const v = e.target.value; if (v) { onAdd(v); setAdding(false); } }}
              className="max-w-[190px] bg-transparent text-[11px] font-medium text-fg outline-none"
            >
              <option value="" disabled>Pick a pathway / cohort…</option>
              {buckets.map((b, bi) => (
                <optgroup key={bi} label={b.pathwayName ?? "Other showcases"}>
                  {b.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {b.pathwayName ? `${b.pathwayName} › ${g.label}` : g.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button type="button" onClick={() => setAdding(false)} title="Cancel" className="text-fg-subtle transition hover:text-fg">
              <X size={12} />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={disabled}
            title="Add this person to another pathway / cohort"
            className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-line px-2 py-0.5 text-[10.5px] font-medium text-fg-subtle transition hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
          >
            <Plus size={10} /> Add additional pathway
          </button>
        ))}
    </div>
  );
}
