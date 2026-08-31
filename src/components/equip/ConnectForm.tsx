"use client";
/**
 * VentureConnect application form — mirrors the BHN EQUIP
 * VentureConnect Grant Application Form PDF (Mar 2026).
 *
 * Section order matches the PDF exactly:
 *   1. Applicant Information
 *   2. Company Information
 *   3. Intellectual Property (IP) Status
 *   4. Funding Request Justification
 *   5. Budget & Supporting Documentation
 *   6. Signature (attestation)
 *
 * Auto-saves every 800ms via PATCH; submit POSTs to /submit which
 * re-validates server-side and clamps the requested amount to the
 * $5,000 cap.
 *
 * IMPORTANT: AI writing assistance is intentionally NOT offered on
 * this form. The official PDF disclaimer states applications
 * found to contain AI-generated content will be disqualified —
 * see NO_AI_DISCLAIMER in lib/equip/types.ts.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, AlertCircle, Beaker, Send, AlertTriangle, FlaskConical, Eraser } from "lucide-react";
import {
  STREAM_BUDGETS,
  NO_AI_DISCLAIMER,
  type VentureConnectFormData,
  EVENT_CATEGORIES,
  SUPPORTING_DOCS,
  type EventCategory,
  type SupportingDocKey,
  type IpStatusBlock,
  type ApplicantRole,
  type EquipDocument,
} from "@/lib/equip/types";
import { institutionsForStream } from "@/lib/equip/institutions";
import { LiftDocumentTray } from "./LiftDocumentTray";

interface Props {
  applicationId: string;
  initial: VentureConnectFormData;
  /** Existing attachments on the draft. The VentureConnect PDF
   *  asks applicants to attach a pitch deck + supporting docs
   *  (conference registration, cost estimates, workshop details)
   *  alongside the form body, so we mount the same document tray
   *  LiftForm uses with its Stage-1 kinds. */
  initialDocuments: EquipDocument[];
  /**
   * Where this form saves and submits.
   *
   * Defaults to the signed-in route. The public VentureConnect link
   * points it at the token route instead, so one form serves both ways
   * in — an applicant filling in the public one is answering exactly
   * the same questions, checked by exactly the same validator.
   */
  endpointBase?: string;
  /** Lets a host flow hide attachments when uploads are unavailable. */
  allowDocuments?: boolean;
  /** Pulled from the User row to pre-fill applicant identity
   *  fields. The applicant can still edit each one — pre-fill is
   *  a convenience, not a constraint. */
  profile: {
    name: string;
    email: string;
    organization: string | null;
    jobTitle: string | null;
  };
  /** Admin-only — when true, renders a "Fill with sample" /
   *  "Clear" testing strip so admins can populate or empty the
   *  draft in one click while iterating on the UX. */
  isAdmin?: boolean;
}

/** Sample-fill body for admin testing. Mirrors what a realistic
 *  draft would look like — passes server-side validation. */
const SAMPLE_VC: VentureConnectFormData = {
  fullName: "Alex Chen (test)",
  institutionAffiliation: "University of Toronto",
  departmentProgram: "Donnelly Centre for Cellular and Biomolecular Research",
  currentRole: "phd_student",
  institutionEmail: "alex.chen@example.test",
  companyName: "PuriBio Inc.",
  companyWebsite: "https://example-bio.test",
  ventureDescription:
    "Sample test data. We're developing a cell-free protein purification platform that reduces downstream processing time by ~40%. Current stage: working prototype validated on three model proteins; planning a paid pilot with one biotech partner next quarter.",
  ip: {
    provisionalPatentChecked: true,
    provisionalPatentDate: new Date().toISOString().slice(0, 10),
  },
  fundingJustification:
    "Sample test data. Attendance at this event lets us run two pre-scheduled investor meetings plus a paid-pilot conversation with a manufacturing partner. We expect at least one qualified term-sheet conversation and one warm intro to a CDMO out of this trip — both materially advance our seed round and our first paid pilot.",
  budgetAirfare: 1200,
  budgetTrainFare: 0,
  budgetRideshareTaxi: 150,
  budgetAccommodation: 1500,
  budgetRegistration: 1500,
  acknowledged: true,
  signaturePrintedName: "Alex Chen (test)",
  signatureDate: new Date().toISOString().slice(0, 10),
};

const CAP = STREAM_BUDGETS.venture_connect;
const VENTURE_CONNECT_INSTITUTIONS = [...institutionsForStream("venture_connect")]
  .sort((a, b) => a.name.localeCompare(b.name));
const VENTURE_CONNECT_INSTITUTION_NAMES = new Set(
  VENTURE_CONNECT_INSTITUTIONS.map((institution) => institution.name),
);

const ROLE_OPTIONS: { id: ApplicantRole; label: string }[] = [
  { id: "master_student",     label: "Master's Student" },
  { id: "phd_student",        label: "PhD Student" },
  { id: "postdoc",            label: "Postdoctoral Fellow" },
  { id: "research_associate", label: "Research Associate" },
];

function budgetTotal(f: VentureConnectFormData): number {
  return (f.budgetAirfare ?? 0)
    + (f.budgetTrainFare ?? 0)
    + (f.budgetRideshareTaxi ?? 0)
    + (f.budgetAccommodation ?? 0)
    + (f.budgetRegistration ?? 0);
}

export function ConnectForm({
  applicationId,
  initial,
  initialDocuments,
  profile,
  isAdmin = false,
  endpointBase = "/api/equip/applications",
  allowDocuments = true,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState<VentureConnectFormData>(() => ({
    // Pre-fill identity fields from profile so the user doesn't
    // re-type what we already know.
    fullName: initial.fullName ?? profile.name ?? "",
    institutionAffiliation: initial.institutionAffiliation ?? profile.organization ?? "",
    institutionEmail: initial.institutionEmail ?? profile.email ?? "",
    ...initial,
  }));
  const [documents, setDocuments] = useState<EquipDocument[]>(initialDocuments);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<string[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save: 800ms debounced PATCH after every edit.
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      startSaving(async () => {
        try {
          await fetch(`${endpointBase}/${applicationId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ formData: form }),
          });
          setSavedAt(new Date().toISOString());
          setError(null);
        } catch { /* silent — retry on next edit */ }
      });
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  function set<K extends keyof VentureConnectFormData>(key: K, value: VentureConnectFormData[K]) {
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
      const res = await fetch(`${endpointBase}/${applicationId}${endpointBase.includes("/public/") ? "" : "/submit"}`, { method: "POST" });
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

  const total = budgetTotal(form);
  const overCap = total > CAP;

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle inline-flex items-center gap-2">
            <Beaker size={11} className="text-brand-600" />
            EQUIP VentureConnect Grant Application
          </p>
          <h1 className="text-2xl font-bold text-fg tracking-tight mt-1">Your application</h1>
          <p className="text-[11px] text-muted mt-1 leading-snug max-w-2xl">
            Each company may submit up to three (3) separate applications. The
            maximum total funding available per company is <strong>$5,000 CAD</strong>.
            Each application may support attendance at one (1) conference,
            workshop, or pitch event.
          </p>
        </div>
        <SaveIndicator saving={saving} savedAt={savedAt} />
      </header>

      {/* No-AI disclaimer — surfaced prominently so applicants
          don't accidentally disqualify themselves. */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 flex items-start gap-2">
        <AlertTriangle size={14} className="text-amber-700 mt-0.5 shrink-0" />
        <p className="text-[11px] text-amber-900 leading-snug">
          <strong>No AI writing tools.</strong> {NO_AI_DISCLAIMER}
        </p>
      </div>

      {/* Admin-only test strip — populate the draft with a known-
          valid sample body, or wipe it clean. Renders only when
          isAdmin (admin / superadmin role); regular applicants
          never see this. */}
      {isAdmin && (
        <div className="rounded-2xl border border-dashed border-line bg-elevated/30 p-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-subtle inline-flex items-center gap-1.5 mr-auto">
            <FlaskConical size={11} className="text-amber-600" />
            Admin · form testing
          </span>
          <button
            type="button"
            onClick={() => setForm({ ...SAMPLE_VC, institutionAffiliation: profile.organization || SAMPLE_VC.institutionAffiliation })}
            className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm shadow-amber-600/25 transition-colors"
          >
            <FlaskConical size={11} /> Fill with sample
          </button>
          <button
            type="button"
            onClick={() => {
              if (!confirm("Clear every field in this draft?")) return;
              setForm({});
            }}
            className="inline-flex items-center gap-1.5 bg-card-solid hover:bg-elevated border border-line text-fg text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <Eraser size={11} /> Clear form
          </button>
        </div>
      )}

      {/* ── 1. Applicant Information ───────────────────────── */}
      <Section title="Applicant Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Full Name" required>
            <input value={form.fullName ?? ""} onChange={(e) => set("fullName", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Institution Email" required>
            <input type="email" value={form.institutionEmail ?? ""} onChange={(e) => set("institutionEmail", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Institution / Affiliation" required>
            <VentureConnectInstitutionSelect
              value={form.institutionAffiliation ?? ""}
              onChange={(value) => set("institutionAffiliation", value)}
            />
          </Field>
          <Field label="Department / Program" required>
            <input value={form.departmentProgram ?? ""} onChange={(e) => set("departmentProgram", e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Current Role" required>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
      </Section>

      {/* ── 2. Company Information ─────────────────────────── */}
      <Section title="Company Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Company Name" required>
            <input value={form.companyName ?? ""} onChange={(e) => set("companyName", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Website">
            <input
              type="url"
              value={form.companyWebsite ?? ""}
              onChange={(e) => set("companyWebsite", e.target.value)}
              placeholder="https://"
              className={inputCls}
            />
          </Field>
        </div>
        <Field
          label="Briefly describe your venture or innovation"
          hint="Overview of your technology, product, or service and its current development stage. If your company doesn't have publicly available information, attach a business pitch deck below to support your application."
          required
        >
          <textarea
            rows={5}
            value={form.ventureDescription ?? ""}
            onChange={(e) => set("ventureDescription", e.target.value)}
            className={textareaCls}
          />
        </Field>
      </Section>

      {/* ── 3. Intellectual Property Status ────────────────── */}
      <Section
        title="Intellectual Property (IP) Status"
        hint="Check any milestones the company has achieved and add the date for each."
      >
        <IpStatusFields ip={form.ip} setIp={setIp} />
      </Section>

      {/* ── 4. Funding Request Justification ───────────────── */}
      <Section title="Funding Request Justification">
        <div className="text-[11px] text-muted leading-snug space-y-1 mb-2">
          <p>Provide a concise summary of your funding request. Cover:</p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>How attendance at the event will advance your company&apos;s business opportunity.</li>
            <li><strong>Include specific examples</strong> (e.g. <em>Meet with investor X from Y VC firm on [date] to discuss potential seed-round investment</em>).</li>
            <li>Eligible activities: industry / investor conferences, customer demos (customers must be non-academic), pitch competitions.</li>
            <li>For entrepreneurship workshops or training programs, justify that equivalent training isn&apos;t available locally.</li>
            <li>Key outcomes you aim to achieve (partnerships, visibility, fundraising progress, etc.).</li>
          </ul>
        </div>
        <textarea
          rows={9}
          value={form.fundingJustification ?? ""}
          onChange={(e) => set("fundingJustification", e.target.value)}
          className={textareaCls}
        />
      </Section>

      {/* ── 5. Event Information ───────────────────────────── */}
      <Section
        title="Event Information"
        hint="One event per application. To attend a second, submit another application — each company may send up to three."
      >
        <Field label="Category" required>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {EVENT_CATEGORIES.map((opt) => (
              <RoleCheckbox
                key={opt.id}
                checked={form.eventCategory === opt.id}
                label={opt.label}
                onChange={() => set("eventCategory", opt.id as EventCategory)}
              />
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <Field label="Event Name" required>
            <input value={form.eventName ?? ""} onChange={(e) => set("eventName", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Location" required>
            <input value={form.eventLocation ?? ""} onChange={(e) => set("eventLocation", e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field
          label="Dates"
          hint="As the event advertises them — a range is fine. Example: 14–16 October 2026."
          required
        >
          <input
            value={form.eventDates ?? ""}
            onChange={(e) => set("eventDates", e.target.value)}
            className={inputCls}
          />
        </Field>
        {form.eventCategory === "customer_demo" && (
          <p className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] leading-snug text-amber-900">
            Customer demonstrations are eligible only when the customer is
            non-academic.
          </p>
        )}
        {form.eventCategory === "workshop" && (
          <p className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] leading-snug text-amber-900">
            For training and workshops, the justification below has to show that
            equivalent training is not available locally.
          </p>
        )}
      </Section>

      {/* ── 5. Budget & Supporting Documentation ───────────── */}
      <Section title="Budget & Supporting Documentation">
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] text-muted">Total amount requested (up to ${CAP.toLocaleString()} CAD):</p>
          <span className={"text-base font-bold tabular-nums " + (overCap ? "text-rose-700" : "text-fg")}>
            ${total.toLocaleString()} / ${CAP.toLocaleString()}
          </span>
        </div>
        <div className="rounded-xl border border-line bg-elevated/30 overflow-hidden">
          <BudgetRow heading label="Transportation" />
          <BudgetRow label="Airfare" value={form.budgetAirfare} onChange={(v) => set("budgetAirfare", v)} />
          <BudgetRow label="Train Fare" value={form.budgetTrainFare} onChange={(v) => set("budgetTrainFare", v)} />
          <BudgetRow label="Rideshare or Taxi (to / from airport)" value={form.budgetRideshareTaxi} onChange={(v) => set("budgetRideshareTaxi", v)} />
          <BudgetRow heading label="Accommodation" value={form.budgetAccommodation} onChange={(v) => set("budgetAccommodation", v)} />
          <BudgetRow heading label="Conference / Workshop / Pitch Registration Fees" value={form.budgetRegistration} onChange={(v) => set("budgetRegistration", v)} />
        </div>
        {overCap && (
          <p className="text-[11px] text-rose-700 inline-flex items-center gap-1.5 mt-2">
            <AlertCircle size={11} /> Total exceeds the ${CAP.toLocaleString()} cap. Trim a line to submit.
          </p>
        )}
        {/* The paper form prints this as a checklist, so it is one here
            too: an applicant can see what is still missing instead of
            inferring it from what is in the tray. Ticking a box is a
            statement of intent — the file itself goes in the tray below. */}
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">
            Supporting documentation
          </p>
          <p className="text-[11px] text-muted leading-snug mt-0.5">
            Tick what you are enclosing, then attach the files below.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            {SUPPORTING_DOCS.map((doc) => {
              const on = (form.supportingDocs ?? []).includes(doc.id);
              return (
                <RoleCheckbox
                  key={doc.id}
                  checked={on}
                  label={doc.label}
                  onChange={() => {
                    const current = form.supportingDocs ?? [];
                    set(
                      "supportingDocs",
                      (on
                        ? current.filter((d) => d !== doc.id)
                        : [...current, doc.id]) as SupportingDocKey[],
                    );
                  }}
                />
              );
            })}
          </div>
        </div>
      </Section>

      {/* Document tray — matches the PDF's "Supporting Documents
          Required" guidance + the pitch-deck callout in section
          2. Same trays LiftForm uses; reviewers can request more
          in-platform after submit. */}
      {allowDocuments && (
        <LiftDocumentTray
          applicationId={applicationId}
          documents={documents}
          onChange={setDocuments}
          endpointBase={endpointBase}
          blurb={endpointBase.includes("/public/")
            ? "Attach the supporting files listed above. Use a slot again to add another file of the same type."
            : undefined}
        />
      )}

      {/* ── 6. Signature (attestation) ─────────────────────── */}
      <Section title="Signature">
        <p className="text-[11px] text-muted leading-snug mb-2">
          I acknowledge that the information provided in this application
          is accurate and that the requested funds will be used for the
          purposes outlined in this application.
        </p>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.acknowledged === true}
            onChange={(e) => set("acknowledged", e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-xs text-fg">I acknowledge and agree.</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <Field label="Print Name" required>
            <input value={form.signaturePrintedName ?? ""} onChange={(e) => set("signaturePrintedName", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Date" required>
            <FourDigitDateInput
              value={form.signatureDate ?? ""}
              onChange={(value) => set("signatureDate", value)}
            />
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
          disabled={submitting || overCap}
          className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-bold px-5 py-2 rounded-xl shadow-sm shadow-brand-600/25 transition-colors"
        >
          {submitting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          Submit application
        </button>
      </div>
    </div>
  );
}

// ── Reusable atoms ────────────────────────────────────────────

const inputCls =
  "w-full bg-card-solid border border-line rounded-lg px-3 py-2 text-sm text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500";
const textareaCls = inputCls + " font-sans";

/** Native date controls accept extended years in some browsers. Keep
 * persisted EQUIP dates in the four-digit form reviewers expect. */
export function normalizeFourDigitDate(value: string): string {
  const extended = value.match(/^(\d{4})\d+(-\d{2}-\d{2})$/);
  return extended ? `${extended[1]}${extended[2]}` : value;
}

export function FourDigitDateInput({
  value,
  onChange,
  disabled = false,
  className = inputCls,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <input
      type="date"
      min="1000-01-01"
      max="9999-12-31"
      value={value}
      onInput={(event) => {
        const normalized = normalizeFourDigitDate(event.currentTarget.value);
        if (normalized !== event.currentTarget.value) {
          event.currentTarget.value = normalized;
          onChange(normalized);
        }
      }}
      onChange={(event) => onChange(normalizeFourDigitDate(event.target.value))}
      disabled={disabled}
      className={className}
    />
  );
}

export function VentureConnectInstitutionSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const unlistedValue = value.trim() && !VENTURE_CONNECT_INSTITUTION_NAMES.has(value)
    ? value
    : null;

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={inputCls}
      aria-label="Institution / Affiliation"
    >
      <option value="">Select your institution</option>
      {unlistedValue && <option value={unlistedValue}>{unlistedValue}</option>}
      {VENTURE_CONNECT_INSTITUTIONS.map((institution) => (
        <option key={institution.slug} value={institution.name}>
          {institution.name}
        </option>
      ))}
    </select>
  );
}

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
      <IpRow
        label="Invention Disclosure to Home Institution"
        checked={block.inventionDisclosureChecked === true}
        date={block.inventionDisclosureDate}
        onToggle={(v) => setIp("inventionDisclosureChecked", v)}
        onDate={(d) => setIp("inventionDisclosureDate", d)}
      />
      <IpRow
        label="Provisional Patent Application Filed"
        checked={block.provisionalPatentChecked === true}
        date={block.provisionalPatentDate}
        onToggle={(v) => setIp("provisionalPatentChecked", v)}
        onDate={(d) => setIp("provisionalPatentDate", d)}
      />
      <IpRow
        label="Full Patent Application Filed"
        checked={block.fullPatentChecked === true}
        date={block.fullPatentDate}
        onToggle={(v) => setIp("fullPatentChecked", v)}
        onDate={(d) => setIp("fullPatentDate", d)}
      />
      <IpRow
        label="Licensed Technology"
        checked={block.licensedTechnologyChecked === true}
        date={block.licensedTechnologyDate}
        onToggle={(v) => setIp("licensedTechnologyChecked", v)}
        onDate={(d) => setIp("licensedTechnologyDate", d)}
      />
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
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
          className="shrink-0"
        />
        <span className="text-xs font-bold text-fg">{label}</span>
      </label>
      <FourDigitDateInput
        value={date ?? ""}
        onChange={onDate}
        disabled={!checked}
        className={inputCls + " w-44 disabled:opacity-40"}
      />
    </div>
  );
}

function BudgetRow({
  label, value, onChange, heading,
}: {
  label: string;
  value?: number;
  onChange?: (v: number) => void;
  heading?: boolean;
}) {
  if (heading && onChange === undefined) {
    return (
      <div className="px-3 py-2 bg-elevated/60 text-[10px] uppercase tracking-wider font-bold text-subtle border-b border-line">
        {label}
      </div>
    );
  }
  return (
    <div className={"px-3 py-2 border-b border-line last:border-b-0 flex items-center gap-3 " + (heading ? "bg-elevated/40" : "")}>
      <span className={"flex-1 text-xs " + (heading ? "font-bold text-fg" : "text-fg")}>
        {label}
      </span>
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted">$</span>
        <input
          type="number"
          min={0}
          step={50}
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value === "" ? 0 : Number(e.target.value))}
          className={inputCls + " w-28 tabular-nums"}
        />
      </div>
    </div>
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
    // This is a display-only relative timestamp; it does not affect form state.
    // eslint-disable-next-line react-hooks/purity
    const seconds = Math.max(0, Math.round((Date.now() - new Date(savedAt).getTime()) / 1000));
    return (
      <span className="text-[11px] text-emerald-700 inline-flex items-center gap-1.5">
        <Check size={11} /> Saved {seconds}s ago
      </span>
    );
  }
  return null;
}
