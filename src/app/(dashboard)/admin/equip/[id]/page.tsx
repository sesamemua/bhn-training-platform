/**
 * /admin/equip/[id] — reviewer decision surface.
 *
 * Server component renders the application data; the decision
 * actions (claim / approve / reject / fund) live in the client
 * ReviewActions component below.
 */
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, FileText, User as UserIcon, MapPin, Briefcase, Mail } from "lucide-react";
import { requireCommitteeOrAdmin } from "@/lib/committees/membership";
import { prisma } from "@/lib/prisma";
import { DSPageHeader } from "@/components/design-system/DSPageHeader";
import { DSSection } from "@/components/design-system/DSSection";
import { ReviewActions } from "@/components/admin/equip/ReviewActions";
import { TriageSummary } from "@/components/admin/equip/TriageSummary";
import { MessageThread } from "@/components/equip/MessageThread";
import { MilestoneTracker } from "@/components/equip/MilestoneTracker";
import { STREAM_BUDGETS, type EquipMilestone } from "@/lib/equip/types";
import {
  STREAM_META, STATUS_META,
  type EquipStatus, type EquipStream, type ApplicationStage,
  type VentureConnectFormData, type VentureLiftFormData, type VentureLiftFullData,
  type VentureLiftReviewerScores, type EquipDocument,
} from "@/lib/equip/types";
import { institutionLabel } from "@/lib/equip/institutions";
import { applicantOf } from "@/lib/equip/applicant";

export const dynamic = "force-dynamic";

export default async function AdminEquipReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireCommitteeOrAdmin(["equip_review"], ["equip_grant_reviewer"]).catch(() => null);
  if (!session) redirect("/dashboard");
  const reviewerUserId = (session.user as { id?: string })?.id ?? "";
  const { id } = await params;

  const app = await prisma.equipApplication.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, organization: true, jobTitle: true, country: true, phone: true } },
      reviewer: { select: { id: true, name: true } },
    },
  });
  if (!app) notFound();

  // Funding history (VentureConnect only) — per the PDF, each
  // applicant/company tops out at $5,000 CAD cumulative across
  // their applications. Aggregate prior approved + funded apps
  // so the reviewer can see how much room is left BEFORE making
  // a call.
  let vcHistory: { previouslyApproved: number; remaining: number; prior: { id: string; status: string; amount: number; decidedAt: Date | null }[] } | null = null;
  if (app.stream === "venture_connect") {
    const prior = await prisma.equipApplication.findMany({
      where: {
        userId: app.userId,
        stream: "venture_connect",
        id: { not: app.id },
        status: { in: ["approved", "funded"] },
      },
      orderBy: { decidedAt: "desc" },
      select: { id: true, status: true, approvedAmount: true, decidedAt: true },
    });
    const previouslyApproved = prior.reduce<number>((s, p) => s + (p.approvedAmount ?? 0), 0);
    vcHistory = {
      previouslyApproved,
      remaining: Math.max(0, STREAM_BUDGETS.venture_connect - previouslyApproved),
      prior: prior.map((p) => ({ id: p.id, status: p.status, amount: p.approvedAmount ?? 0, decidedAt: p.decidedAt })),
    };
  }

  const stream = STREAM_META[app.stream as EquipStream];
  const status = STATUS_META[app.status as EquipStatus];
  const formData = (app.formData as VentureConnectFormData) ?? {};

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Back-link removed — the editorial hero owns the top of the
          page; sidebar handles cross-page navigation. */}
      <DSPageHeader
        eyebrow={`${stream.name} · ${status.label.toLowerCase()}`}
        title={`Review: ${applicantOf(app).name}`}
        description={
          <>
            Submitted {app.submittedAt ? new Date(app.submittedAt).toLocaleString() : "—"}.
            {" "}Requested {app.requestedAmount ? `$${app.requestedAmount.toLocaleString()}` : "—"}.
            {app.approvedAmount ? ` Approved $${app.approvedAmount.toLocaleString()}.` : ""}
          </>
        }
      />

      <ReviewActions
        applicationId={app.id}
        stream={app.stream as EquipStream}
        stage={app.applicationStage as ApplicationStage}
        currentStatus={app.status as EquipStatus}
        requestedAmount={app.requestedAmount}
        approvedAmount={app.approvedAmount}
        remainingCap={vcHistory?.remaining ?? null}
        hasIpAppendix={((app.documents as unknown as EquipDocument[]) ?? []).some((d) => d.kind === "ip_doc")}
        existingScores={app.reviewerScores as VentureLiftReviewerScores | null}
      />

      {vcHistory && (
        <section className="rounded-2xl border border-line bg-card p-4 surface-shadow">
          <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">
            VentureConnect funding history · this applicant
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <div className="rounded-xl bg-elevated/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider font-bold text-subtle">Previously approved</p>
              <p className="text-lg font-bold text-fg tabular-nums">${vcHistory.previouslyApproved.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-elevated/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider font-bold text-subtle">Per-applicant cap</p>
              <p className="text-lg font-bold text-fg tabular-nums">${STREAM_BUDGETS.venture_connect.toLocaleString()}</p>
            </div>
            <div className={"rounded-xl px-3 py-2 " + (vcHistory.remaining > 0 ? "bg-emerald-50/60 ring-1 ring-emerald-200" : "bg-rose-50/60 ring-1 ring-rose-200")}>
              <p className={"text-[10px] uppercase tracking-wider font-bold " + (vcHistory.remaining > 0 ? "text-emerald-700" : "text-rose-700")}>Remaining cap</p>
              <p className={"text-lg font-bold tabular-nums " + (vcHistory.remaining > 0 ? "text-emerald-900" : "text-rose-900")}>
                ${vcHistory.remaining.toLocaleString()}
              </p>
            </div>
          </div>
          {vcHistory.prior.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-xs">
              {vcHistory.prior.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-elevated/30">
                  <span className="font-mono text-[10px] text-subtle">{p.decidedAt ? p.decidedAt.toISOString().slice(0, 10) : "—"}</span>
                  <span className="text-fg flex-1 truncate">{p.status}</span>
                  <span className="font-mono tabular-nums text-fg">${p.amount.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-subtle mt-3 leading-snug">
            Per the EQUIP VentureConnect PDF, each company maxes out at
            ${STREAM_BUDGETS.venture_connect.toLocaleString()} CAD across up to three applications. We approximate
            &quot;company&quot; by the applicant&apos;s account here; if multiple trainees from the
            same company apply, double-check by comparing the {`{company name}`} field on each open application.
            Approvals that would exceed the cap are blocked server-side.
          </p>
        </section>
      )}

      {app.status !== "draft" && <TriageSummary applicationId={app.id} />}

      <DSSection eyebrow="Applicant" title="Who's applying" icon={<UserIcon size={14} className="text-brand-600" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ApplicantField icon={UserIcon} label="Name" value={applicantOf(app).name ?? "—"} />
          <ApplicantField icon={Mail}     label="Email" value={applicantOf(app).email} />
          <ApplicantField icon={Briefcase} label="Title / role" value={(app.user?.jobTitle ?? null) ?? "—"} />
          <ApplicantField icon={MapPin}   label="Institution" value={institutionLabel(app.institution, app.institutionOther)} />
        </div>
        <p className="text-[11px] text-subtle mt-3">
          Applicant type: <span className="font-bold text-fg">{app.applicantType ?? "—"}</span> ·
          {" "}Commercialization stage: <span className="font-bold text-fg">{app.commercializationStage ?? "—"}</span>
        </p>
      </DSSection>

      {app.stream === "venture_connect" && (
        <DSSection eyebrow="Submission body" title="The application" icon={<FileText size={14} className="text-brand-600" />}>
          <Field label="Company">{formData.companyName ?? "—"}</Field>
          {formData.companyWebsite && (
            <Field label="Website">
              <a href={formData.companyWebsite} target="_blank" rel="noreferrer" className="text-brand-700 underline">{formData.companyWebsite}</a>
            </Field>
          )}
          <FieldBlock label="Venture description">{formData.ventureDescription ?? "—"}</FieldBlock>
          <FieldBlock label="Funding request justification">{formData.fundingJustification ?? "—"}</FieldBlock>
          <div className="rounded-xl border border-line bg-elevated/40 p-3 mt-3">
            <p className="text-[10px] uppercase tracking-wider font-bold text-subtle mb-2">Budget breakdown</p>
            <ul className="space-y-1 text-xs">
              <BudgetLine label="Airfare"                                   amount={formData.budgetAirfare} />
              <BudgetLine label="Train Fare"                                amount={formData.budgetTrainFare} />
              <BudgetLine label="Rideshare / Taxi"                          amount={formData.budgetRideshareTaxi} />
              <BudgetLine label="Accommodation"                             amount={formData.budgetAccommodation} />
              <BudgetLine label="Conference / Workshop / Pitch Registration" amount={formData.budgetRegistration} />
            </ul>
            <p className="text-sm font-bold text-fg tabular-nums mt-2">
              Total: ${((formData.budgetAirfare ?? 0) + (formData.budgetTrainFare ?? 0) + (formData.budgetRideshareTaxi ?? 0) + (formData.budgetAccommodation ?? 0) + (formData.budgetRegistration ?? 0)).toLocaleString()} CAD
            </p>
          </div>
        </DSSection>
      )}

      {app.stream === "venture_lift" && (
        <VlStage1Panel data={app.formData as VentureLiftFormData} preScreenNote={app.preScreenReviewerNote} preScreenDecidedAt={app.preScreenDecidedAt} />
      )}

      {app.stream === "venture_lift" && (app.applicationStage as ApplicationStage) === "full_app" && (
        <VlStage2Panel
          data={app.formData as unknown as VentureLiftFullData}
          documents={(app.documents as unknown as EquipDocument[]) ?? []}
          fullAppSubmittedAt={app.fullAppSubmittedAt}
        />
      )}

      {app.reviewerScores && Object.keys(app.reviewerScores).length > 0 && (
        <ReviewerScoresPanel scores={app.reviewerScores as VentureLiftReviewerScores} />
      )}

      {app.preScreenReviewerNote && (
        <DSSection eyebrow="Decision context" title="Pre-screen reviewer note" icon={<FileText size={14} className="text-brand-600" />}>
          <p className="text-sm text-fg leading-relaxed">{app.preScreenReviewerNote}</p>
        </DSSection>
      )}

      {app.reviewerNote && (
        <DSSection eyebrow="Decision context" title="Reviewer note" icon={<FileText size={14} className="text-brand-600" />}>
          <p className="text-sm text-fg leading-relaxed">{app.reviewerNote}</p>
        </DSSection>
      )}

      {app.status === "funded" && (app.milestones as unknown as EquipMilestone[])?.length > 0 && (
        <MilestoneTracker
          applicationId={app.id}
          initial={app.milestones as unknown as EquipMilestone[]}
          canEdit
        />
      )}

      {app.status !== "draft" && (
        <MessageThread applicationId={app.id} currentUserId={reviewerUserId} />
      )}
    </div>
  );
}

function ApplicantField({
  icon: Icon, label, value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <p className="text-[10px] uppercase tracking-wider font-bold text-subtle inline-flex items-center gap-1.5">
        <Icon size={11} /> {label}
      </p>
      <p className="text-sm text-fg mt-1">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-[10px] uppercase tracking-wider font-bold text-subtle min-w-[100px] shrink-0">{label}</span>
      <span className="text-sm text-fg">{children}</span>
    </div>
  );
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-bold text-subtle mb-1">{label}</p>
      <p className="text-sm text-fg leading-relaxed">{children}</p>
    </div>
  );
}

function BudgetLine({ label, amount }: { label: string; amount: number | undefined }) {
  if (!amount) return null;
  return (
    <li className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className="font-mono tabular-nums text-fg">${amount.toLocaleString()}</span>
    </li>
  );
}

// ─── VL Stage 1 read-only panel (pre-screening) ────────────────

function VlStage1Panel({ data, preScreenNote, preScreenDecidedAt }: { data: VentureLiftFormData; preScreenNote: string | null; preScreenDecidedAt: Date | null }) {
  return (
    <DSSection eyebrow="VL · Stage 1" title="Pre-screening" icon={<FileText size={14} className="text-emerald-700" />}>
      <Field label="Company">{data.companyName ?? "—"}</Field>
      <Field label="Applicant">{data.fullName ?? "—"}</Field>
      <Field label="PI">{data.piFullName ?? "—"}</Field>
      <FieldBlock label="Company overview (≤100w)">{data.companyOverview ?? "—"}</FieldBlock>
      <FieldBlock label="Project summary (≤100w)">{data.projectSummary ?? "—"}</FieldBlock>
      <div className="rounded-xl bg-elevated/40 border border-line p-3 mt-3">
        <p className="text-[10px] uppercase tracking-wider font-bold text-subtle mb-2">Eligibility checklist (Stage 1)</p>
        <ul className="text-xs space-y-1">
          <Eligibility label="STEM professional + leadership role"               on={!!data.eligibilityStemProfessional} />
          <Eligibility label="Canadian IP"                                       on={!!data.eligibilityCanadianIp} />
          <Eligibility label="Human health / biomanufacturing impact"            on={!!data.eligibilityHealthOutcomesBiomanufacturing} />
          <Eligibility label="Prior accelerator / incubator"                     on={!!data.eligibilityAcceleratorParticipated} />
          <Eligibility label="Pre-seed / seed stage ready"                       on={!!data.eligibilityPreseedStageReady} />
          <Eligibility label="No duplicate funding"                              on={!!data.eligibilityNoDuplicateFunding} />
          <Eligibility label="PI agrees to hold funds"                           on={!!data.eligibilityPiHoldsFunds} />
        </ul>
      </div>
      {preScreenDecidedAt && (
        <p className="text-[11px] text-emerald-700 mt-3">
          Pre-screen decided {new Date(preScreenDecidedAt).toLocaleDateString()}{preScreenNote ? ` — “${preScreenNote.slice(0, 80)}${preScreenNote.length > 80 ? "…" : ""}”` : ""}.
        </p>
      )}
    </DSSection>
  );
}

function Eligibility({ label, on }: { label: string; on: boolean }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span className={"text-[10px] " + (on ? "text-emerald-700" : "text-rose-700")}>{on ? "✓" : "✗"}</span>
      <span className={on ? "text-fg" : "text-muted line-through"}>{label}</span>
    </li>
  );
}

// ─── VL Stage 2 read-only panel ────────────────────────────────

function VlStage2Panel({ data, documents, fullAppSubmittedAt }: { data: VentureLiftFullData; documents: EquipDocument[]; fullAppSubmittedAt: Date | null }) {
  const total = (data.budgetLines ?? []).reduce<number>((s, r) => s + (r.amount ?? 0), 0);
  const cvCount      = documents.filter((d) => d.kind === "cv").length;
  const letterCount  = documents.filter((d) => d.kind === "support_letter").length;
  const ipDocCount   = documents.filter((d) => d.kind === "ip_doc").length;
  return (
    <DSSection eyebrow="VL · Stage 2" title={data.projectTitle ?? "Full application"} icon={<FileText size={14} className="text-emerald-700" />}>
      {fullAppSubmittedAt && (
        <p className="text-[11px] text-subtle mb-2">Stage 2 submitted {new Date(fullAppSubmittedAt).toLocaleString()}.</p>
      )}

      <h3 className="text-[11px] uppercase tracking-wider font-bold text-fg mt-2">Part 1 · Team</h3>
      <Field label="Primary applicant">{data.applicantFullName ?? "—"} ({data.applicantRole ?? "—"})</Field>
      <Field label="Time commitment">{data.applicantTimeCommitment ?? "—"}</Field>
      <Field label="PI">{data.piFullName ?? "—"} — {data.piTitleInCompany ?? "—"}</Field>
      <FieldBlock label="PI role">{data.piRoleDescription ?? "—"}</FieldBlock>
      <Field label="Company">{data.companyName ?? "—"}{data.companyIncorporationDate ? ` · inc. ${data.companyIncorporationDate}` : ""}</Field>
      {(data.teamMembers ?? []).length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wider font-bold text-subtle mb-1">Other team members</p>
          <ul className="text-xs space-y-0.5">
            {(data.teamMembers ?? []).map((m) => (
              <li key={m.id}>
                <strong>{m.name ?? "—"}</strong> — {m.role ?? "—"} ({m.areaOfExpertise ?? "—"}, {m.institution ?? "—"})
              </li>
            ))}
          </ul>
        </div>
      )}

      <h3 className="text-[11px] uppercase tracking-wider font-bold text-fg mt-4">Part 2 · Innovation & project</h3>
      <FieldBlock label="2.1.1 Company overview">{data.innovationCompanyOverview ?? "—"}</FieldBlock>
      <FieldBlock label="2.1.2 Problem + human-health impact">{data.innovationProblemAndImpact ?? "—"}</FieldBlock>
      <FieldBlock label="2.1.3 IP description">{data.innovationIpDescription ?? "—"}</FieldBlock>
      <FieldBlock label="2.2.1 Target market">{data.marketOverview ?? "—"}</FieldBlock>
      <FieldBlock label="2.2.2 Competitive landscape">{data.marketCompetitive ?? "—"}</FieldBlock>
      <FieldBlock label="2.2.3 Advancement / Canadian alignment">{data.marketAdvancement ?? "—"}</FieldBlock>
      <FieldBlock label="2.3.1 Activities">{data.planActivities ?? "—"}</FieldBlock>
      <FieldBlock label="2.3.3 Rationale">{data.planRationale ?? "—"}</FieldBlock>
      <FieldBlock label="2.4.1 Commercialization milestones">{data.commercializationMilestones ?? "—"}</FieldBlock>
      <FieldBlock label="2.4.2 Anticipated impacts">{data.commercializationImpacts ?? "—"}</FieldBlock>
      <FieldBlock label="2.4.3 Customer engagement">{data.commercializationEngagement ?? "—"}</FieldBlock>
      <FieldBlock label="2.5.1 Next steps">{data.impactNextSteps ?? "—"}</FieldBlock>
      <FieldBlock label="2.5.2 Incubator participation">{data.impactIncubatorParticipation ?? "—"}</FieldBlock>

      {(data.planTimeline ?? []).length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wider font-bold text-subtle mb-1">2.3.2 Timeline</p>
          <ul className="text-xs space-y-0.5">
            {(data.planTimeline ?? []).map((r) => (
              <li key={r.id}>
                <span className="font-mono text-[10px] text-subtle">[{r.activityNumber ?? "—"}]</span>{" "}
                <strong>{r.deliverables ?? "—"}</strong>
                <span className="text-muted"> — {r.primaryPlaceOfWork ?? "—"}, due {r.completionDate ?? "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h3 className="text-[11px] uppercase tracking-wider font-bold text-fg mt-4">Part 3 · Budget — ${total.toLocaleString()}</h3>
      {(data.budgetLines ?? []).length > 0 && (
        <div className="rounded-xl border border-line overflow-hidden mt-1">
          <table className="w-full text-xs">
            <thead className="bg-elevated/40 text-subtle">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wider">Cat.</th>
                <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wider">Activity</th>
                <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wider">Description</th>
                <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(data.budgetLines ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="px-2 py-1 text-muted">{r.category}</td>
                  <td className="px-2 py-1 font-mono text-[10px]">{r.activityNumber ?? "—"}</td>
                  <td className="px-2 py-1 text-fg">{r.itemDescription ?? "—"}</td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums text-fg">${(r.amount ?? 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-elevated/30">
                <td colSpan={3} className="px-2 py-2 text-right text-[11px] font-bold uppercase tracking-wider text-subtle">Total</td>
                <td className="px-2 py-2 text-right font-mono tabular-nums font-bold">${total.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {(data.partnerContributions ?? []).length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wider font-bold text-subtle mb-1">Partner contributions</p>
          <ul className="text-xs space-y-0.5">
            {(data.partnerContributions ?? []).map((p) => (
              <li key={p.id}>
                <strong>{p.partnerName ?? "—"}</strong> ({p.kind ?? "—"}) — {p.description ?? "—"}
                {p.amountOrUnitCount && <span className="font-mono text-[10px] ml-1">[{p.amountOrUnitCount}]</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.budgetNotes && <FieldBlock label="Budget notes">{data.budgetNotes}</FieldBlock>}

      <h3 className="text-[11px] uppercase tracking-wider font-bold text-fg mt-4">Part 4 · Appendices</h3>
      <p className="text-xs text-muted">
        CVs: {cvCount} · Support letters: {letterCount}/3 · IP documents: {ipDocCount}{" "}
        {ipDocCount === 0 && <span className="text-rose-700 font-bold">(eligibility gate not satisfied)</span>}
      </p>

      <h3 className="text-[11px] uppercase tracking-wider font-bold text-fg mt-4">Part 5 · Signatures</h3>
      <Field label="Primary applicant">{data.primarySignatureName ?? "—"} — {data.primarySignatureDate ?? "—"}</Field>
      <Field label="Founder / co-founder">{data.founderSignatureName ?? "—"} — {data.founderSignatureDate ?? "—"}</Field>
      <Field label="PI">{data.piSignatureName ?? "—"} — {data.piSignatureDate ?? "—"}</Field>
      <Field label="Acknowledged"><span className={data.acknowledged ? "text-emerald-700" : "text-rose-700"}>{data.acknowledged ? "✓" : "✗"}</span></Field>
    </DSSection>
  );
}

// ─── Reviewer scores read-only panel ───────────────────────────

function ReviewerScoresPanel({ scores }: { scores: VentureLiftReviewerScores }) {
  const entries: Array<[keyof VentureLiftReviewerScores, string]> = [
    ["innovation",         "Innovation & technical merit"],
    ["market",             "Market potential & relevance"],
    ["plan",               "Project plan & deliverables"],
    ["commercialization",  "Commercialization potential"],
    ["impact",             "Impact & follow-on potential"],
    ["budget",             "Budget & use of funds"],
  ];
  const filled = entries
    .map(([k]) => scores[k])
    .filter((v): v is number => typeof v === "number");
  const mean = filled.length > 0 ? (filled.reduce((s, v) => s + v, 0) / filled.length).toFixed(1) : "—";
  return (
    <DSSection eyebrow="Reviewer rubric" title={`Mean score ${mean} / 5`} icon={<FileText size={14} className="text-emerald-700" />}>
      <ul className="text-xs space-y-1">
        {entries.map(([key, label]) => (
          <li key={key} className="flex items-center justify-between">
            <span className="text-fg">{label}</span>
            <span className="font-mono text-emerald-700 font-bold">{scores[key] != null ? `${scores[key]} / 5` : "—"}</span>
          </li>
        ))}
      </ul>
      {scores.comment && (
        <FieldBlock label="Comment">{scores.comment}</FieldBlock>
      )}
    </DSSection>
  );
}
