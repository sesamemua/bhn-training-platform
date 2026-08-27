"use client";
/**
 * Three-step eligibility wizard. Captures:
 *   1. Applicant type (grad / postdoc / RA / founder)
 *   2. Affiliated institution (all 41 BHN partners + Other)
 *   3. Commercialization stage (exploring / building / unsure)
 *
 * Then POSTs to /api/equip/applications which either creates a new
 * draft or returns the id of an existing open draft for that stream
 * (so refresh tolerance is built in). Forwards to
 * /equip/apply/[id] on success.
 *
 * The "unsure" branch offers a one-line description input + an
 * inline explanation of both streams so the applicant picks
 * informed — never a wrong answer.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Beaker, Rocket, Loader2, ArrowRight, CheckCircle2 } from "lucide-react";
import {
  STREAM_META,
  recommendStream,
  type ApplicantRole,
  type CommercializationStage,
  type EquipStream,
} from "@/lib/equip/types";
import { INSTITUTIONS, isEligibleForStream, findInstitution } from "@/lib/equip/institutions";

// Roles match the EQUIP VentureConnect application form PDF
// (Master's Student / PhD Student / Postdoctoral Fellow / Research
// Associate). The VL pre-screening PDF groups Master's + PhD as
// "Graduate Student" — the LiftForm renders that coarser grouping
// while the wizard stores the finer-grained value here.
const APPLICANT_OPTIONS: { id: ApplicantRole; label: string; hint: string }[] = [
  { id: "master_student",     label: "Master's Student",       hint: "MSc / MASc / etc." },
  { id: "phd_student",        label: "PhD Student",            hint: "Doctoral candidate" },
  { id: "postdoc",             label: "Postdoctoral Fellow",   hint: "Post-PhD researcher" },
  { id: "research_associate",  label: "Research Associate",    hint: "Reviewed case-by-case" },
];

const STAGE_OPTIONS: { id: CommercializationStage; label: string; hint: string; stream: EquipStream | null }[] = [
  {
    id: "exploring",
    label: "Exploring",
    hint: "I need help getting to a conference, demo day, or pitch event — fund my next move.",
    stream: "venture_connect",
  },
  {
    id: "building",
    label: "Building",
    hint: "I have IP, a prototype, or an accelerator spot — fund the next 1-6 months of work.",
    stream: "venture_lift",
  },
  {
    id: "unsure",
    label: "Not sure",
    hint: "I'll describe what I'm working on and you suggest a fit.",
    stream: null,
  },
];

export function EligibilityWizard({
  presetStream,
  presetInstitution,
  presetInstitutionOther,
}: {
  presetStream?: EquipStream;
  /** Pre-pick the institution step from the user's stored
   *  organization (set at registration). The user can still
   *  change it inside the wizard. */
  presetInstitution?: string;
  presetInstitutionOther?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [applicantType, setApplicantType] = useState<ApplicantRole | null>(null);
  const [institution, setInstitution] = useState<string | null>(presetInstitution ?? null);
  const [institutionOther, setInstitutionOther] = useState(presetInstitutionOther ?? "");
  const [stage, setStage] = useState<CommercializationStage | null>(null);
  const [pickedStream, setPickedStream] = useState<EquipStream | null>(presetStream ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If presetStream was passed (e.g. landing-page card), we skip
  // straight to the create step once eligibility is filled — the
  // user already told us their stream.
  const stageStream = stage ? STAGE_OPTIONS.find((s) => s.id === stage)?.stream ?? null : null;
  const recommended = stage ? recommendStream(stage) : null;
  const effectiveStream = presetStream ?? pickedStream ?? recommended;

  /*
   * VentureConnect is open to all 41 partner institutions; VentureLift
   * only to the 14 "current"-tier ones. The institution is chosen two
   * steps BEFORE the stream, so this is the first moment the pair can
   * be judged — and saying nothing would walk somebody from, say,
   * McMaster all the way into a $25,000 form they cannot be funded for.
   *
   * Six of the ineligible institutions are in Ontario, so this can
   * never be phrased as an out-of-province rule.
   */
  const streamBlocked =
    effectiveStream === "venture_lift" &&
    institution !== null &&
    institution !== "other" &&
    !isEligibleForStream(institution, "venture_lift");
  const blockedName = streamBlocked ? findInstitution(institution)?.name : null;

  const canContinue =
    step === 0 ? applicantType !== null :
    step === 1 ? institution !== null && (institution !== "other" || institutionOther.trim().length > 0) :
    step === 2 ? (stage !== null && (stageStream !== null || pickedStream !== null)) :
                 false;

  async function create() {
    if (!effectiveStream) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/equip/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stream: effectiveStream,
          applicantType,
          institution,
          institutionOther: institution === "other" ? institutionOther.trim() : null,
          commercializationStage: stage,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Could not start application");
      }
      const j = (await res.json()) as { id: string };
      router.push(`/equip/apply/${j.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-5 surface-shadow space-y-5">
      <Progress step={step} total={3} />

      {step === 0 && (
        <Step
          title="Who are you?"
          subtitle="We use this to confirm eligibility — research associates are case-by-case."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {APPLICANT_OPTIONS.map((opt) => (
              <OptionTile
                key={opt.id}
                selected={applicantType === opt.id}
                onClick={() => setApplicantType(opt.id)}
                label={opt.label}
                hint={opt.hint}
              />
            ))}
          </div>
        </Step>
      )}

      {step === 1 && (
        <Step
          title="Where are you affiliated?"
          subtitle="Your innovation must be based in Canada with IP owned or licensed by a Canadian entity."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {INSTITUTIONS.map((inst) => (
              <OptionTile
                key={inst.slug}
                selected={institution === inst.slug}
                onClick={() => setInstitution(inst.slug)}
                label={inst.name}
                hint={inst.shortName ?? ""}
              />
            ))}
            <OptionTile
              selected={institution === "other"}
              onClick={() => setInstitution("other")}
              label="Other"
              hint="Reviewed case-by-case"
            />
          </div>
          {institution === "other" && (
            <input
              value={institutionOther}
              onChange={(e) => setInstitutionOther(e.target.value)}
              placeholder="Name of your institution"
              className="mt-3 w-full bg-card-solid border border-line rounded-lg px-3 py-2 text-sm text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
            />
          )}
        </Step>
      )}

      {step === 2 && (
        <Step
          title="Where are you on the journey?"
          subtitle="This routes you to the right funding envelope."
        >
          <div className="space-y-2">
            {STAGE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setStage(opt.id);
                  if (opt.stream) setPickedStream(null); // let the recommendation drive
                }}
                className={
                  "w-full text-left rounded-xl border p-3 transition-colors " +
                  (stage === opt.id
                    ? "border-brand-500 bg-brand-50/40 ring-2 ring-brand-500/30"
                    : "border-line hover:bg-elevated/60")
                }
              >
                <p className="text-sm font-bold text-fg inline-flex items-center gap-2">
                  {opt.stream === "venture_lift" ? <Rocket size={13} /> : opt.stream === "venture_connect" ? <Beaker size={13} /> : null}
                  {opt.label}
                </p>
                <p className="text-[11px] text-muted leading-snug mt-1">{opt.hint}</p>
              </button>
            ))}
          </div>
          {stage === "unsure" && (
            <div className="mt-3 rounded-xl border border-line bg-elevated/40 p-3 space-y-2">
              <p className="text-xs font-bold text-fg">Both options at a glance:</p>
              <p className="text-[11px] text-muted">
                <strong className="text-fg">{STREAM_META.venture_connect.name}</strong> · {STREAM_META.venture_connect.bestFor}
              </p>
              <p className="text-[11px] text-muted">
                <strong className="text-fg">{STREAM_META.venture_lift.name}</strong> · {STREAM_META.venture_lift.bestFor}
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPickedStream("venture_connect")}
                  className={
                    "flex-1 text-xs font-bold px-3 py-1.5 rounded-lg ring-1 ring-inset transition-colors " +
                    (pickedStream === "venture_connect"
                      ? "bg-brand-600 text-white ring-brand-600"
                      : "bg-card-solid text-fg ring-line hover:bg-elevated")
                  }
                >
                  Pick VentureConnect
                </button>
                <button
                  type="button"
                  onClick={() => setPickedStream("venture_lift")}
                  className={
                    "flex-1 text-xs font-bold px-3 py-1.5 rounded-lg ring-1 ring-inset transition-colors " +
                    (pickedStream === "venture_lift"
                      ? "bg-brand-600 text-white ring-brand-600"
                      : "bg-card-solid text-fg ring-line hover:bg-elevated")
                  }
                >
                  Pick VentureLift
                </button>
              </div>
            </div>
          )}
        </Step>
      )}

      {streamBlocked && step === 2 && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-bold text-amber-900">
            VentureLift isn&apos;t open to {blockedName} yet
          </p>
          <p className="text-[11px] text-amber-800 leading-snug mt-1">
            VentureLift runs at 14 partner institutions through March 2028.
            VentureConnect &mdash; up to $5,000 &mdash; is open to all 41 BioHubNet
            partners, including yours, until January 2027.
          </p>
          <button
            type="button"
            onClick={() => setPickedStream("venture_connect")}
            className="mt-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
          >
            Switch to VentureConnect
          </button>
        </div>
      )}

      {effectiveStream && step === 2 && stage !== "unsure" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 flex items-start gap-2">
          <CheckCircle2 size={15} className="text-emerald-700 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-emerald-900">
              We&apos;ll route you to {STREAM_META[effectiveStream].name}
            </p>
            <p className="text-[11px] text-emerald-800 mt-0.5 leading-snug">
              {STREAM_META[effectiveStream].blurb} You can change streams on the next screen if needed.
            </p>
          </div>
        </div>
      )}

      {error && (
        <p className="text-[11px] text-rose-700">{error}</p>
      )}

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-line">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="text-xs font-semibold text-muted hover:text-fg disabled:opacity-40 px-3 py-1.5"
        >
          Back
        </button>
        {step < 2 ? (
          <button
            type="button"
            disabled={!canContinue}
            onClick={() => setStep((s) => s + 1)}
            className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors"
          >
            Next <ArrowRight size={13} />
          </button>
        ) : (
          <button
            type="button"
            disabled={!canContinue || submitting}
            onClick={create}
            className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors"
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : null}
            Open the form <ArrowRight size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function Progress({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={
            "h-1.5 flex-1 rounded-full transition-colors " +
            (i <= step ? "bg-brand-500" : "bg-elevated")
          }
        />
      ))}
    </div>
  );
}

function Step({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-fg">{title}</h2>
        <p className="text-[11px] text-muted leading-snug mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function OptionTile({
  selected, onClick, label, hint,
}: { selected: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "text-left rounded-xl border px-3 py-2 transition-colors " +
        (selected
          ? "border-brand-500 bg-brand-50/40 ring-2 ring-brand-500/30"
          : "border-line hover:bg-elevated/60")
      }
    >
      <p className="text-xs font-bold text-fg">{label}</p>
      {hint && <p className="text-[10px] text-muted mt-0.5">{hint}</p>}
    </button>
  );
}
