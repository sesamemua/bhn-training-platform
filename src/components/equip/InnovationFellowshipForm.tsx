"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BriefcaseBusiness,
  Check,
  GraduationCap,
  Lightbulb,
  Loader2,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import {
  INNOVATION_FELLOWSHIP_IP_STATUSES,
  INNOVATION_FELLOWSHIP_OPPORTUNITIES,
  innovationFellowshipRoleMatchesOpportunity,
  wordCount,
  type ApplicantRole,
  type EquipDocument,
  type InnovationFellowshipFormData,
  type InnovationFellowshipFundingRow,
  type InnovationFellowshipIpStatus,
  type InnovationFellowshipMilestone,
  type InnovationFellowshipOpportunity,
} from "@/lib/equip/types";
import { INSTITUTIONS } from "@/lib/equip/institutions";
import { FourDigitDateInput, capWords } from "./ConnectForm";
import { LiftDocumentTray, VENTURE_CONNECT_KINDS } from "./LiftDocumentTray";

interface Props {
  applicationId: string;
  initial: InnovationFellowshipFormData;
  initialDocuments: EquipDocument[];
  endpointBase?: string;
}

const ROLE_OPTIONS: Array<{ id: ApplicantRole; label: string }> = [
  { id: "master_student", label: "Master's Student" },
  { id: "phd_student", label: "PhD Student" },
  { id: "postdoc", label: "Postdoctoral Fellow" },
  { id: "research_associate", label: "Research Associate" },
];

const WORD_LIMITS = {
  otherSupportDetails: 250,
  innovationDescription: 750,
  ventureStage: 750,
  commercializationRoadmap: 500,
  marketOpportunity: 500,
  fellowshipPlan: 750,
  fellowshipCommercialization: 500,
  internshipImportance: 500,
  internshipApplication: 500,
} as const;

function blankMilestones(existing: InnovationFellowshipMilestone[] | undefined): InnovationFellowshipMilestone[] {
  const rows = existing?.slice(0, 4) ?? [];
  while (rows.length < 4) rows.push({ id: `milestone-${rows.length + 1}` });
  return rows;
}

function newFundingRow(): InnovationFellowshipFundingRow {
  return { id: `funding-${crypto.randomUUID()}` };
}

export function InnovationFellowshipForm({
  applicationId,
  initial,
  initialDocuments,
  endpointBase = "/api/public/equip",
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState<InnovationFellowshipFormData>(() => ({
    ...initial,
    fellowshipMilestones: blankMilestones(initial.fellowshipMilestones),
  }));
  const [documents, setDocuments] = useState<EquipDocument[]>(initialDocuments);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<string[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      startSaving(async () => {
        try {
          const response = await fetch(`${endpointBase}/${applicationId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ formData: form }),
          });
          if (!response.ok) throw new Error("Autosave failed");
          setSavedAt(new Date().toISOString());
          setError(null);
        } catch {
          setError("We couldn't save the latest change. Keep this page open and try editing again.");
        }
      });
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [applicationId, endpointBase, form]);

  function set<K extends keyof InnovationFellowshipFormData>(
    key: K,
    value: InnovationFellowshipFormData[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function chooseOpportunity(opportunity: InnovationFellowshipOpportunity) {
    setForm((current) => ({
      ...current,
      opportunity,
      currentRole: innovationFellowshipRoleMatchesOpportunity(opportunity, current.currentRole)
        ? current.currentRole
        : undefined,
    }));
  }

  function toggleIp(status: InnovationFellowshipIpStatus) {
    const current = form.ipStatuses ?? [];
    if (status === "no_ip") {
      set("ipStatuses", current.includes("no_ip") ? [] : ["no_ip"]);
      return;
    }
    const withoutNoIp = current.filter((item) => item !== "no_ip");
    set(
      "ipStatuses",
      withoutNoIp.includes(status)
        ? withoutNoIp.filter((item) => item !== status)
        : [...withoutNoIp, status],
    );
  }

  function updateFundingRow(id: string, patch: Partial<InnovationFellowshipFundingRow>) {
    set("previousFunding", (form.previousFunding ?? []).map((row) =>
      row.id === id ? { ...row, ...patch } : row,
    ));
  }

  function updateMilestone(id: string, patch: Partial<InnovationFellowshipMilestone>) {
    set("fellowshipMilestones", (form.fellowshipMilestones ?? []).map((row) =>
      row.id === id ? { ...row, ...patch } : row,
    ));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    setValidation([]);
    if (saveTimer.current) clearTimeout(saveTimer.current);

    try {
      const saveResponse = await fetch(`${endpointBase}/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formData: form }),
      });
      if (!saveResponse.ok) throw new Error("Could not save the application before submitting.");

      const response = await fetch(`${endpointBase}/${applicationId}`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as {
          error?: string;
          details?: string[];
        };
        if (body.details?.length) setValidation(body.details);
        throw new Error(body.error ?? "Could not submit the application.");
      }
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const isInternship = form.opportunity === "innovation_internship";
  const availableRoleOptions = ROLE_OPTIONS.filter((option) =>
    innovationFellowshipRoleMatchesOpportunity(form.opportunity, option.id),
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-subtle">
            <Lightbulb size={12} className="text-brand-700" />
            EQUIP Innovation Fellowship
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-fg">Your application</h1>
          <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-muted">
            Your answers save automatically. Choose one opportunity; the plan section will
            adapt to a fellowship or internship.
          </p>
        </div>
        <SaveIndicator saving={saving} savedAt={savedAt} />
      </header>

      <Section title="Opportunity" hint="Select the opportunity you are applying for." required>
        <div className="grid gap-2">
          {INNOVATION_FELLOWSHIP_OPPORTUNITIES.map((opportunity) => {
            const active = form.opportunity === opportunity.id;
            const Icon = opportunity.id === "innovation_internship" ? BriefcaseBusiness : GraduationCap;
            return (
              <button
                key={opportunity.id}
                type="button"
                aria-pressed={active}
                onClick={() => chooseOpportunity(opportunity.id)}
                className={
                  "flex min-h-20 items-start gap-3 rounded-lg border p-3 text-left transition-colors " +
                  (active
                    ? "border-brand-600 bg-brand-50/50 ring-2 ring-brand-500/25"
                    : "border-line bg-card-solid hover:border-brand-300 hover:bg-elevated/40")
                }
              >
                <span className={
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg " +
                  (active ? "bg-brand-600 text-white" : "bg-elevated text-brand-700")
                }>
                  <Icon size={15} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-fg">{opportunity.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
                    {opportunity.description}
                  </span>
                </span>
                {active && <Check size={16} className="ml-auto mt-1 shrink-0 text-brand-700" />}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="1. Applicant Information">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Applicant Name" required>
            <input value={form.fullName ?? ""} onChange={(event) => set("fullName", event.target.value)} className={inputCls} autoComplete="name" />
          </Field>
          <Field label="Email" required>
            <input type="email" value={form.institutionEmail ?? ""} onChange={(event) => set("institutionEmail", event.target.value)} className={inputCls} autoComplete="email" />
          </Field>
          <Field label="Institution" required>
            <select value={form.institutionAffiliation ?? ""} onChange={(event) => set("institutionAffiliation", event.target.value)} className={inputCls}>
              <option value="">Select your institution</option>
              {INSTITUTIONS.slice().sort((a, b) => a.name.localeCompare(b.name)).map((institution) => (
                <option key={institution.slug} value={institution.name}>{institution.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Department / Program" required>
            <input value={form.departmentProgram ?? ""} onChange={(event) => set("departmentProgram", event.target.value)} className={inputCls} />
          </Field>
          <Field label="Supervisor / Principal Investigator Name" required>
            <input value={form.supervisorName ?? ""} onChange={(event) => set("supervisorName", event.target.value)} className={inputCls} />
          </Field>
          <Field label="Supervisor / Principal Investigator Email" required>
            <input type="email" value={form.supervisorEmail ?? ""} onChange={(event) => set("supervisorEmail", event.target.value)} className={inputCls} />
          </Field>
        </div>

        <Field
          label="Applicant Status"
          hint={form.opportunity ? "Showing the statuses eligible for the selected opportunity." : undefined}
          required
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {availableRoleOptions.map((option) => (
              <ChoiceButton
                key={option.id}
                checked={form.currentRole === option.id}
                label={option.label}
                onClick={() => set("currentRole", option.id)}
              />
            ))}
          </div>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Expected Graduation / End of Appointment Date" required>
            <FourDigitDateInput value={form.graduationDate ?? ""} onChange={(date) => set("graduationDate", date)} />
          </Field>
          <Field label="What is your role in the venture?" required>
            <input value={form.ventureRole ?? ""} onChange={(event) => set("ventureRole", event.target.value)} className={inputCls} placeholder="e.g. Co-founder and scientific lead" />
          </Field>
        </div>

        <Field label="How much time do you currently dedicate to the venture?" required>
          <input value={form.ventureTimeCommitment ?? ""} onChange={(event) => set("ventureTimeCommitment", event.target.value)} className={inputCls} placeholder="e.g. 20 hours per week or 50% FTE" />
        </Field>

        <Field label="Are you currently receiving other salary, stipend, or fellowship support?" required>
          <BinaryChoice
            value={form.receivesOtherSupport}
            onChange={(answer) => set("receivesOtherSupport", answer)}
          />
        </Field>
        {form.receivesOtherSupport === true && (
          <WordTextarea
            label="If yes, please describe"
            value={form.otherSupportDetails}
            limit={WORD_LIMITS.otherSupportDetails}
            rows={5}
            required
            onChange={(text) => set("otherSupportDetails", text)}
          />
        )}
      </Section>

      <Section title="2. Venture / Innovation Information">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Venture Name" required>
            <input value={form.ventureName ?? ""} onChange={(event) => set("ventureName", event.target.value)} className={inputCls} />
          </Field>
          <Field label="Website" hint="If applicable">
            <input type="url" value={form.companyWebsite ?? ""} onChange={(event) => set("companyWebsite", event.target.value)} className={inputCls} placeholder="https://" />
          </Field>
        </div>

        <Field label="Intellectual Property" hint="Select all that apply." required>
          <div className="grid gap-2 sm:grid-cols-2">
            {INNOVATION_FELLOWSHIP_IP_STATUSES.map((status) => (
              <ChoiceButton
                key={status.id}
                checked={(form.ipStatuses ?? []).includes(status.id)}
                label={status.label}
                onClick={() => toggleIp(status.id)}
              />
            ))}
          </div>
        </Field>
        {(form.ipStatuses ?? []).includes("other") && (
          <Field label="Other IP status" required>
            <input value={form.ipOther ?? ""} onChange={(event) => set("ipOther", event.target.value)} className={inputCls} />
          </Field>
        )}

        <WordTextarea
          label="Describe the innovation"
          hint="What problem are you solving, and what is your proposed solution?"
          value={form.innovationDescription}
          limit={WORD_LIMITS.innovationDescription}
          rows={10}
          required
          onChange={(text) => set("innovationDescription", text)}
        />
        <WordTextarea
          label="What is the current stage of your venture?"
          hint="Describe prototype development, validation, customers, partnerships, funding, IP, or other relevant milestones."
          value={form.ventureStage}
          limit={WORD_LIMITS.ventureStage}
          rows={10}
          required
          onChange={(text) => set("ventureStage", text)}
        />
        <WordTextarea
          label="Commercialization Roadmap"
          hint="What key milestones do you expect to achieve over the next six months?"
          value={form.commercializationRoadmap}
          limit={WORD_LIMITS.commercializationRoadmap}
          rows={8}
          required
          onChange={(text) => set("commercializationRoadmap", text)}
        />
        <WordTextarea
          label="Market Opportunity"
          hint="Who will use or purchase the product? Include evidence of need, competitors or alternatives, and what makes your solution different."
          value={form.marketOpportunity}
          limit={WORD_LIMITS.marketOpportunity}
          rows={8}
          required
          onChange={(text) => set("marketOpportunity", text)}
        />

        <Field label="Have you previously received funding for this venture?" required>
          <BinaryChoice
            value={form.receivedPreviousFunding}
            onChange={(answer) => {
              set("receivedPreviousFunding", answer);
              if (answer && (form.previousFunding ?? []).length === 0) {
                set("previousFunding", [newFundingRow()]);
              }
            }}
          />
        </Field>
        {form.receivedPreviousFunding === true && (
          <div className="space-y-3">
            {(form.previousFunding ?? []).map((row, index) => (
              <div key={row.id} className="rounded-lg border border-line bg-elevated/25 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-fg">Funding entry {index + 1}</p>
                  <button
                    type="button"
                    onClick={() => set("previousFunding", (form.previousFunding ?? []).filter((item) => item.id !== row.id))}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-700 hover:bg-rose-50"
                    aria-label={`Remove funding entry ${index + 1}`}
                    title="Remove funding entry"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <Field label="Funding Source" required>
                    <input value={row.source ?? ""} onChange={(event) => updateFundingRow(row.id, { source: event.target.value })} className={inputCls} />
                  </Field>
                  <Field label="Amount (CAD)" required>
                    <input type="number" min={0} step={100} value={row.amount ?? ""} onChange={(event) => updateFundingRow(row.id, { amount: event.target.value ? Number(event.target.value) : undefined })} className={inputCls} />
                  </Field>
                  <Field label="Date" required>
                    <FourDigitDateInput value={row.date ?? ""} onChange={(date) => updateFundingRow(row.id, { date })} />
                  </Field>
                  <Field label="Purpose" required>
                    <input value={row.purpose ?? ""} onChange={(event) => updateFundingRow(row.id, { purpose: event.target.value })} className={inputCls} />
                  </Field>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => set("previousFunding", [...(form.previousFunding ?? []), newFundingRow()])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card-solid px-3 py-2 text-xs font-bold text-fg hover:bg-elevated"
            >
              <Plus size={13} /> Add funding entry
            </button>
          </div>
        )}
      </Section>

      {form.opportunity && !isInternship && (
        <Section title="3A. Trainee Entrepreneur Fellowship Plan">
          <WordTextarea
            label="What will you accomplish during the six-month fellowship?"
            hint="Describe how the support will advance both your entrepreneurial development and the venture."
            value={form.fellowshipPlan}
            limit={WORD_LIMITS.fellowshipPlan}
            rows={10}
            required
            onChange={(text) => set("fellowshipPlan", text)}
          />

          <Field label="Proposed milestones" hint="Complete up to four milestones. At least one is required." required>
            <div className="space-y-2">
              {(form.fellowshipMilestones ?? []).map((row, index) => (
                <div key={row.id} className="grid gap-2 rounded-lg border border-line bg-elevated/25 p-3 sm:grid-cols-[auto_1fr_190px] sm:items-end">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-xs font-bold text-brand-800">
                    {index + 1}
                  </span>
                  <Field label="Expected Outcome">
                    <input value={row.expectedOutcome ?? ""} onChange={(event) => updateMilestone(row.id, { expectedOutcome: event.target.value })} className={inputCls} />
                  </Field>
                  <Field label="Target Date">
                    <FourDigitDateInput value={row.targetDate ?? ""} onChange={(date) => updateMilestone(row.id, { targetDate: date })} />
                  </Field>
                </div>
              ))}
            </div>
          </Field>

          <WordTextarea
            label="How will the fellowship contribute to commercialization of your innovation?"
            value={form.fellowshipCommercialization}
            limit={WORD_LIMITS.fellowshipCommercialization}
            rows={8}
            required
            onChange={(text) => set("fellowshipCommercialization", text)}
          />
        </Section>
      )}

      {isInternship && (
        <Section title="3B. Innovation Internship Plan">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Host Organization" hint="Incubator, accelerator, or innovation organization" required>
              <input value={form.internshipHostOrganization ?? ""} onChange={(event) => set("internshipHostOrganization", event.target.value)} className={inputCls} />
            </Field>
            <Field label="Internship / Program Name" required>
              <input value={form.internshipProgramName ?? ""} onChange={(event) => set("internshipProgramName", event.target.value)} className={inputCls} />
            </Field>
            <Field label="Proposed Start Date" required>
              <FourDigitDateInput value={form.internshipStartDate ?? ""} onChange={(date) => set("internshipStartDate", date)} />
            </Field>
            <Field label="Proposed End Date" required>
              <FourDigitDateInput value={form.internshipEndDate ?? ""} onChange={(date) => set("internshipEndDate", date)} />
            </Field>
          </div>
          <WordTextarea
            label="Why is this internship important for your entrepreneurial development?"
            hint="What skills, knowledge, and networks do you expect to gain?"
            value={form.internshipImportance}
            limit={WORD_LIMITS.internshipImportance}
            rows={8}
            required
            onChange={(text) => set("internshipImportance", text)}
          />
          <WordTextarea
            label="How will you apply the experience to your venture?"
            value={form.internshipApplication}
            limit={WORD_LIMITS.internshipApplication}
            rows={8}
            required
            onChange={(text) => set("internshipApplication", text)}
          />
        </Section>
      )}

      <Section title="Supporting Files" hint="Optional. Attach material that helps reviewers understand the venture or plan.">
        <LiftDocumentTray
          applicationId={applicationId}
          documents={documents}
          onChange={setDocuments}
          endpointBase={endpointBase}
          kinds={VENTURE_CONNECT_KINDS}
          title="Upload supporting files"
          blurb="Drag and drop a PDF, Word, Excel, JPG, or PNG file, or click to browse."
          embedded
        />
      </Section>

      <Section title="4. Signatures">
        <p className="text-[11.5px] leading-relaxed text-muted">
          By signing, you acknowledge and consent to the terms and conditions of BioHubNet&apos;s
          EQUIP program and agree to provide all information required by the funder.
        </p>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-elevated/25 p-3">
          <input type="checkbox" checked={form.acknowledged === true} onChange={(event) => set("acknowledged", event.target.checked)} className="mt-0.5" />
          <span className="text-xs font-semibold leading-relaxed text-fg">I acknowledge and agree.</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Applicant Name" required>
            <input value={form.applicantSignatureName ?? ""} onChange={(event) => set("applicantSignatureName", event.target.value)} className={inputCls} />
          </Field>
          <Field label="Applicant Date" required>
            <FourDigitDateInput value={form.applicantSignatureDate ?? ""} onChange={(date) => set("applicantSignatureDate", date)} />
          </Field>
          <Field label="Supervisor Name" required>
            <input value={form.supervisorSignatureName ?? ""} onChange={(event) => set("supervisorSignatureName", event.target.value)} className={inputCls} />
          </Field>
          <Field label="Supervisor Date" required>
            <FourDigitDateInput value={form.supervisorSignatureDate ?? ""} onChange={(date) => set("supervisorSignatureDate", date)} />
          </Field>
        </div>
        <p className="text-[10.5px] leading-relaxed text-subtle">
          The program manager signature and eligibility screening are completed by BioHubNet after submission.
        </p>
      </Section>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
        {validation.length > 0 && (
          <div className="mr-auto max-w-xl rounded-lg border border-rose-200 bg-rose-50/60 p-3">
            <p className="text-xs font-bold text-rose-900">Complete these items before submitting:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[11px] leading-relaxed text-rose-800">
              {validation.map((message) => <li key={message}>{message}</li>)}
            </ul>
          </div>
        )}
        {error && validation.length === 0 && (
          <p className="mr-auto inline-flex items-center gap-1.5 text-[11px] text-rose-700">
            <AlertCircle size={12} /> {error}
          </p>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Submit application
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-line bg-card-solid px-3 py-2 text-sm text-fg placeholder:text-subtle outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25";
const textareaCls = `${inputCls} font-sans`;

function Section({
  title,
  hint,
  required = false,
  children,
}: {
  title: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-lg border border-line bg-card p-4 surface-shadow sm:p-5">
      <header>
        <h2 className="text-sm font-bold text-fg">
          {title}{required && <span className="ml-0.5 text-rose-600">*</span>}
        </h2>
        {hint && <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  required = false,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold text-fg">
        {label}{required && <span className="ml-0.5 text-rose-600">*</span>}
      </label>
      {hint && <p className="text-[10px] leading-relaxed text-subtle">{hint}</p>}
      {children}
    </div>
  );
}

function ChoiceButton({
  checked,
  label,
  onClick,
}: {
  checked: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onClick}
      className={
        "flex min-h-11 items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors " +
        (checked
          ? "border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/25"
          : "border-line bg-card-solid hover:bg-elevated/50")
      }
    >
      <span className={
        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 " +
        (checked ? "border-brand-600 bg-brand-600" : "border-line")
      }>
        {checked && <Check size={10} className="text-white" />}
      </span>
      <span className="text-xs font-bold leading-relaxed text-fg">{label}</span>
    </button>
  );
}

function BinaryChoice({
  value,
  onChange,
}: {
  value: boolean | undefined;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-card-solid p-1" role="group" aria-label="Choose yes or no">
      {[
        { label: "Yes", value: true },
        { label: "No", value: false },
      ].map((option) => (
        <button
          key={option.label}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={
            "min-w-20 rounded-md px-4 py-2 text-xs font-bold transition-colors " +
            (value === option.value
              ? "bg-brand-600 text-white"
              : "text-muted hover:bg-elevated hover:text-fg")
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function WordTextarea({
  label,
  hint,
  value,
  limit,
  rows,
  required = false,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string | undefined;
  limit: number;
  rows: number;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} hint={hint} required={required}>
      <textarea
        rows={rows}
        value={value ?? ""}
        onChange={(event) => onChange(capWords(event.target.value, limit))}
        className={textareaCls}
      />
      <p className="text-right text-[10px] tabular-nums text-subtle">
        {wordCount(value)} / {limit} words
      </p>
    </Field>
  );
}

function SaveIndicator({ saving, savedAt }: { saving: boolean; savedAt: string | null }) {
  if (saving) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
        <Loader2 size={12} className="animate-spin" /> Saving
      </span>
    );
  }
  if (savedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700">
        <Check size={12} /> Saved
      </span>
    );
  }
  return null;
}
