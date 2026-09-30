"use client";

import { useEffect, useState, useTransition } from "react";
import {
  MessageCircle, Send, AlertCircle, Lock, Trash2, ShieldCheck, Building2,
} from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

export interface CommentRow {
  id: string;
  body: string;
  authorRole: string;
  /** ISO */
  createdAt: string;
  author: { id: string; name: string | null; email: string };
}

/**
 * Shared comment thread for talent-application submissions. Used
 * on both the admin /admin/forms/talent-application surface and
 * the employer-facing /employer/talent-pool browse page.
 *
 * Commenting is GATED: when the submission's reviewStatus isn't
 * "approved"/"approved_skip_review", the composer is locked with
 * an explanation. The thread itself stays viewable so reviewers
 * can see historical context.
 */
export function ApplicationCommentThread({
  submissionId,
  myUserId,
  myRole,
}: {
  submissionId: string;
  myUserId: string;
  myRole: string;
}) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentable, setCommentable] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<string>("pending");
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();
  const [, startTransition] = useTransition();

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId]);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/talent-pool/${submissionId}/comments`);
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        commentable?: boolean;
        reviewStatus?: string;
        comments?: CommentRow[];
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load comments");
      setComments(data.comments ?? []);
      setCommentable(!!data.commentable);
      setReviewStatus(data.reviewStatus ?? "pending");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    const text = draft.trim();
    if (!text || submitting) return;
    setSubmitting(true); setError(null);
    try {
      const res = await fetch(`/api/talent-pool/${submissionId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string; comment?: CommentRow;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to post comment");
      if (data.comment) setComments((prev) => [...prev, data.comment!]);
      setDraft("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(c: CommentRow) {
    if (!(await confirmDialog({ title: "Delete this comment?", confirmLabel: "Delete", tone: "destructive" }))) return;
    setError(null);
    try {
      const res = await fetch(`/api/talent-pool/${submissionId}/comments/${c.id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      setComments((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-4 surface-shadow space-y-3">
      {confirmNode}
      <header className="flex items-center gap-2">
        <MessageCircle size={14} className="text-brand-600" />
        <h3 className="text-sm font-bold text-fg tracking-tight">
          Comments
          {comments.length > 0 && (
            <span className="text-xs font-mono tabular-nums text-subtle ml-2">{comments.length}</span>
          )}
        </h3>
      </header>

      {!commentable && !loading && (
        <div className="rounded-xl bg-amber-50 ring-1 ring-inset ring-amber-200 px-3 py-2 flex items-start gap-2">
          <Lock size={12} className="text-amber-700 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 leading-snug">
            <strong>Commenting locked.</strong> An admin must review and approve
            the applicant's eligibility before comments can be posted.{" "}
            <span className="font-mono text-amber-800">
              (Current status: {reviewStatus.replace("_", " ")})
            </span>
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-subtle italic">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-subtle italic">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => {
            const mine = c.author.id === myUserId;
            const canDelete = mine || myRole === "admin" || myRole === "superadmin";
            return (
              <li
                key={c.id}
                className={`rounded-xl border border-line p-3 ${mine ? "bg-brand-50/40 border-brand-200" : "bg-background"}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <AuthorBadge role={c.authorRole} />
                    <span className="text-xs font-semibold text-fg truncate">
                      {c.author.name ?? c.author.email}
                    </span>
                    <span className="text-[10px] text-subtle">
                      {new Date(c.createdAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => startTransition(() => { void remove(c); })}
                      className="text-[10px] text-rose-700 hover:bg-rose-50 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5"
                      title="Delete comment"
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
                <p className="text-sm text-fg whitespace-pre-wrap leading-snug">{c.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <div className="rounded-xl bg-rose-50 ring-1 ring-inset ring-rose-200 px-3 py-2 flex items-start gap-2 text-xs text-rose-900">
          <AlertCircle size={11} className="text-rose-700 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {commentable && (
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={submitting}
            rows={3}
            maxLength={4000}
            placeholder="Comment on this application — visible to admins + employers, not the applicant."
            className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm resize-y"
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-[10px] text-subtle">
              {draft.length} / 4000
            </p>
            <button
              type="button"
              onClick={() => startTransition(() => { void submit(); })}
              disabled={submitting || draft.trim().length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 text-white px-3 py-1.5 text-xs font-bold hover:bg-brand-700 disabled:opacity-50"
            >
              <Send size={11} />
              {submitting ? "Posting…" : "Post comment"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function AuthorBadge({ role }: { role: string }) {
  const meta =
    role === "employer"
      ? { label: "Employer", tone: "bg-violet-100 text-violet-800 ring-violet-200", Icon: Building2 }
      : role === "admin" || role === "superadmin"
        ? { label: "Admin", tone: "bg-emerald-100 text-emerald-800 ring-emerald-200", Icon: ShieldCheck }
        : { label: role, tone: "bg-elevated text-subtle ring-line", Icon: ShieldCheck };
  const Icon = meta.Icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded ring-1 ring-inset ${meta.tone}`}>
      <Icon size={10} />
      {meta.label}
    </span>
  );
}
