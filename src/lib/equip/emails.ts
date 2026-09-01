/**
 * EQUIP application emails — the full lifecycle, for both streams
 * (VentureConnect + VentureLift), with ADMIN-EDITABLE copy.
 *
 * How it works
 *   • Copy lives as EditableFields (subject, heading, paragraphs, CTA label,
 *     footnote) per (template id, stream). Defaults are in TEMPLATE_DEFAULTS;
 *     admin overrides persist in PlatformSetting "equipEmailTemplateOverrides"
 *     and win over defaults field-by-template.
 *   • Fields are plain text with {{placeholders}} (resolved per applicant,
 *     values HTML-escaped) and **bold** markers. The same strings render the
 *     HTML (branded, email-safe shell) and the plain-text part, so previews,
 *     edits, and live sends can never drift apart.
 *   • Reviewer / disbursement notes are appended automatically as a quoted
 *     callout when present — they're applicant-specific, not template copy.
 *   • CTA URLs are fixed per template (tracker or /equip) — labels are
 *     editable, destinations are not (no broken/phishy links from a typo).
 *
 * Wiring:
 *   • submission confirmation  → /api/equip/applications/[id]/submit
 *   • decision emails          → /api/admin/equip/applications/[id] (PATCH)
 *   • editing + AI assist      → /api/admin/equip/email-templates/*
 *   • preview gallery          → /admin/equip/email-templates
 */
import { prisma } from "@/lib/prisma";
import { STREAM_META, type EquipStream, type EquipStatus, type ApplicationStage } from "@/lib/equip/types";

export interface Built {
  subject: string;
  html: string;
  text: string;
}

/** Everything any EQUIP template might need. Builders read what they use. */
export interface EquipEmailCtx {
  applicantName?: string | null;
  stream: EquipStream;
  /** VL submission stage — distinguishes pre-screen vs full-app confirmation. */
  stage?: ApplicationStage;
  requestedAmount?: number | null;
  approvedAmount?: number | null;
  reviewerNote?: string | null;
  disbursementNote?: string | null;
  /** Human label for a deadline / milestone date, pre-formatted by the caller. */
  deadlineLabel?: string | null;
  milestoneTitle?: string | null;
  dueLabel?: string | null;
}

/** The editable surface of one template variant. Plain text +
 *  {{placeholders}} + **bold** markers. */
export interface EditableFields {
  subject: string;
  heading: string;
  paras: string[];
  ctaLabel?: string;
  footnote?: string;
}

export type EquipTemplateId =
  | "submission"
  | "under_review"
  | "pre_screen_passed"
  | "pre_screen_no"
  | "approved"
  | "not_selected"
  | "funded"
  | "deadline"
  | "milestone";

// ── Helpers ──────────────────────────────────────────────────────────────

function baseUrl(): string {
  const fromEnv =
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3001";
  return fromEnv.replace(/\/$/, "");
}

const trackerUrl = () => `${baseUrl()}/equip/my-applications`;

const BRAND = "#0e7490"; // teal-blue, on the BHN teal–blue–green family
const BRAND_DARK = "#0b5566";
const INK = "#0f172a";
const MUTE = "#64748b";
const LINE = "#e2e8f0";
const BG = "#f1f5f9";

const firstName = (name?: string | null) => {
  const n = (name ?? "").trim();
  if (!n) return "there";
  return n.split(/\s+/)[0];
};

function formatCad(n?: number | null): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  return `$${Math.round(n).toLocaleString("en-CA")} CAD`;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A note from the reviewer, rendered as a quoted callout (HTML). */
function noteBlockHtml(note?: string | null): string {
  const n = (note ?? "").trim();
  if (!n) return "";
  return `
    <tr><td style="padding:4px 0 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr><td style="border-left:3px solid ${BRAND};background:${BG};padding:12px 16px;border-radius:0 8px 8px 0;font-size:14px;line-height:1.6;color:${INK};">
          <span style="display:block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${MUTE};margin-bottom:4px;">Note from the review committee</span>
          ${esc(n).replace(/\n/g, "<br>")}
        </td></tr>
      </table>
    </td></tr>`;
}

/** Email-safe shell. Renders a branded card with optional CTA + footnote. */
function shell(opts: {
  preheader: string;
  heading: string;
  paras: string[]; // paragraph HTML (escaped + bold-converted)
  extraHtml?: string; // e.g. note callout rows (full <tr>…</tr> markup)
  cta?: { label: string; url: string };
  footnote?: string;
}): string {
  const { preheader, heading, paras, extraHtml = "", cta, footnote } = opts;
  const paraHtml = paras
    .map(
      (p) =>
        `<tr><td style="padding:0 0 14px;font-size:15px;line-height:1.65;color:${INK};">${p}</td></tr>`,
    )
    .join("");
  const ctaHtml = cta
    ? `<tr><td style="padding:8px 0 4px;">
         <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
           <tr><td style="border-radius:10px;background:${BRAND};">
             <a href="${cta.url}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(cta.label)}</a>
           </td></tr>
         </table>
       </td></tr>`
    : "";
  const footnoteHtml = footnote
    ? `<tr><td style="padding:14px 0 0;font-size:12.5px;line-height:1.6;color:${MUTE};">${footnote}</td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:${BG};">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};border-collapse:collapse;">
  <tr><td align="center" style="padding:28px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;border-collapse:collapse;">
      <!-- Header -->
      <tr><td style="padding:0 0 16px;">
        <span style="font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:${BRAND_DARK};">BioHubNet</span>
        <span style="font-size:13px;font-weight:600;letter-spacing:.06em;color:${MUTE};"> &nbsp;·&nbsp; EQUIP</span>
      </td></tr>
      <!-- Card -->
      <tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:16px;padding:32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr><td style="padding:0 0 16px;font-size:21px;font-weight:800;line-height:1.3;color:${INK};">${heading}</td></tr>
          ${paraHtml}
          ${extraHtml}
          ${ctaHtml}
          ${footnoteHtml}
        </table>
      </td></tr>
      <!-- Footer -->
      <tr><td style="padding:18px 8px 0;font-size:12px;line-height:1.6;color:${MUTE};">
        You're receiving this because you have an EQUIP application with BioHubNet.
        Questions? Reply to this email or write to
        <a href="mailto:info@biohubnet.ca" style="color:${BRAND_DARK};text-decoration:none;">info@biohubnet.ca</a>.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/** Plain-text counterpart — keeps deliverability high and covers text-only clients. */
function textVersion(opts: {
  heading: string;
  lines: string[];
  note?: string | null;
  ctaLabel?: string;
  ctaUrl?: string;
  footnote?: string;
}): string {
  const { heading, lines, note, ctaLabel, ctaUrl, footnote } = opts;
  const parts = [heading, "", ...lines];
  if (note && note.trim()) {
    parts.push("", "Note from the review committee:", note.trim());
  }
  if (ctaLabel && ctaUrl) parts.push("", `${ctaLabel}: ${ctaUrl}`);
  if (footnote) parts.push("", footnote);
  parts.push("", "—", "BioHubNet · EQUIP", "Questions? info@biohubnet.ca");
  return parts.join("\n");
}

// ── Placeholders ─────────────────────────────────────────────────────────

/** Resolve every supported {{placeholder}} for one applicant context.
 *  Values are RAW text here; the renderer escapes for HTML. */
export function resolvePlaceholders(ctx: EquipEmailCtx): Record<string, string> {
  const m = STREAM_META[ctx.stream];
  const isVl = ctx.stream === "venture_lift";
  const isVlFull = isVl && ctx.stage === "full_app";
  const submissionKind = isVl
    ? isVlFull
      ? `${m.name} Stage 2 (full) application`
      : `${m.name} Stage 1 (pre-screening) application`
    : `${m.name} application`;
  const nextSteps = isVl
    ? isVlFull
      ? "Your full application now goes to the review committee for evaluation against the six VentureLift criteria."
      : "Our committee will review your pre-screening submission. If it passes, you'll get an email unlocking the full Stage-2 application."
    : "Your application now goes to the review committee. VentureConnect runs on a monthly cycle, so you'll hear back after the current window closes.";
  const requested = formatCad(ctx.requestedAmount);
  const approved = formatCad(ctx.approvedAmount ?? ctx.requestedAmount);
  const funded = formatCad(ctx.approvedAmount);
  return {
    firstName: firstName(ctx.applicantName),
    fullName: (ctx.applicantName ?? "").trim() || "there",
    streamName: m.name,
    cadence: m.cadence,
    submissionKind,
    nextSteps,
    requestedAmount: requested,
    approvedAmount: approved,
    requestedAmountClause: requested ? ` requesting **${requested}**` : "",
    approvedAmountClause: approved ? ` for **${approved}**` : "",
    fundedAmountClause: funded ? ` of **${funded}**` : "",
    deadlineLabel: ctx.deadlineLabel ?? "soon",
    milestoneTitle: ctx.milestoneTitle ?? "a grant milestone",
    dueLabel: ctx.dueLabel ?? "soon",
  };
}

/** Placeholder docs shown in the editor UI. */
export const PLACEHOLDER_DOCS: { token: string; desc: string }[] = [
  { token: "{{firstName}}", desc: "Applicant's first name" },
  { token: "{{fullName}}", desc: "Applicant's full name" },
  { token: "{{streamName}}", desc: "VentureConnect / VentureLift" },
  { token: "{{cadence}}", desc: "Stream cadence (monthly / quarterly)" },
  { token: "{{submissionKind}}", desc: "What was submitted (stage-aware for VL)" },
  { token: "{{nextSteps}}", desc: "Stage-aware what-happens-next sentence" },
  { token: "{{requestedAmount}}", desc: "Requested amount, e.g. $4,200 CAD" },
  { token: "{{approvedAmount}}", desc: "Approved amount, e.g. $22,000 CAD" },
  { token: "{{requestedAmountClause}}", desc: "“ requesting $X CAD” or empty" },
  { token: "{{approvedAmountClause}}", desc: "“ for $X CAD” or empty" },
  { token: "{{fundedAmountClause}}", desc: "“ of $X CAD” or empty" },
  { token: "{{deadlineLabel}}", desc: "Deadline date label (reminder emails)" },
  { token: "{{milestoneTitle}}", desc: "Milestone title (reminder emails)" },
  { token: "{{dueLabel}}", desc: "Milestone due label (reminder emails)" },
];

// ── Defaults (the shipped copy, now data) ────────────────────────────────

type DefaultsMap = Record<EquipTemplateId, Partial<Record<EquipStream, EditableFields>>>;

const SUBMISSION_COMMON: Omit<EditableFields, "paras"> & { paras: string[] } = {
  subject: "We've received your {{streamName}} application",
  heading: "Application received",
  paras: [
    "Hi {{firstName}},",
    "Thanks — we've received your **{{submissionKind}}**{{requestedAmountClause}}. It's now in the queue.",
    "{{nextSteps}}",
    "You can track its status any time from your applications dashboard.",
  ],
  ctaLabel: "Track my application",
  footnote: "No action is needed right now — we'll email you at each step.",
};

const UNDER_REVIEW_COMMON: EditableFields = {
  subject: "Your {{streamName}} application is under review",
  heading: "Your application is under review",
  paras: [
    "Hi {{firstName}},",
    "Good news — a member of the EQUIP review committee has started evaluating your **{{streamName}}** application.",
    "There's nothing you need to do. We'll email you as soon as a decision is made.",
  ],
  ctaLabel: "View status",
};

const APPROVED_COMMON: EditableFields = {
  subject: "Your {{streamName}} application has been approved",
  heading: "Your application is approved 🎉",
  paras: [
    "Hi {{firstName}},",
    "Congratulations — your **{{streamName}}** application has been **approved**{{approvedAmountClause}}.",
    "Next, our team prepares the funding disbursement. You'll get a separate email once funds are released, along with the milestones tied to your grant.",
  ],
  ctaLabel: "View my approval",
};

const FUNDED_COMMON: EditableFields = {
  subject: "Your {{streamName}} grant has been funded",
  heading: "Your grant is funded",
  paras: [
    "Hi {{firstName}},",
    "Your **{{streamName}}** grant{{fundedAmountClause}} has been **funded**. 🎉",
    "Your grant milestones are now live on your dashboard — please keep them up to date as you progress. Reporting on outcomes is part of the program and helps us support the next cohort.",
  ],
  ctaLabel: "View my milestones",
};

const DEADLINE_COMMON: EditableFields = {
  subject: "Reminder: {{streamName}} deadline is {{deadlineLabel}}",
  heading: "{{streamName}} deadline approaching",
  paras: [
    "Hi {{firstName}},",
    "A quick reminder that the current **{{streamName}}** funding window closes **{{deadlineLabel}}**.",
    "If you've started an application, now's the time to finish and submit it — applications must be submitted before the window closes to be considered this cycle.",
  ],
  ctaLabel: "Finish my application",
};

const MILESTONE_COMMON: EditableFields = {
  subject: "Milestone due {{dueLabel}}: {{milestoneTitle}}",
  heading: "A grant milestone is coming up",
  paras: [
    "Hi {{firstName}},",
    "Your **{{streamName}}** grant milestone — **{{milestoneTitle}}** — is due **{{dueLabel}}**.",
    "Please update its status on your dashboard. Keeping milestones current is part of the funding agreement and helps us report program outcomes.",
  ],
  ctaLabel: "Update my milestones",
};

export const TEMPLATE_DEFAULTS: DefaultsMap = {
  submission: {
    venture_connect: SUBMISSION_COMMON,
    venture_lift: SUBMISSION_COMMON,
    innovation_fellowship: SUBMISSION_COMMON,
  },
  under_review: {
    venture_connect: UNDER_REVIEW_COMMON,
    venture_lift: UNDER_REVIEW_COMMON,
    innovation_fellowship: UNDER_REVIEW_COMMON,
  },
  pre_screen_passed: {
    venture_lift: {
      subject: "Your VentureLift pre-screening passed — Stage 2 is open",
      heading: "You're through to Stage 2",
      paras: [
        "Hi {{firstName}},",
        "Congratulations — your **VentureLift** pre-screening passed. The full Stage-2 application is now unlocked.",
        "Stage 2 covers Innovation, Market Potential, Project Plan, and Commercialization Potential & Impact, and asks for your CV and IP supporting documents (a filed provisional patent is the minimum). Funding is up to **$25,000 CAD**.",
      ],
      ctaLabel: "Open my Stage-2 application",
      footnote: "Tip: prepare Appendix 3 (IP documents) early — it's the hard eligibility gate for approval.",
    },
  },
  pre_screen_no: {
    venture_lift: {
      subject: "Update on your VentureLift pre-screening",
      heading: "Update on your pre-screening",
      paras: [
        "Hi {{firstName}},",
        "Thank you for your interest in **VentureLift**. After review, your pre-screening application wasn't selected to advance to Stage 2 this cycle.",
        "This isn't a reflection of your venture's potential — pre-screening is competitive and tightly scoped to the program's eligibility criteria. You're welcome to apply again in a future cycle.",
      ],
      ctaLabel: "Explore EQUIP streams",
    },
  },
  approved: {
    venture_connect: APPROVED_COMMON,
    venture_lift: APPROVED_COMMON,
    innovation_fellowship: APPROVED_COMMON,
  },
  not_selected: {
    venture_connect: {
      subject: "Update on your {{streamName}} application",
      heading: "Update on your application",
      paras: [
        "Hi {{firstName}},",
        "Thank you for applying to **{{streamName}}**. After careful review, your application wasn't selected for funding this round.",
        "Decisions are competitive and weighed against the program's criteria and available budget. VentureConnect runs monthly, and a company may submit up to three separate applications — you're welcome to apply again for a future event.",
      ],
      ctaLabel: "Explore EQUIP streams",
    },
    venture_lift: {
      subject: "Update on your {{streamName}} application",
      heading: "Update on your application",
      paras: [
        "Hi {{firstName}},",
        "Thank you for applying to **{{streamName}}**. After careful review, your application wasn't selected for funding this round.",
        "Decisions are competitive and weighed against the program's criteria and available budget. You're welcome to apply again in a future VentureLift cycle.",
      ],
      ctaLabel: "Explore EQUIP streams",
    },
    innovation_fellowship: {
      subject: "Update on your {{streamName}} application",
      heading: "Update on your application",
      paras: [
        "Hi {{firstName}},",
        "Thank you for applying to **{{streamName}}**. After careful review, your application wasn't selected for support this round.",
        "Decisions are competitive and weighed against the program criteria and available funding. You are welcome to apply again in a future application window.",
      ],
      ctaLabel: "Explore EQUIP streams",
    },
  },
  funded: {
    venture_connect: FUNDED_COMMON,
    venture_lift: FUNDED_COMMON,
    innovation_fellowship: FUNDED_COMMON,
  },
  deadline: {
    venture_connect: DEADLINE_COMMON,
    venture_lift: DEADLINE_COMMON,
    innovation_fellowship: DEADLINE_COMMON,
  },
  milestone: {
    venture_connect: MILESTONE_COMMON,
    venture_lift: MILESTONE_COMMON,
    innovation_fellowship: MILESTONE_COMMON,
  },
};

/** Which note (if any) each template appends, and where its CTA points. */
const TEMPLATE_BEHAVIOUR: Record<EquipTemplateId, { note: "reviewer" | "disbursement" | null; cta: "tracker" | "equip" }> = {
  submission:        { note: null,           cta: "tracker" },
  under_review:      { note: null,           cta: "tracker" },
  pre_screen_passed: { note: "reviewer",     cta: "tracker" },
  pre_screen_no:     { note: "reviewer",     cta: "equip" },
  approved:          { note: "reviewer",     cta: "tracker" },
  not_selected:      { note: "reviewer",     cta: "equip" },
  funded:            { note: "disbursement", cta: "tracker" },
  deadline:          { note: null,           cta: "tracker" },
  milestone:         { note: null,           cta: "tracker" },
};

// ── Rendering ────────────────────────────────────────────────────────────

/** Substitute placeholders with raw values. Unknown tokens become "". */
function substitute(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => values[key] ?? "");
}

/** Plain text + **bold** → escaped HTML with <strong>. */
function toHtml(s: string): string {
  return esc(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

const stripBold = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, "$1");

/** Render one template variant for one applicant context. Pure. */
export function renderEquipEmail(
  id: EquipTemplateId,
  ctx: EquipEmailCtx,
  fields: EditableFields,
): Built {
  const values = resolvePlaceholders(ctx);
  const behaviour = TEMPLATE_BEHAVIOUR[id];
  const note =
    behaviour.note === "reviewer" ? ctx.reviewerNote
    : behaviour.note === "disbursement" ? ctx.disbursementNote
    : null;
  const ctaUrl = behaviour.cta === "tracker" ? trackerUrl() : `${baseUrl()}/equip`;

  const subject = stripBold(substitute(fields.subject, values)).trim();
  const headingRaw = substitute(fields.heading, values);
  const parasRaw = fields.paras.map((p) => substitute(p, values)).filter((p) => p.trim().length > 0);
  const footnoteRaw = fields.footnote ? substitute(fields.footnote, values) : undefined;
  const ctaLabel = fields.ctaLabel ? stripBold(substitute(fields.ctaLabel, values)).trim() : undefined;

  const html = shell({
    preheader: stripBold(parasRaw[1] ?? parasRaw[0] ?? subject).slice(0, 140),
    heading: toHtml(headingRaw),
    paras: parasRaw.map(toHtml),
    extraHtml: noteBlockHtml(note),
    cta: ctaLabel ? { label: ctaLabel, url: ctaUrl } : undefined,
    footnote: footnoteRaw ? toHtml(footnoteRaw) : undefined,
  });

  const text = textVersion({
    heading: stripBold(headingRaw),
    lines: parasRaw.map(stripBold),
    note,
    ctaLabel,
    ctaUrl: ctaLabel ? ctaUrl : undefined,
    footnote: footnoteRaw ? stripBold(footnoteRaw) : undefined,
  });

  return { subject, html, text };
}

// ── Overrides (PlatformSetting persistence) ──────────────────────────────

const OVERRIDES_KEY = "equipEmailTemplateOverrides";
type OverrideMap = Record<string, EditableFields>; // key = `${id}:${stream}`

export const overrideKey = (id: EquipTemplateId, stream: EquipStream) => `${id}:${stream}`;

export async function getEquipTemplateOverrides(): Promise<OverrideMap> {
  const row = await prisma.platformSetting.findUnique({ where: { key: OVERRIDES_KEY } }).catch(() => null);
  if (!row) return {};
  try {
    const parsed = JSON.parse(row.value) as OverrideMap;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

async function writeOverrides(map: OverrideMap): Promise<void> {
  const value = JSON.stringify(map);
  await prisma.platformSetting.upsert({
    where: { key: OVERRIDES_KEY },
    update: { value },
    create: { key: OVERRIDES_KEY, value },
  });
}

export async function saveEquipTemplateOverride(
  id: EquipTemplateId,
  stream: EquipStream,
  fields: EditableFields,
): Promise<void> {
  const map = await getEquipTemplateOverrides();
  map[overrideKey(id, stream)] = fields;
  await writeOverrides(map);
}

export async function resetEquipTemplateOverride(id: EquipTemplateId, stream: EquipStream): Promise<void> {
  const map = await getEquipTemplateOverrides();
  delete map[overrideKey(id, stream)];
  await writeOverrides(map);
}

/** Default + override resolution for one variant. */
export function resolveTemplateFields(
  id: EquipTemplateId,
  stream: EquipStream,
  overrides: OverrideMap,
): { fields: EditableFields; isCustomized: boolean } {
  const def = TEMPLATE_DEFAULTS[id][stream];
  if (!def) {
    // Shouldn't happen for valid (id, stream) pairs — fall back defensively.
    return { fields: { subject: "", heading: "", paras: [] }, isCustomized: false };
  }
  const ov = overrides[overrideKey(id, stream)];
  return ov ? { fields: ov, isCustomized: true } : { fields: def, isCustomized: false };
}

/** Validate untrusted editor input into EditableFields. Null = invalid. */
export function sanitizeEditableFields(input: unknown): EditableFields | null {
  if (typeof input !== "object" || input === null) return null;
  const o = input as Record<string, unknown>;
  const str = (v: unknown, max: number) =>
    typeof v === "string" && v.trim().length > 0 && v.length <= max ? v.trim() : null;
  const subject = str(o.subject, 300);
  const heading = str(o.heading, 300);
  if (!subject || !heading) return null;
  if (!Array.isArray(o.paras) || o.paras.length === 0 || o.paras.length > 12) return null;
  const paras: string[] = [];
  for (const p of o.paras) {
    if (typeof p !== "string" || p.length > 2000) return null;
    if (p.trim().length > 0) paras.push(p.trim());
  }
  if (paras.length === 0) return null;
  const ctaLabel = typeof o.ctaLabel === "string" && o.ctaLabel.trim() ? o.ctaLabel.trim().slice(0, 80) : undefined;
  const footnote = typeof o.footnote === "string" && o.footnote.trim() ? o.footnote.trim().slice(0, 600) : undefined;
  return { subject, heading, paras, ctaLabel, footnote };
}

// ── High-level senders (used by the API routes) ──────────────────────────

const STATUS_TO_TEMPLATE: Partial<Record<EquipStatus, EquipTemplateId>> = {
  under_review: "under_review",
  pre_screen_approved: "pre_screen_passed",
  pre_screen_rejected: "pre_screen_no",
  approved: "approved",
  rejected: "not_selected",
  funded: "funded",
};

/** Map a decision target status to the right applicant email (override-aware).
 *  Returns null for statuses that shouldn't notify. */
export async function buildEquipStatusEmail(target: EquipStatus, ctx: EquipEmailCtx): Promise<Built | null> {
  const id = STATUS_TO_TEMPLATE[target];
  if (!id) return null;
  if (!TEMPLATE_DEFAULTS[id][ctx.stream]) return null; // e.g. pre-screen ids on VC
  const overrides = await getEquipTemplateOverrides();
  const { fields } = resolveTemplateFields(id, ctx.stream, overrides);
  return renderEquipEmail(id, ctx, fields);
}

/** Submission confirmation (override-aware). */
export async function buildEquipSubmissionEmail(ctx: EquipEmailCtx): Promise<Built> {
  const overrides = await getEquipTemplateOverrides();
  const { fields } = resolveTemplateFields("submission", ctx.stream, overrides);
  return renderEquipEmail("submission", ctx, fields);
}

// ── Catalogue (for the admin gallery) ────────────────────────────────────

export interface EquipEmailTemplateInfo {
  id: EquipTemplateId;
  label: string;
  when: string;
  /** Which streams this email is sent for. */
  appliesTo: "both" | EquipStream;
}

export const EQUIP_EMAIL_TEMPLATES: EquipEmailTemplateInfo[] = [
  { id: "submission",        label: "Submission received",          when: "Applicant submits an application",            appliesTo: "both" },
  { id: "under_review",      label: "Under review",                 when: "A reviewer claims the application",           appliesTo: "both" },
  { id: "pre_screen_passed", label: "Pre-screen passed (Stage 2)",  when: "VL pre-screening passes → Stage 2 unlocks",   appliesTo: "venture_lift" },
  { id: "pre_screen_no",     label: "Pre-screen not selected",      when: "VL pre-screening isn't selected to advance", appliesTo: "venture_lift" },
  { id: "approved",          label: "Approved",                     when: "Application is approved for funding",         appliesTo: "both" },
  { id: "not_selected",      label: "Not selected",                 when: "Application isn't selected for funding",      appliesTo: "both" },
  { id: "funded",            label: "Funded",                       when: "Funds are disbursed; milestones begin",      appliesTo: "both" },
  { id: "deadline",          label: "Deadline reminder",            when: "Funding window is closing soon",             appliesTo: "both" },
  { id: "milestone",         label: "Milestone reminder",           when: "A funded grant's milestone is due soon",     appliesTo: "both" },
];

export function isEquipTemplateId(v: unknown): v is EquipTemplateId {
  return typeof v === "string" && EQUIP_EMAIL_TEMPLATES.some((t) => t.id === v);
}

/** Realistic sample context for previewing a stream's templates. */
export function sampleEquipCtx(stream: EquipStream): EquipEmailCtx {
  return stream === "venture_connect"
    ? {
        applicantName: "Dr. Maya Chen",
        stream,
        requestedAmount: 4200,
        approvedAmount: 4200,
        reviewerNote: "Strong fit for the BIO International Convention — approved for airfare, registration, and two nights' accommodation.",
        deadlineLabel: "this Friday, June 27",
        milestoneTitle: "Submit post-event outcomes report",
        dueLabel: "in 2 weeks",
      }
    : {
        applicantName: "Dr. Maya Chen",
        stream,
        stage: "full_app",
        requestedAmount: 25000,
        approvedAmount: 22000,
        reviewerNote: "Compelling commercialization roadmap and a filed provisional patent. Budget trimmed to focus on the prototype milestone.",
        disbursementNote: "First tranche of $11,000 released; remainder on milestone 2 completion.",
        deadlineLabel: "June 30 (end of Q2 cycle)",
        milestoneTitle: "Complete functional prototype",
        dueLabel: "September 30",
      };
}
