"use client";
/**
 * Read-only view of a submitted application. Surfaces:
 *   • Status pill + decision metadata
 *   • The form body (whatever the applicant filled in)
 *   • Reviewer note if there is one
 *   • Comment thread (Phase B — placeholder for now)
 *
 * Used inside /equip/apply/[id] when the application is no longer
 * editable. The applicant lands here after they hit submit and
 * also from /equip/my-applications.
 */
import { CheckCircle2, FileText, Clock, Sparkles } from "lucide-react";
import { STREAM_META, STATUS_META, type EquipStatus, type EquipStream, type VentureConnectFormData, type EquipMilestone } from "@/lib/equip/types";
import { MessageThread } from "./MessageThread";
import { MilestoneTracker } from "./MilestoneTracker";

interface Props {
  application: {
    id: string;
    stream: EquipStream;
    status: EquipStatus;
    formData: VentureConnectFormData | Record<string, unknown>;
    requestedAmount: number | null;
    approvedAmount: number | null;
    reviewerNote: string | null;
    submittedAt: string | null;
    decidedAt: string | null;
    fundedAt: string | null;
    reviewer: { id: string; name: string | null } | null;
    /** The applicant's user id — passed through from server so the
     *  MessageThread can highlight "your" messages. */
    userId: string;
    /** Templated when status transitions to "funded". */
    milestones?: EquipMilestone[];
  };
}

export function SubmittedView({ application }: Props) {
  const stream = STREAM_META[application.stream];
  const status = STATUS_META[application.status];

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle inline-flex items-center gap-2">
          {stream.name} · {status.label.toLowerCase()}
        </p>
        <h1 className="text-2xl font-bold text-fg tracking-tight mt-1">Application submitted</h1>
        <p className="text-[11px] text-muted mt-1">
          You&apos;ll see updates here as the review progresses — no email back-and-forth required.
        </p>
      </header>

      {/* Status strip */}
      <div className="rounded-2xl border border-line bg-card p-4 space-y-3 surface-shadow">
        <Row icon={Clock} label="Submitted">
          {application.submittedAt ? new Date(application.submittedAt).toLocaleString() : "—"}
        </Row>
        {application.decidedAt && (
          <Row icon={CheckCircle2} label="Decision">
            {new Date(application.decidedAt).toLocaleString()}
            {application.approvedAmount ? ` · $${application.approvedAmount.toLocaleString()} approved` : ""}
          </Row>
        )}
        {application.fundedAt && (
          <Row icon={Sparkles} label="Funded">
            {new Date(application.fundedAt).toLocaleString()}
          </Row>
        )}
        {application.reviewer?.name && (
          <Row icon={FileText} label="Reviewer">
            {application.reviewer.name}
          </Row>
        )}
        {application.reviewerNote && (
          <div className="rounded-xl border border-line bg-elevated/40 p-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wider font-bold text-subtle">Reviewer note</p>
            <p className="text-sm text-fg leading-relaxed">{application.reviewerNote}</p>
          </div>
        )}
      </div>

      {/* Your submission body */}
      {application.stream === "venture_connect" && (
        <div className="rounded-2xl border border-line bg-card p-4 space-y-3 surface-shadow">
          <p className="text-[10px] uppercase tracking-wider font-bold text-subtle">Your submission</p>
          <SubmissionLine k="Applicant"  v={(application.formData as VentureConnectFormData).fullName} />
          <SubmissionLine k="Institution" v={(application.formData as VentureConnectFormData).institutionAffiliation} />
          <SubmissionLine k="Graduation date" v={(application.formData as VentureConnectFormData).graduationDate} />
          <SubmissionLine k="Company / project" v={(application.formData as VentureConnectFormData).companyName} />
          <SubmissionLine k="Role with the company" v={(application.formData as VentureConnectFormData).companyRole} />
          <SubmissionLine k="Website"     v={(application.formData as VentureConnectFormData).companyWebsite} />
          <SubmissionLine
            k="Biomanufacturing / human health"
            v={typeof (application.formData as VentureConnectFormData).hasBiomanufacturingOrHumanHealthApplication === "boolean"
              ? ((application.formData as VentureConnectFormData).hasBiomanufacturingOrHumanHealthApplication ? "Yes" : "No")
              : undefined}
          />
          <SubmissionLine k="Venture"     v={(application.formData as VentureConnectFormData).ventureDescription} block />
          <SubmissionLine k="Funding justification" v={(application.formData as VentureConnectFormData).fundingJustification} block />
          {application.requestedAmount !== null && (
            <SubmissionLine k="Requested" v={`$${application.requestedAmount.toLocaleString()} CAD`} />
          )}
        </div>
      )}

      {application.status === "funded" && application.milestones && application.milestones.length > 0 && (
        <MilestoneTracker
          applicationId={application.id}
          initial={application.milestones}
          canEdit
        />
      )}

      <MessageThread applicationId={application.id} currentUserId={application.userId} />
    </div>
  );
}

function Row({
  icon: Icon, label, children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={13} className="text-muted mt-0.5 shrink-0" />
      <div className="min-w-0">
        <span className="text-[10px] uppercase tracking-wider font-bold text-subtle mr-2">{label}</span>
        <span className="text-xs text-fg">{children}</span>
      </div>
    </div>
  );
}

function SubmissionLine({ k, v, block }: { k: string; v: string | number | null | undefined; block?: boolean }) {
  if (v === null || v === undefined || v === "") return null;
  if (block) {
    return (
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider font-bold text-subtle mb-1">{k}</p>
        <p className="min-w-0 max-w-full whitespace-pre-wrap text-sm text-fg leading-relaxed [overflow-wrap:anywhere]">{v}</p>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className="text-[10px] uppercase tracking-wider font-bold text-subtle shrink-0 min-w-[100px]">{k}</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-fg [overflow-wrap:anywhere]">{v}</span>
    </div>
  );
}
