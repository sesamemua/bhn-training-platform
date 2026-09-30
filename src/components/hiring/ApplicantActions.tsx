"use client";
/**
 * Applicant detail action surface.
 *
 * Three vertical sections rendered in flow:
 *
 *   1. Stage transitions — buttons for every legal next stage.
 *   2. Interview scheduling + scoring — propose slots when there's
 *      no active interview; show the proposal / accepted state when
 *      one exists; reveal a scoring form once the interview has
 *      happened.
 *   3. Offer — composer with a template picker, draft autosave,
 *      send action. Read-only summary once sent + the trainee's
 *      response (when received).
 *
 * Each section is self-contained — they can independently fire API
 * calls. The parent page revalidates with router.refresh() after
 * each action.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar, Send, ChevronRight, Loader2, Check, X, AlertCircle,
  ClipboardCheck, FileEdit, MessageSquare, Briefcase,
} from "lucide-react";
import { OFFER_TEMPLATES, getOfferTemplate, renderOfferTemplate } from "@/lib/hiring/offer-templates";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
// Import from the pure metadata module — NOT from transitions.ts —
// because transitions.ts pulls nodemailer through mail.ts, which would
// break this client bundle ("Module not found: Can't resolve 'tls'").
import { STAGE_LABELS, type Stage } from "@/lib/hiring/stages";

interface InterviewView {
  id: string;
  status: string;
  format: string | null;
  location: string | null;
  notes: string | null;
  proposedSlots: string[];
  acceptedSlot: string | null;
  scheduledByName: string | null;
  createdAt: string;
  scores: Array<{
    id: string;
    scorerName: string | null;
    overallScore: number;
    recommendation: string;
    strengths: string | null;
    concerns: string | null;
  }>;
}

interface OfferView {
  id: string;
  status: string;
  body: string;
  templateKey: string | null;
  compensation: string | null;
  startDate: string | null;
  endDate: string | null;
  hoursPerWeek: string | null;
  location: string | null;
  acceptDeadline: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  declineReason: string | null;
}

interface Props {
  applicationStatusId: string;
  currentStage: Stage;
  legalNextStages: Stage[];
  postingSkills: Array<{ id: string; name: string; required: boolean }>;
  applicantName: string;
  companyName: string;
  postingTitle: string;
  existingOffer: OfferView | null;
  interviews: InterviewView[];
  currentScorerUserId: string;
  employerNote: string | null;
  rejectionReason: string | null;
  rating: number | null;
}

export function ApplicantActions(props: Props) {
  return (
    <div className="space-y-5">
      <StageSection
        applicationStatusId={props.applicationStatusId}
        currentStage={props.currentStage}
        legalNextStages={props.legalNextStages}
        applicantName={props.applicantName}
      />
      <InterviewSection
        applicationStatusId={props.applicationStatusId}
        interviews={props.interviews}
        postingSkills={props.postingSkills}
        currentScorerUserId={props.currentScorerUserId}
      />
      <OfferSection
        applicationStatusId={props.applicationStatusId}
        existingOffer={props.existingOffer}
        applicantName={props.applicantName}
        companyName={props.companyName}
        postingTitle={props.postingTitle}
      />
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
   Section 1 — stage transitions
   ═════════════════════════════════════════════════════════════ */

function StageSection({
  applicationStatusId,
  currentStage,
  legalNextStages,
  applicantName,
}: {
  applicationStatusId: string;
  currentStage: Stage;
  legalNextStages: Stage[];
  applicantName: string;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [showReason, setShowReason] = useState(false);
  const [targetStage, setTargetStage] = useState<Stage | null>(null);

  async function transition(toStage: Stage, withReason?: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/employer/applications/${applicationStatusId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStage, rejectionReason: withReason }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Transition failed");
        return;
      }
      setShowReason(false);
      setReason("");
      setTargetStage(null);
      router.refresh();
    });
  }

  function startTransitionWithReason(toStage: Stage) {
    setTargetStage(toStage);
    setShowReason(true);
  }

  const passingStages: Stage[] = ["passed", "withdrawn"];

  return (
    <section className="rounded-2xl border border-line bg-card p-5 surface-shadow">
      <header className="mb-3">
        <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">Stage</p>
        <h2 className="text-base font-bold text-fg mt-0.5">
          Currently <span className="text-brand-700">{STAGE_LABELS[currentStage]}</span>
        </h2>
      </header>
      {legalNextStages.length === 0 ? (
        <p className="text-sm text-muted italic">Terminal stage — no further transitions.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {legalNextStages.map((s) => {
            const isPassing = passingStages.includes(s);
            return (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() =>
                  isPassing ? startTransitionWithReason(s) : transition(s)
                }
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${
                  isPassing
                    ? "bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200 hover:bg-rose-100"
                    : "bg-brand-600 text-white hover:bg-brand-700"
                }`}
              >
                {busy && targetStage === s ? <Loader2 size={11} className="animate-spin" /> : <ChevronRight size={11} />}
                Move to {STAGE_LABELS[s]}
              </button>
            );
          })}
        </div>
      )}
      {showReason && targetStage && (
        <div className="mt-3 rounded-xl bg-amber-50 ring-1 ring-inset ring-amber-200 p-3 space-y-2">
          <p className="text-xs font-bold text-amber-900">
            Moving {applicantName} to {STAGE_LABELS[targetStage]}
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional reason — sent to the applicant in the transition email if provided."
            rows={2}
            className="w-full bg-card border border-line rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-y"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setShowReason(false);
                setTargetStage(null);
                setReason("");
              }}
              className="text-xs text-muted hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => transition(targetStage, reason)}
              className="text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 px-3 py-1.5 rounded-lg disabled:opacity-50"
            >
              Confirm
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="mt-3 text-xs text-rose-700 bg-rose-50 ring-1 ring-inset ring-rose-200 rounded-lg px-3 py-2 inline-flex items-start gap-2">
          <AlertCircle size={11} className="mt-0.5" /> {error}
        </p>
      )}
    </section>
  );
}

/* ═════════════════════════════════════════════════════════════
   Section 2 — interview scheduling + scoring
   ═════════════════════════════════════════════════════════════ */

function InterviewSection({
  applicationStatusId,
  interviews,
  postingSkills,
  currentScorerUserId,
}: {
  applicationStatusId: string;
  interviews: InterviewView[];
  postingSkills: Array<{ id: string; name: string; required: boolean }>;
  currentScorerUserId: string;
}) {
  const [showPropose, setShowPropose] = useState(false);
  const activeInterview = interviews.find((i) => i.status !== "completed" && i.status !== "cancelled");
  const pastInterviews = interviews.filter((i) => i.status === "completed");

  return (
    <section className="rounded-2xl border border-line bg-card p-5 surface-shadow">
      <header className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">Interview</p>
          <h2 className="text-base font-bold text-fg mt-0.5 inline-flex items-center gap-2">
            <Calendar size={14} className="text-brand-600" />
            Schedule + score
          </h2>
        </div>
        {!activeInterview && (
          <button
            type="button"
            onClick={() => setShowPropose(true)}
            className="text-xs font-bold rounded-lg bg-brand-600 text-white hover:bg-brand-700 px-3 py-1.5"
          >
            Propose slots
          </button>
        )}
      </header>

      {showPropose && (
        <ProposeSlotsForm
          applicationStatusId={applicationStatusId}
          onClose={() => setShowPropose(false)}
        />
      )}

      {activeInterview && !showPropose && (
        <InterviewSummary interview={activeInterview} postingSkills={postingSkills} currentScorerUserId={currentScorerUserId} />
      )}

      {pastInterviews.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-subtle">
            Past interviews ({pastInterviews.length})
          </p>
          {pastInterviews.map((i) => (
            <details key={i.id} className="rounded-lg border border-line p-3">
              <summary className="cursor-pointer text-sm font-semibold text-fg">
                {i.format ?? "interview"} on{" "}
                {i.acceptedSlot
                  ? new Date(i.acceptedSlot).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })
                  : "—"}
                {" · "}
                {i.scores.length} score{i.scores.length === 1 ? "" : "s"}
              </summary>
              {i.scores.length > 0 && (
                <div className="mt-2 space-y-2">
                  {i.scores.map((s) => (
                    <ScoreView key={s.id} score={s} />
                  ))}
                </div>
              )}
            </details>
          ))}
        </div>
      )}

      {!activeInterview && pastInterviews.length === 0 && !showPropose && (
        <p className="text-sm text-muted italic">No interviews yet. Propose 1–5 time slots above to get started.</p>
      )}
    </section>
  );
}

function ProposeSlotsForm({
  applicationStatusId,
  onClose,
}: {
  applicationStatusId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [slots, setSlots] = useState<string[]>([""]);
  const [format, setFormat] = useState<"phone" | "video" | "onsite">("video");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateSlot(idx: number, v: string) {
    setSlots((s) => s.map((x, i) => (i === idx ? v : x)));
  }
  function addSlot() {
    if (slots.length < 5) setSlots((s) => [...s, ""]);
  }
  function removeSlot(idx: number) {
    setSlots((s) => s.filter((_, i) => i !== idx));
  }

  async function submit() {
    setError(null);
    const clean = slots.filter((s) => s).map((s) => new Date(s).toISOString());
    if (clean.length === 0) {
      setError("Add at least one slot.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/employer/applications/${applicationStatusId}/interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposedSlots: clean, format, location, notes }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Propose failed");
      router.refresh();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 mt-2 rounded-xl bg-brand-50 ring-1 ring-inset ring-brand-200 p-4">
      <p className="text-sm font-bold text-brand-900">Propose interview slots</p>
      <div className="space-y-2">
        {slots.map((slot, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={slot}
              onChange={(e) => updateSlot(i, e.target.value)}
              className="flex-1 bg-card border border-line rounded-lg px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
            />
            {slots.length > 1 && (
              <button
                type="button"
                onClick={() => removeSlot(i)}
                className="text-rose-700 hover:bg-rose-50 p-1 rounded"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}
        {slots.length < 5 && (
          <button
            type="button"
            onClick={addSlot}
            className="text-xs font-semibold text-brand-700 hover:underline"
          >
            + Another slot
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[0.18em] text-subtle mb-1">
            Format
          </label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as "phone" | "video" | "onsite")}
            className="w-full bg-card border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            <option value="phone">Phone</option>
            <option value="video">Video</option>
            <option value="onsite">Onsite</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[0.18em] text-subtle mb-1">
            Location / URL
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={format === "video" ? "Zoom / Meet link" : format === "onsite" ? "Address" : "Phone number"}
            className="w-full bg-card border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
      </div>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-[0.18em] text-subtle mb-1">
          Notes for the candidate (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="What to expect, who they'll meet, prep materials, etc."
          className="w-full bg-card border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-y"
        />
      </div>
      {error && (
        <p className="text-xs text-rose-700 bg-rose-50 ring-1 ring-inset ring-rose-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="text-xs text-muted hover:text-fg">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="inline-flex items-center gap-1.5 text-xs font-bold rounded-lg bg-brand-600 text-white hover:bg-brand-700 px-3 py-1.5 disabled:opacity-50"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
          Send proposal
        </button>
      </div>
    </div>
  );
}

function InterviewSummary({
  interview,
  postingSkills,
  currentScorerUserId,
}: {
  interview: InterviewView;
  postingSkills: Array<{ id: string; name: string; required: boolean }>;
  currentScorerUserId: string;
}) {
  void currentScorerUserId; // future use for "is my score in?"
  const [showScore, setShowScore] = useState(false);
  return (
    <div className="space-y-3 mt-2">
      <div className="rounded-xl bg-elevated p-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-subtle mb-1">
          Status
        </p>
        <p className="text-sm text-fg">
          <strong>{interview.status}</strong> · {interview.format ?? "format TBA"}
          {interview.acceptedSlot && (
            <>
              {" · "}
              <Calendar size={11} className="inline -mt-0.5 mr-0.5" />
              {new Date(interview.acceptedSlot).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}
            </>
          )}
        </p>
        {interview.location && (
          <p className="text-xs text-muted mt-1">{interview.location}</p>
        )}
        {interview.status === "proposed" && interview.proposedSlots.length > 0 && (
          <div className="mt-2">
            <p className="text-[10px] text-subtle">Proposed slots, awaiting candidate:</p>
            <ul className="text-xs text-fg space-y-0.5 mt-1">
              {interview.proposedSlots.map((s, i) => (
                <li key={i} className="font-mono">
                  · {new Date(s).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {interview.status === "accepted" && (
        <button
          type="button"
          onClick={() => setShowScore(true)}
          className="text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 px-3 py-1.5 inline-flex items-center gap-1.5"
        >
          <ClipboardCheck size={11} /> Add interview score
        </button>
      )}
      {showScore && (
        <ScoreForm
          interviewId={interview.id}
          applicationStatusId={interview.id}
          postingSkills={postingSkills}
          onClose={() => setShowScore(false)}
        />
      )}
      {interview.scores.length > 0 && (
        <div className="space-y-2">
          {interview.scores.map((s) => (
            <ScoreView key={s.id} score={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreForm({
  interviewId,
  applicationStatusId,
  postingSkills,
  onClose,
}: {
  interviewId: string;
  applicationStatusId: string;
  postingSkills: Array<{ id: string; name: string; required: boolean }>;
  onClose: () => void;
}) {
  void applicationStatusId;
  const router = useRouter();
  const [overallScore, setOverallScore] = useState(3);
  const [recommendation, setRecommendation] = useState<"hire" | "maybe" | "pass">("maybe");
  const [skillScores, setSkillScores] = useState<Record<string, number>>({});
  const [strengths, setStrengths] = useState("");
  const [concerns, setConcerns] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/employer/applications/${applicationStatusId}/interview-score`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            interviewId,
            overallScore,
            recommendation,
            skillScores,
            strengths,
            concerns,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Score save failed");
      router.refresh();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-brand-50 ring-1 ring-inset ring-brand-200 p-4 space-y-3">
      <p className="text-sm font-bold text-brand-900">Interview score</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[0.18em] text-subtle mb-1">
            Overall (1–5)
          </label>
          <input
            type="number"
            min={1}
            max={5}
            value={overallScore}
            onChange={(e) => setOverallScore(Number(e.target.value))}
            className="w-full bg-card border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[0.18em] text-subtle mb-1">
            Recommendation
          </label>
          <select
            value={recommendation}
            onChange={(e) => setRecommendation(e.target.value as "hire" | "maybe" | "pass")}
            className="w-full bg-card border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            <option value="hire">Hire</option>
            <option value="maybe">Maybe</option>
            <option value="pass">Pass</option>
          </select>
        </div>
      </div>
      {postingSkills.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-subtle mb-1">
            Per-skill scores (1–5, optional)
          </p>
          <div className="grid grid-cols-2 gap-2">
            {postingSkills.slice(0, 8).map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <label className="text-xs text-fg flex-1 truncate" title={s.name}>
                  {s.name}{s.required && "*"}
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={skillScores[s.id] ?? ""}
                  onChange={(e) =>
                    setSkillScores((p) => ({
                      ...p,
                      [s.id]: Number(e.target.value),
                    }))
                  }
                  className="w-14 bg-card border border-line rounded px-2 py-1 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-[0.18em] text-subtle mb-1">
          Strengths
        </label>
        <textarea
          value={strengths}
          onChange={(e) => setStrengths(e.target.value)}
          rows={2}
          className="w-full bg-card border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-y"
        />
      </div>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-[0.18em] text-subtle mb-1">
          Concerns
        </label>
        <textarea
          value={concerns}
          onChange={(e) => setConcerns(e.target.value)}
          rows={2}
          className="w-full bg-card border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-y"
        />
      </div>
      {error && (
        <p className="text-xs text-rose-700 bg-rose-50 ring-1 ring-inset ring-rose-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="text-xs text-muted hover:text-fg">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="inline-flex items-center gap-1.5 text-xs font-bold rounded-lg bg-brand-600 text-white hover:bg-brand-700 px-3 py-1.5 disabled:opacity-50"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          Save score
        </button>
      </div>
    </div>
  );
}

function ScoreView({
  score,
}: {
  score: {
    id: string;
    scorerName: string | null;
    overallScore: number;
    recommendation: string;
    strengths: string | null;
    concerns: string | null;
  };
}) {
  const recColor =
    score.recommendation === "hire"
      ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
      : score.recommendation === "maybe"
        ? "bg-amber-100 text-amber-800 ring-amber-200"
        : "bg-rose-100 text-rose-800 ring-rose-200";
  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-bold text-fg inline-flex items-center gap-2">
          <MessageSquare size={11} className="text-brand-600" />
          {score.scorerName ?? "Anonymous"} · Overall {score.overallScore}/5
        </p>
        <span className={`inline-flex items-center text-[9px] font-bold uppercase tracking-[0.18em] px-1.5 py-0.5 rounded-full ring-1 ring-inset ${recColor}`}>
          {score.recommendation}
        </span>
      </div>
      {score.strengths && (
        <p className="text-xs text-fg mt-1.5 leading-snug">
          <span className="text-emerald-700 font-semibold">Strengths:</span> {score.strengths}
        </p>
      )}
      {score.concerns && (
        <p className="text-xs text-fg mt-1 leading-snug">
          <span className="text-rose-700 font-semibold">Concerns:</span> {score.concerns}
        </p>
      )}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
   Section 3 — offer composer
   ═════════════════════════════════════════════════════════════ */

function OfferSection({
  applicationStatusId,
  existingOffer,
  applicantName,
  companyName,
  postingTitle,
}: {
  applicationStatusId: string;
  existingOffer: OfferView | null;
  applicantName: string;
  companyName: string;
  postingTitle: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateKey, setTemplateKey] = useState(existingOffer?.templateKey ?? "paid-internship");
  const [body, setBody] = useState(existingOffer?.body ?? "");
  const [compensation, setCompensation] = useState(existingOffer?.compensation ?? "");
  const [startDate, setStartDate] = useState(existingOffer?.startDate?.slice(0, 10) ?? "");
  const [endDate, setEndDate] = useState(existingOffer?.endDate?.slice(0, 10) ?? "");
  const [hoursPerWeek, setHoursPerWeek] = useState(existingOffer?.hoursPerWeek ?? "");
  const [location, setLocation] = useState(existingOffer?.location ?? "");
  const [acceptDeadline, setAcceptDeadline] = useState(existingOffer?.acceptDeadline?.slice(0, 10) ?? "");
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  // When the user picks a template, render its body with the form
  // values + applicant context. If body is already non-empty (e.g.
  // they typed manual edits), we don't overwrite without confirm.
  async function applyTemplate(key: string) {
    setTemplateKey(key);
    const tmpl = getOfferTemplate(key);
    if (!tmpl) return;
    if (body.trim() && !(await confirmDialog({ title: "Replace your current draft with the template body?", confirmLabel: "Replace", tone: "warning" }))) return;
    setBody(
      renderOfferTemplate(tmpl.body, {
        traineeName: applicantName,
        companyName,
        postingTitle,
        compensation: compensation || "TBD",
        startDate: startDate || "TBD",
        endDate: endDate || "TBD",
        hoursPerWeek: hoursPerWeek || "TBD",
        location: location || "TBD",
        acceptDeadline: acceptDeadline || "TBD",
        employerName: companyName,
      }),
    );
  }

  async function save(send: boolean) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/employer/applications/${applicationStatusId}/offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateKey,
          body,
          compensation,
          startDate,
          endDate,
          hoursPerWeek,
          location,
          acceptDeadline,
          send,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      router.refresh();
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (existingOffer && existingOffer.status !== "draft" && !editing) {
    return (
      <section className="rounded-2xl border border-line bg-card p-5 surface-shadow">
        <header className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">Offer</p>
            <h2 className="text-base font-bold text-fg mt-0.5 inline-flex items-center gap-2">
              <Briefcase size={14} className="text-brand-600" />
              {existingOffer.status === "accepted"
                ? "Accepted"
                : existingOffer.status === "declined"
                  ? "Declined"
                  : existingOffer.status === "expired"
                    ? "Expired"
                    : "Sent"}
            </h2>
          </div>
          {existingOffer.status === "sent" && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs font-semibold text-muted hover:text-fg"
            >
              <FileEdit size={11} className="inline -mt-0.5 mr-0.5" /> Edit
            </button>
          )}
        </header>
        <pre className="text-xs text-fg leading-relaxed whitespace-pre-wrap bg-elevated/40 p-4 rounded-lg max-h-96 overflow-y-auto">
          {existingOffer.body}
        </pre>
        {existingOffer.declineReason && (
          <div className="mt-3 rounded-lg bg-rose-50 ring-1 ring-inset ring-rose-200 p-3">
            <p className="text-xs font-bold text-rose-900">Candidate's reason for declining</p>
            <p className="text-xs text-rose-900 mt-1">{existingOffer.declineReason}</p>
          </div>
        )}
        <p className="text-[10px] text-subtle mt-3">
          {existingOffer.sentAt && `Sent ${new Date(existingOffer.sentAt).toLocaleString("en-CA")}`}
          {existingOffer.respondedAt && ` · responded ${new Date(existingOffer.respondedAt).toLocaleString("en-CA")}`}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-5 surface-shadow">
      {confirmNode}
      <header className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">Offer</p>
          <h2 className="text-base font-bold text-fg mt-0.5 inline-flex items-center gap-2">
            <Briefcase size={14} className="text-brand-600" />
            {existingOffer ? "Draft" : "Compose offer"}
          </h2>
        </div>
      </header>

      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[0.18em] text-subtle mb-1">
            Template
          </label>
          <select
            value={templateKey}
            onChange={(e) => applyTemplate(e.target.value)}
            className="w-full bg-card border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            {OFFER_TEMPLATES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          <p className="text-[10px] text-subtle mt-1">
            {getOfferTemplate(templateKey)?.description ?? ""}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Compensation" value={compensation} onChange={setCompensation} placeholder="$22/hr · $5k stipend · etc." />
          <Field label="Hours / week" value={hoursPerWeek} onChange={setHoursPerWeek} placeholder="40 hrs/wk" />
          <Field label="Start date" value={startDate} onChange={setStartDate} type="date" />
          <Field label="End date" value={endDate} onChange={setEndDate} type="date" />
          <Field label="Location" value={location} onChange={setLocation} placeholder="Toronto · remote" />
          <Field label="Respond by" value={acceptDeadline} onChange={setAcceptDeadline} type="date" />
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[0.18em] text-subtle mb-1">
            Body (markdown · {body.length}/16000)
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            placeholder="Pick a template above to seed the body, then edit."
            className="w-full bg-card border border-line rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-y font-mono leading-relaxed"
          />
        </div>

        {error && (
          <p className="text-xs text-rose-700 bg-rose-50 ring-1 ring-inset ring-rose-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2 justify-end">
          {editing && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs text-muted hover:text-fg"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={busy || body.length < 80}
            onClick={() => save(false)}
            className="text-xs font-bold rounded-lg border border-line bg-card text-fg hover:bg-elevated px-3 py-1.5 disabled:opacity-50"
          >
            Save draft
          </button>
          <button
            type="button"
            disabled={busy || body.length < 80}
            onClick={() => save(true)}
            className="inline-flex items-center gap-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 px-3 py-1.5 disabled:opacity-50"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
            Send offer
          </button>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  type?: "text" | "date";
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-[0.18em] text-subtle mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-card border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      />
    </div>
  );
}
