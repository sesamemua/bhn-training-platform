"use client";
/**
 * Reviewer action panel for an Equip application.
 *
 * Drives the decision UI off three axes — stream, stage, status:
 *
 *   VL + pre_screen + submitted/under_review  → Stage-1 review
 *     buttons: Claim → Advance to Stage 2 / Not selected
 *     decision is preScreen* fields, no approvedAmount yet.
 *
 *   VL + full_app + submitted/under_review    → Stage-2 review
 *     buttons: Claim → Approve (with 6-criterion rubric) /
 *              Not selected
 *     gate: Appendix 3 (IP supporting document) must be attached
 *           or the approve button is disabled with an explainer.
 *
 *   VC / Innovation Fellowship + submitted/under_review
 *                                             → single-stage review
 *     buttons: Claim → Approve (with amount) / Not selected
 *
 *   approved (any stream/stage)               → Mark funded
 *
 *   terminal                                  → no actions
 *
 * All actions hit PATCH /api/admin/equip/applications/[id].
 * Per-criterion scores are kept locally and POSTed as
 * `reviewerScores` on the Stage-2 approve call.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, X, Sparkles, AlertCircle, FastForward, FileCheck2 } from "lucide-react";
import type {
  EquipStatus,
  EquipStream,
  ApplicationStage,
  VentureLiftReviewerScores,
} from "@/lib/equip/types";

interface Props {
  applicationId: string;
  stream: EquipStream;
  stage: ApplicationStage;
  currentStatus: EquipStatus;
  requestedAmount: number | null;
  approvedAmount: number | null;
  /** VC only — remaining cumulative cap for this applicant.
   *  Null on VL or when no cap applies. */
  remainingCap?: number | null;
  /** VL Stage-2 only — whether Appendix 3 (IP supporting docs)
   *  has been attached. Eligibility gate per the Reviewer
   *  Guide. */
  hasIpAppendix?: boolean;
  /** Existing reviewer scores if the decision is being
   *  amended. Pre-fills the rubric on first open. */
  existingScores?: VentureLiftReviewerScores | null;
}

type Mode =
  | "idle"
  | "approve_stage1"   // VL Stage-1 advance
  | "reject_stage1"    // VL Stage-1 reject
  | "approve_stage2"   // VL Stage-2 approve (full rubric)
  | "approve_vc"       // single-stage approve with amount
  | "reject"           // VL Stage-2 / single-stage reject
  | "fund";            // mark funded

const CRITERIA: Array<{ key: keyof VentureLiftReviewerScores; label: string; hint: string }> = [
  { key: "innovation",         label: "1. Innovation & technical merit",        hint: "Novelty + IP strength. Provisional patent is the minimum." },
  { key: "market",             label: "2. Market potential & relevance",         hint: "Canadian alignment + identified target customers." },
  { key: "plan",               label: "3. Project plan & deliverables",          hint: "≤6 months, clear deliverables, achievable timeline." },
  { key: "commercialization",  label: "4. Commercialization potential",          hint: "Milestones — product / validation / scale-up / regulatory / IP." },
  { key: "impact",             label: "5. Impact & follow-on potential",         hint: "Strategy for future funding, partnerships, investor interest." },
  { key: "budget",             label: "6. Budget & use of funds",                hint: "Realistic, justified, aligned with the activities." },
];

export function ReviewActions({
  applicationId, stream, stage, currentStatus,
  requestedAmount, approvedAmount, remainingCap,
  hasIpAppendix, existingScores,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState<number>(() => {
    const requested = approvedAmount ?? requestedAmount ?? 0;
    if (typeof remainingCap === "number") return Math.min(requested, remainingCap);
    return requested;
  });
  const [scores, setScores] = useState<VentureLiftReviewerScores>(existingScores ?? {});
  const [disbursement, setDisbursement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isVlStage1 = stream === "venture_lift" && stage === "pre_screen";
  const isVlStage2 = stream === "venture_lift" && stage === "full_app";
  const isVc       = stream === "venture_connect";
  const isInnovationFellowship = stream === "innovation_fellowship";
  const isSingleStage = isVc || isInnovationFellowship;

  // Compute available actions from the state-machine axes.
  const canClaim   = currentStatus === "submitted";
  const canDecide  = currentStatus === "under_review";
  const canFund    = currentStatus === "approved";
  const terminal   =
    currentStatus === "rejected" ||
    currentStatus === "funded" ||
    currentStatus === "pre_screen_rejected";

  async function act(target: EquipStatus, payload: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/equip/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target, ...payload }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Action failed");
      }
      router.refresh();
      setMode("idle");
      setNote("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Sum + mean of rubric scores for the Stage-2 reviewer summary.
  const filledScores = CRITERIA
    .map((c) => scores[c.key])
    .filter((v): v is number => typeof v === "number");
  const meanScore = filledScores.length > 0
    ? (filledScores.reduce((s, v) => s + v, 0) / filledScores.length).toFixed(1)
    : null;

  return (
    <section className="rounded-2xl border border-line bg-card p-4 space-y-3 surface-shadow">
      <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">
        Reviewer actions{" "}
        {isVlStage1 && <span className="text-emerald-700">· VL Stage 1 (pre-screening)</span>}
        {isVlStage2 && <span className="text-emerald-700">· VL Stage 2 (full application)</span>}
        {isVc       && <span className="text-brand-700">· VC</span>}
        {isInnovationFellowship && <span className="text-brand-700">· Innovation Fellowship</span>}
      </p>

      {/* Idle button row */}
      {mode === "idle" && (
        <div className="flex flex-wrap items-center gap-2">
          {canClaim && (
            <button
              type="button"
              onClick={() => act("under_review")}
              disabled={busy}
              className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-bold px-4 py-2 rounded-xl"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              Claim for review
            </button>
          )}

          {canDecide && isVlStage1 && (
            <>
              <button
                type="button"
                onClick={() => setMode("approve_stage1")}
                className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-xl"
              >
                <FastForward size={13} /> Advance to Stage 2
              </button>
              <button
                type="button"
                onClick={() => setMode("reject_stage1")}
                className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold px-4 py-2 rounded-xl"
              >
                <X size={13} /> Not selected
              </button>
            </>
          )}

          {canDecide && isVlStage2 && (
            <>
              <button
                type="button"
                onClick={() => setMode("approve_stage2")}
                className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-xl"
              >
                <Check size={13} /> Approve (Stage 2)
              </button>
              <button
                type="button"
                onClick={() => setMode("reject")}
                className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold px-4 py-2 rounded-xl"
              >
                <X size={13} /> Not selected
              </button>
            </>
          )}

          {canDecide && isSingleStage && (
            <>
              <button
                type="button"
                onClick={() => setMode("approve_vc")}
                className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-xl"
              >
                <Check size={13} /> Approve
              </button>
              <button
                type="button"
                onClick={() => setMode("reject")}
                className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold px-4 py-2 rounded-xl"
              >
                <X size={13} /> Not selected
              </button>
            </>
          )}

          {canFund && (
            <button
              type="button"
              onClick={() => setMode("fund")}
              className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold px-4 py-2 rounded-xl"
            >
              <Sparkles size={13} /> Mark funded
            </button>
          )}
          {terminal && (
            <p className="text-[11px] text-muted">This application is closed. No further actions.</p>
          )}
        </div>
      )}

      {/* VL Stage 1 — advance to Stage 2 */}
      {mode === "approve_stage1" && (
        <div className="space-y-3">
          <div className="rounded-xl bg-emerald-50/60 border border-emerald-200 p-3 text-[11px] text-emerald-900">
            Advancing this applicant to Stage 2 unlocks the full application form for them at <code className="font-mono">/equip/apply/{applicationId.slice(0, 8)}…</code>. They keep the same application id; no data is lost.
          </div>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Pre-screen reviewer note (optional)</span>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the applicant should know going into Stage 2."
              className="mt-1 w-full bg-card-solid border border-line rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <ActionRow
            primaryLabel="Confirm — advance to Stage 2"
            primaryTone="emerald"
            onPrimary={() => act("pre_screen_approved", { reviewerNote: note || undefined })}
            onCancel={() => setMode("idle")}
            busy={busy}
          />
        </div>
      )}

      {/* VL Stage 1 — reject */}
      {mode === "reject_stage1" && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Reviewer note *</span>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What's the rationale? The applicant will see this."
              className="mt-1 w-full bg-card-solid border border-line rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <ActionRow
            primaryLabel="Confirm — not selected"
            primaryTone="rose"
            onPrimary={() => act("pre_screen_rejected", { reviewerNote: note || undefined })}
            onCancel={() => setMode("idle")}
            busy={busy}
            disabled={note.trim().length === 0}
          />
        </div>
      )}

      {/* VL Stage 2 — approve with rubric */}
      {mode === "approve_stage2" && (
        <div className="space-y-3">
          {!hasIpAppendix && (
            <div className="rounded-xl bg-rose-50/60 border border-rose-300 p-3 flex items-start gap-2">
              <AlertCircle size={13} className="text-rose-700 mt-0.5 shrink-0" />
              <p className="text-[11px] text-rose-900 leading-snug">
                <strong>Eligibility gate:</strong> Appendix 3 (IP supporting documents) is not attached. Per the Reviewer Guide, at minimum a provisional patent must be on file. The approve button is disabled until the applicant uploads — message them to attach via the comment thread.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-line p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-bold text-subtle">Rubric · 6-criterion scoring</p>
            <p className="text-[10px] text-muted">Score each 1 (weak) – 5 (excellent). Mean is computed live.</p>
            <div className="space-y-2 mt-2">
              {CRITERIA.map((c) => (
                <div key={c.key} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-fg">{c.label}</p>
                    <p className="text-[10px] text-subtle">{c.hint}</p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const active = scores[c.key] === n;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setScores((s) => ({ ...s, [c.key]: n }))}
                          className={
                            "w-7 h-7 text-xs font-bold rounded-md transition-colors " +
                            (active
                              ? "bg-emerald-600 text-white"
                              : "bg-elevated text-muted hover:bg-elevated/70")
                          }
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {meanScore && (
              <p className="text-[11px] text-emerald-700 font-semibold mt-2">Mean score: {meanScore} / 5</p>
            )}
          </div>

          <label className="block">
            <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Approved amount ($)</span>
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="mt-1 w-full bg-card-solid border border-line rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
            />
            <span className="text-[10px] text-subtle">Cap: $25,000 CAD per VentureLift application.</span>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Reviewer comment</span>
            <textarea
              rows={3}
              value={scores.comment ?? ""}
              onChange={(e) => setScores((s) => ({ ...s, comment: e.target.value }))}
              placeholder="Optional summary across the six criteria."
              className="mt-1 w-full bg-card-solid border border-line rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <ActionRow
            primaryLabel="Confirm approval"
            primaryTone="emerald"
            onPrimary={() => act("approved", {
              approvedAmount: amount,
              reviewerScores: scores,
              reviewerNote: scores.comment || undefined,
            })}
            onCancel={() => setMode("idle")}
            busy={busy}
            disabled={!hasIpAppendix || filledScores.length < CRITERIA.length}
            disabledHint={!hasIpAppendix ? "Appendix 3 missing." : filledScores.length < CRITERIA.length ? "Score every criterion before approving." : undefined}
          />
        </div>
      )}

      {/* Single-stage VC / Innovation Fellowship approval */}
      {mode === "approve_vc" && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Approved amount ($)</span>
            <input
              type="number"
              min={0}
              max={typeof remainingCap === "number" ? remainingCap : undefined}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="mt-1 w-full bg-card-solid border border-line rounded-lg px-3 py-2 text-sm font-mono tabular-nums"
            />
            {typeof remainingCap === "number" && amount > remainingCap && (
              <span className="text-[11px] text-rose-700 inline-flex items-center gap-1.5 mt-1">
                <AlertCircle size={11} /> Exceeds the applicant&apos;s remaining ${remainingCap.toLocaleString()} cap. Server will reject.
              </span>
            )}
            {isInnovationFellowship && (
              <span className="mt-1 block text-[10px] text-subtle">
                The selected opportunity sets the requested stipend amount. Adjust only when the approved support differs.
              </span>
            )}
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Reviewer note (optional)</span>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What stood out? Any conditions?"
              className="mt-1 w-full bg-card-solid border border-line rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <ActionRow
            primaryLabel="Confirm approval"
            primaryTone="emerald"
            onPrimary={() => act("approved", { approvedAmount: amount, reviewerNote: note || undefined })}
            onCancel={() => setMode("idle")}
            busy={busy}
          />
        </div>
      )}

      {/* Generic reject for single-stage streams + VL Stage-2 */}
      {mode === "reject" && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Reviewer note *</span>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What's the rationale? The applicant will see this."
              className="mt-1 w-full bg-card-solid border border-line rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <ActionRow
            primaryLabel="Confirm — not selected"
            primaryTone="rose"
            onPrimary={() => act("rejected", { reviewerNote: note || undefined })}
            onCancel={() => setMode("idle")}
            busy={busy}
            disabled={note.trim().length === 0}
          />
        </div>
      )}

      {/* Fund form */}
      {mode === "fund" && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Disbursement note</span>
            <textarea
              rows={3}
              value={disbursement}
              onChange={(e) => setDisbursement(e.target.value)}
              placeholder="Reference number, transfer date, anything else worth recording."
              className="mt-1 w-full bg-card-solid border border-line rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <ActionRow
            primaryLabel="Confirm — funded"
            primaryTone="violet"
            onPrimary={() => act("funded", { disbursementNote: disbursement || undefined })}
            onCancel={() => setMode("idle")}
            busy={busy}
          />
        </div>
      )}

      {error && (
        <p className="text-[11px] text-rose-700 inline-flex items-center gap-1.5">
          <AlertCircle size={11} /> {error}
        </p>
      )}

      {/* Hint chip for Stage-2 Appendix gate when idle */}
      {mode === "idle" && isVlStage2 && canDecide && (
        <p className={"text-[11px] inline-flex items-center gap-1.5 " + (hasIpAppendix ? "text-emerald-700" : "text-rose-700")}>
          <FileCheck2 size={11} />
          {hasIpAppendix
            ? "Appendix 3 (IP supporting documents) attached — eligibility gate satisfied."
            : "Appendix 3 (IP supporting documents) missing — approve will be blocked until uploaded."}
        </p>
      )}
    </section>
  );
}

function ActionRow({
  primaryLabel, primaryTone, onPrimary, onCancel, busy, disabled, disabledHint,
}: {
  primaryLabel: string;
  primaryTone: "emerald" | "rose" | "violet";
  onPrimary: () => void;
  onCancel: () => void;
  busy: boolean;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const toneCls =
    primaryTone === "emerald" ? "bg-emerald-600 hover:bg-emerald-700" :
    primaryTone === "rose"    ? "bg-rose-600 hover:bg-rose-700" :
                                 "bg-violet-600 hover:bg-violet-700";
  return (
    <div className="flex items-center justify-end gap-2">
      {disabled && disabledHint && (
        <span className="text-[11px] text-muted italic">{disabledHint}</span>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="text-xs font-semibold text-muted hover:text-fg px-3 py-1.5"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onPrimary}
        disabled={busy || disabled}
        className={`inline-flex items-center gap-1.5 ${toneCls} disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors`}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : null}
        {primaryLabel}
      </button>
    </div>
  );
}
