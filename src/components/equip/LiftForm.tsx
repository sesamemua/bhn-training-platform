"use client";
/**
 * VentureLift PRE-SCREENING form — mirrors the BHN EQUIP
 * VentureLift Grant Pre-Screening Form PDF (v3).
 *
 * IMPORTANT: This is the pre-screening, not the full $25K
 * application. Submitting this kicks off a BHN-led consultation;
 * eligible applicants are invited to submit a full application
 * separately.
 *
 * Section order matches the PDF:
 *   1. Company Information
 *   2. Applicant Information
 *   3. Principal Investigator (PI) Information
 *   4. IP Status
 *   5. Company Overview (max 100 words)
 *   6. Project Summary (max 100 words)
 *   7. Eligibility Checklist (7 attestations)
 *   8. Signature
 *
 * No AI writing assistance is offered — the official PDF
 * disclaimer disqualifies AI-generated content.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, AlertCircle, Rocket, Send, AlertTriangle, FlaskConical, Eraser } from "lucide-react";
import {
  NO_AI_DISCLAIMER,
  wordCount,
  type VentureLiftFormData,
  type IpStatusBlock,
  type EquipDocument,
} from "@/lib/equip/types";
import { LiftDocumentTray } from "./LiftDocumentTray";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

interface Props {
  applicationId: string;
  initial: VentureLiftFormData;
  initialDocuments: EquipDocument[];
  profile: {
    name: string;
    email: string;
    organization: string | null;
    jobTitle: string | null;
  };
  /** Admin-only fill-sample / clear-form testing strip. */
  isAdmin?: boolean;
}

/** Admin sample-fill body — passes the full pre-screening
 *  validation including all seven eligibility attestations. */
const SAMPLE_VL: VentureLiftFormData = {
  companyName: "CellFreeBio Inc.",
  companyWebsite: "https://example-bio.test",
  fullName: "Lin Wei (test)",
  institutionAffiliation: "University of Toronto",
  departmentProgram: "Donnelly Centre",
  currentRole: "grad_student",
  institutionalEmail: "lin.wei@example.test",
  applicantTitleInCompany: "Co-founder + CTO",
  applicantTimeCommitment: "30% (research) + 70% (company)",
  piFullName: "Dr. Avery Park",
  piInstitutionAffiliation: "University of Toronto",
  piDepartmentProgram: "Donnelly Centre",
  piInstitutionalEmail: "a.park@example.test",
  piTitleInCompany: "Scientific Co-founder",
  ip: {
    provisionalPatentChecked: true,
    provisionalPatentDate: new Date().toISOString().slice(0, 10),
  },
  companyOverview:
    "Sample test data. We're a Toronto-based pre-seed biotech building a cell-free protein purification platform that cuts downstream processing time roughly 40%. The target market is small-batch biologics — early-stage CDMOs and academic spinouts who lack the volume to justify traditional chromatography skids. Competitive advantage: proprietary affinity tag chemistry (provisional patent filed) and a single-use cartridge design that lowers cost-per-gram below incumbent workflows. We contribute to Canadian biomanufacturing capacity by enabling faster scale-up for early-stage therapeutic candidates.",
  projectSummary:
    "Sample test data. Requested funds support three commercialization-enabling activities over six months: a paid validation pilot at one external CDMO partner (~$10K materials + access), regulatory CMC consulting with an external biomanufacturing-quality advisor (~$8K), and a market-validation sprint targeting five potential commercial customers (~$7K travel + materials). The applicant trainee leads pilot execution and customer-discovery interviews directly; the consultant supports the regulatory deliverables only.",
  eligibilityStemProfessional: true,
  eligibilityCanadianIp: true,
  eligibilityHealthOutcomesBiomanufacturing: true,
  eligibilityAcceleratorParticipated: true,
  acceleratorPrograms: "Creative Destruction Lab — Bio Stream (2025-2026 cohort), JLABS @ Toronto",
  eligibilityPreseedStageReady: true,
  eligibilityNoDuplicateFunding: true,
  eligibilityPiHoldsFunds: true,
  signaturePrintedName: "Lin Wei (test)",
  signatureDate: new Date().toISOString().slice(0, 10),
};

const WORD_LIMIT = 100;

const ROLE_OPTIONS: { id: "grad_student" | "postdoc" | "research_associate"; label: string }[] = [
  { id: "grad_student",       label: "Graduate Student (Master's or PhD)" },
  { id: "postdoc",            label: "Postdoctoral Fellow" },
  { id: "research_associate", label: "Research Associate" },
];

export function LiftForm({ applicationId, initial, initialDocuments, profile, isAdmin = false }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<VentureLiftFormData>(() => ({
    fullName: initial.fullName ?? profile.name ?? "",
    institutionAffiliation: initial.institutionAffiliation ?? profile.organization ?? "",
    institutionalEmail: initial.institutionalEmail ?? profile.email ?? "",
    ...initial,
  }));
  const [documents, setDocuments] = useState<EquipDocument[]>(initialDocuments);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<string[]>([]);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      startSaving(async () => {
        try {
          await fetch(`/api/equip/applications/${applicationId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ formData: form }),
          });
          setSavedAt(new Date().toISOString());
          setError(null);
        } catch { /* retry next edit */ }
      });
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  function set<K extends keyof VentureLiftFormData>(key: K, value: VentureLiftFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setIp<K extends keyof IpStatusBlock>(key: K, value: IpStatusBlock[K]) {
    setForm((prev) => ({ ...prev, ip: { ...(prev.ip ?? {}), [key]: value } }));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    setValidation([]);
    try {
      const res = await fetch(`/api/equip/applications/${applicationId}/submit`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const data = j as { error?: string; details?: string[] };
        if (data.details?.length) setValidation(data.details);
        throw new Error(data.error ?? "Could not submit");
      }
      router.push("/equip/my-applications");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const companyOverviewWords = wordCount(form.companyOverview);
  const projectSummaryWords = wordCount(form.projectSummary);

  return (
    <div className="space-y-5">
      {confirmNode}
      {/* Header */}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle inline-flex items-center gap-2">
            <Rocket size={11} className="text-brand-600" />
            EQUIP VentureLift · Pre-Screening
          </p>
          <h1 className="text-2xl font-bold text-fg tracking-tight mt-1">Your pre-screening</h1>
          <p className="text-[11px] text-muted mt-1 leading-snug max-w-2xl">
            This form must be completed and submitted prior to the full
            EQUIP VentureLift application. The information provided will
            help determine the eligibility and readiness of your project
            for the grant (up to <strong>$25,000 CAD</strong>).
          </p>
        </div>
        <SaveIndicator saving={saving} savedAt={savedAt} />
      </header>

      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 flex items-start gap-2">
        <AlertTriangle size={14} className="text-amber-700 mt-0.5 shrink-0" />
        <p className="text-[11px] text-amber-900 leading-snug">
          <strong>No AI writing tools.</strong> {NO_AI_DISCLAIMER}
        </p>
      </div>

      {isAdmin && (
        <div className="rounded-2xl border border-dashed border-line bg-elevated/30 p-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-subtle inline-flex items-center gap-1.5 mr-auto">
            <FlaskConical size={11} className="text-amber-600" />
            Admin · form testing
          </span>
          <button
            type="button"
            onClick={() => setForm({ ...SAMPLE_VL, institutionAffiliation: profile.organization || SAMPLE_VL.institutionAffiliation })}
            className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm shadow-amber-600/25 transition-colors"
          >
            <FlaskConical size={11} /> Fill with sample
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!(await confirmDialog({ title: "Clear every field in this draft?", confirmLabel: "Clear form", tone: "destructive" }))) return;
              setForm({});
            }}
            className="inline-flex items-center gap-1.5 bg-card-solid hover:bg-elevated border border-line text-fg text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <Eraser size={11} /> Clear form
          </button>
        </div>
      )}

      {/* ── 1. Company Information ─────────────────────────── */}
      <Section title="Company Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Company Name" required>
            <input value={form.companyName ?? ""} onChange={(e) => set("companyName", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Website">
            <input type="url" value={form.companyWebsite ?? ""} onChange={(e) => set("companyWebsite", e.target.value)} placeholder="https://" className={inputCls} />
          </Field>
        </div>
      </Section>

      {/* ── 2. Applicant Information ───────────────────────── */}
      <Section title="Applicant Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Full Name" required>
            <input value={form.fullName ?? ""} onChange={(e) => set("fullName", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Institutional Email" required>
            <input type="email" value={form.institutionalEmail ?? ""} onChange={(e) => set("institutionalEmail", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Institution / Affiliation" required>
            <input value={form.institutionAffiliation ?? ""} onChange={(e) => set("institutionAffiliation", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Department / Program" required>
            <input value={form.departmentProgram ?? ""} onChange={(e) => set("departmentProgram", e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Current Role" required>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {ROLE_OPTIONS.map((opt) => (
              <RoleCheckbox
                key={opt.id}
                checked={form.currentRole === opt.id}
                label={opt.label}
                onChange={() => set("currentRole", opt.id)}
              />
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Title / Position in the Company" required>
            <input value={form.applicantTitleInCompany ?? ""} onChange={(e) => set("applicantTitleInCompany", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Estimated Time Commitment to the Company (% or FTE)" required>
            <input value={form.applicantTimeCommitment ?? ""} onChange={(e) => set("applicantTimeCommitment", e.target.value)} placeholder="e.g. 25% or 0.5 FTE" className={inputCls} />
          </Field>
        </div>
      </Section>

      {/* ── 3. Principal Investigator (PI) Information ─────── */}
      <Section
        title="Principal Investigator (PI) Information"
        hint="The PI agrees to take responsibility for holding the funds if the project is approved."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Full Name" required>
            <input value={form.piFullName ?? ""} onChange={(e) => set("piFullName", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Institutional Email" required>
            <input type="email" value={form.piInstitutionalEmail ?? ""} onChange={(e) => set("piInstitutionalEmail", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Institution / Affiliation" required>
            <input value={form.piInstitutionAffiliation ?? ""} onChange={(e) => set("piInstitutionAffiliation", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Department / Program" required>
            <input value={form.piDepartmentProgram ?? ""} onChange={(e) => set("piDepartmentProgram", e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Title / Position in the Company (if any)">
          <input value={form.piTitleInCompany ?? ""} onChange={(e) => set("piTitleInCompany", e.target.value)} className={inputCls} />
        </Field>
      </Section>

      {/* ── 4. IP Status ───────────────────────────────────── */}
      <Section title="Intellectual Property (IP) Status" hint="Check any milestones the company has achieved and add the date for each.">
        <IpStatusFields ip={form.ip} setIp={setIp} />
      </Section>

      {/* ── 5. Company Overview (100 words) ────────────────── */}
      <Section title="Company Overview" hint="Max 100 words.">
        <p className="text-[11px] text-muted leading-snug">
          Concise summary of your company — core mission, key products or
          technologies, target market, and competitive advantage. Highlight
          how your company contributes to the biomanufacturing sector and
          its commercialization potential.
        </p>
        <textarea
          rows={6}
          value={form.companyOverview ?? ""}
          onChange={(e) => set("companyOverview", e.target.value)}
          className={textareaCls}
        />
        <WordCounter count={companyOverviewWords} limit={WORD_LIMIT} />
      </Section>

      {/* ── 6. Project Summary (100 words) ─────────────────── */}
      <Section title="Project Summary" hint="Max 100 words.">
        <p className="text-[11px] text-muted leading-snug">
          Summarize your funding request — commercialization-enabling
          activities, expected outcomes and impact. Be specific about how
          the requested funding (up to $25,000) will be allocated. If you
          plan to work with a CRO, consultant, or other external partner,
          name them. <strong>BHN prioritizes active trainee engagement</strong> in
          the proposed use of funds.
        </p>
        <textarea
          rows={6}
          value={form.projectSummary ?? ""}
          onChange={(e) => set("projectSummary", e.target.value)}
          className={textareaCls}
        />
        <WordCounter count={projectSummaryWords} limit={WORD_LIMIT} />
      </Section>

      {/* ── 7. Eligibility Checklist ───────────────────────── */}
      <Section
        title="Eligibility Checklist"
        hint="Tick each item that applies. All seven are required to be eligible."
      >
        <div className="space-y-2">
          <EligibilityCheckbox
            checked={form.eligibilityStemProfessional === true}
            onChange={(v) => set("eligibilityStemProfessional", v)}
            label="The applicant must be a STEM professional affiliated with an eligible institution, have a leadership role in the company, and be either a graduate student (Master's or PhD) or a postdoctoral fellow. Research associates considered case-by-case."
          />
          <EligibilityCheckbox
            checked={form.eligibilityCanadianIp === true}
            onChange={(v) => set("eligibilityCanadianIp", v)}
            label="The innovation must be based in Canada, with IP owned or licensed by a Canadian entity. If the company is not incorporated, the applicant must be affiliated with a Canadian academic institution."
          />
          <EligibilityCheckbox
            checked={form.eligibilityHealthOutcomesBiomanufacturing === true}
            onChange={(v) => set("eligibilityHealthOutcomesBiomanufacturing", v)}
            label="The innovation has a direct impact on improving human health outcomes and involves a biomanufacturing component (e.g. process development, scale-up, or production of therapeutics or diagnostics)."
          />
          <EligibilityCheckbox
            checked={form.eligibilityAcceleratorParticipated === true}
            onChange={(v) => set("eligibilityAcceleratorParticipated", v)}
            label="The applicant's early-stage company has participated in an accelerator / incubator program."
          />
          {form.eligibilityAcceleratorParticipated && (
            <div className="ml-7 mt-1">
              <Field label="List the programs" required>
                <input
                  value={form.acceleratorPrograms ?? ""}
                  onChange={(e) => set("acceleratorPrograms", e.target.value)}
                  placeholder="e.g. Creative Destruction Lab — Bio Stream, JLABS @ Toronto"
                  className={inputCls}
                />
              </Field>
            </div>
          )}
          <EligibilityCheckbox
            checked={form.eligibilityPreseedStageReady === true}
            onChange={(v) => set("eligibilityPreseedStageReady", v)}
            label="The company is at the Pre-seed / Seed stage with at least a provisional patent, novel concept, initial prototype, and a commercialization roadmap."
          />
          <EligibilityCheckbox
            checked={form.eligibilityNoDuplicateFunding === true}
            onChange={(v) => set("eligibilityNoDuplicateFunding", v)}
            label="The requested funding will support commercialization-enabling activities and does not duplicate other funding sources."
          />
          <EligibilityCheckbox
            checked={form.eligibilityPiHoldsFunds === true}
            onChange={(v) => set("eligibilityPiHoldsFunds", v)}
            label="If the project is funded, the PI agrees to take responsibility for holding the funds, with all expenditures subject to audit by their institution."
          />
        </div>
      </Section>

      {/* Document tray — pitch deck explicitly encouraged on the PDF */}
      <LiftDocumentTray
        applicationId={applicationId}
        documents={documents}
        onChange={setDocuments}
      />

      {/* ── 8. Signature ───────────────────────────────────── */}
      <Section title="Signature">
        <p className="text-[11px] text-muted leading-snug mb-2">
          I confirm that the information provided is accurate and that I
          fully understand the requirements of the EQUIP VentureLift
          program.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Printed Name" required>
            <input value={form.signaturePrintedName ?? ""} onChange={(e) => set("signaturePrintedName", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Date" required>
            <input type="date" value={form.signatureDate ?? ""} onChange={(e) => set("signatureDate", e.target.value)} className={inputCls} />
          </Field>
        </div>
      </Section>

      {/* Submit row */}
      <div className="border-t border-line pt-4 flex flex-wrap items-center justify-end gap-3">
        {validation.length > 0 && (
          <ul className="text-[11px] text-rose-700 list-disc pl-5 mr-auto max-w-md">
            {validation.map((v, i) => <li key={i}>{v}</li>)}
          </ul>
        )}
        {error && validation.length === 0 && (
          <p className="text-[11px] text-rose-700 inline-flex items-center gap-1.5 mr-auto">
            <AlertCircle size={11} /> {error}
          </p>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-bold px-5 py-2 rounded-xl shadow-sm shadow-brand-600/25 transition-colors"
        >
          {submitting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          Submit pre-screening
        </button>
      </div>
    </div>
  );
}

// ── Atoms ─────────────────────────────────────────────────────

const inputCls =
  "w-full bg-card-solid border border-line rounded-lg px-3 py-2 text-sm text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500";
const textareaCls = inputCls + " font-sans";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-5 space-y-3 surface-shadow">
      <header>
        <h2 className="text-sm font-bold text-fg">{title}</h2>
        {hint && <p className="text-[11px] text-muted mt-0.5">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold text-fg">
        {label}{required && <span className="text-rose-600 ml-0.5">*</span>}
      </label>
      {hint && <p className="text-[10px] text-subtle leading-snug">{hint}</p>}
      {children}
    </div>
  );
}

function RoleCheckbox({
  checked, label, onChange,
}: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={
        "text-left rounded-xl border px-3 py-2 transition-colors flex items-start gap-2 " +
        (checked
          ? "border-brand-500 bg-brand-50/40 ring-2 ring-brand-500/30"
          : "border-line hover:bg-elevated/60")
      }
    >
      <span className={"w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 " + (checked ? "bg-brand-600 border-brand-600" : "border-line")}>
        {checked && <Check size={10} className="text-white" />}
      </span>
      <span className="text-xs font-bold text-fg">{label}</span>
    </button>
  );
}

function IpStatusFields({
  ip, setIp,
}: {
  ip: IpStatusBlock | undefined;
  setIp: <K extends keyof IpStatusBlock>(key: K, value: IpStatusBlock[K]) => void;
}) {
  const block = ip ?? {};
  return (
    <div className="space-y-2">
      <IpRow label="Invention Disclosure to Home Institution" checked={block.inventionDisclosureChecked === true} date={block.inventionDisclosureDate}
        onToggle={(v) => setIp("inventionDisclosureChecked", v)} onDate={(d) => setIp("inventionDisclosureDate", d)} />
      <IpRow label="Provisional Patent Application Filed" checked={block.provisionalPatentChecked === true} date={block.provisionalPatentDate}
        onToggle={(v) => setIp("provisionalPatentChecked", v)} onDate={(d) => setIp("provisionalPatentDate", d)} />
      <IpRow label="Full Patent Application Filed" checked={block.fullPatentChecked === true} date={block.fullPatentDate}
        onToggle={(v) => setIp("fullPatentChecked", v)} onDate={(d) => setIp("fullPatentDate", d)} />
      <IpRow label="Licensed Technology" checked={block.licensedTechnologyChecked === true} date={block.licensedTechnologyDate}
        onToggle={(v) => setIp("licensedTechnologyChecked", v)} onDate={(d) => setIp("licensedTechnologyDate", d)} />
    </div>
  );
}

function IpRow({
  label, checked, date, onToggle, onDate,
}: {
  label: string;
  checked: boolean;
  date: string | undefined;
  onToggle: (v: boolean) => void;
  onDate: (d: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <label className="inline-flex items-center gap-2 cursor-pointer flex-1 min-w-[260px]">
        <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} className="shrink-0" />
        <span className="text-xs font-bold text-fg">{label}</span>
      </label>
      <input type="date" value={date ?? ""} onChange={(e) => onDate(e.target.value)} disabled={!checked}
        className={inputCls + " w-44 disabled:opacity-40"} />
    </div>
  );
}

function EligibilityCheckbox({
  checked, label, onChange,
}: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 shrink-0"
      />
      <span className="text-[12px] text-fg leading-relaxed">{label}</span>
    </label>
  );
}

function WordCounter({ count, limit }: { count: number; limit: number }) {
  const over = count > limit;
  return (
    <p className={"text-[11px] tabular-nums " + (over ? "text-rose-700" : "text-subtle")}>
      {count} / {limit} words {over && "— over the limit, please trim"}
    </p>
  );
}

function SaveIndicator({ saving, savedAt }: { saving: boolean; savedAt: string | null }) {
  if (saving) {
    return (
      <span className="text-[11px] text-muted inline-flex items-center gap-1.5">
        <Loader2 size={11} className="animate-spin" /> Saving…
      </span>
    );
  }
  if (savedAt) {
    const seconds = Math.max(0, Math.round((Date.now() - new Date(savedAt).getTime()) / 1000));
    return (
      <span className="text-[11px] text-emerald-700 inline-flex items-center gap-1.5">
        <Check size={11} /> Saved {seconds}s ago
      </span>
    );
  }
  return null;
}
