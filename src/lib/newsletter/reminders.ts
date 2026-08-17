/**
 * Newsletter reminder dispatch — composing the four nudges and getting
 * them out exactly once.
 *
 * Idempotency: NewsletterReminder has UNIQUE (cycleId, kind) and the
 * sweep CLAIMS a row — flipping `pending` → `sent` inside a conditional
 * update — before it touches SMTP. If the cron runs twice, or a human
 * presses "send now" while the cron is mid-flight, the second writer
 * updates zero rows and returns without mailing. This is the same
 * claim-before-send discipline as OutreachSend, for the same reason: a
 * duplicate chase email to a program lead is worse than a missed one.
 *
 * Manual mode inverts the recipients rather than skipping the send: the
 * coordinator gets the fully composed message with the real To/Cc printed
 * at the top, so sending it by hand is a copy-paste, not a writing task.
 */
import { prisma } from "@/lib/prisma";
import { mailConfigured, sendMail } from "@/lib/mail";
import { REMINDER_LABEL, type ReminderKind, type ReminderMode } from "./schedule";
import { statHolidaysBetween } from "./calendar";
import { leadRecipients, type NewsletterConfig } from "./config";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const INK = "#1f2428";
const MUTED = "#6b7280";
const BRAND = "#016e8f";

function shell(
  heading: string,
  paras: string[],
  cta?: { label: string; url: string },
  /** Rendered block dropped in below the prose — the month calendar. */
  extra?: string,
): string {
  const body = paras
    .map((p) => `<tr><td style="padding:0 0 14px;font-size:15px;line-height:1.65;color:${INK};">${p}</td></tr>`)
    .join("");
  const extraRow = extra ? `<tr><td>${extra}</td></tr>` : "";
  const button = cta
    ? `<tr><td style="padding:8px 0 4px;"><a href="${esc(cta.url)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px;">${esc(cta.label)}</a></td></tr>`
    : "";
  return (
    `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f6f8fa;padding:24px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e9ee;border-radius:12px;">` +
    `<tbody><tr><td style="padding:28px 30px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tbody>` +
    `<tr><td style="padding:0 0 6px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${BRAND};font-weight:700;">BioHubNet Newsletter</td></tr>` +
    `<tr><td style="padding:0 0 16px;font-size:21px;line-height:1.3;color:${INK};font-weight:700;">${esc(heading)}</td></tr>` +
    body +
    extraRow +
    button +
    `</tbody></table></td></tr></tbody></table></div>`
  );
}

// ── the month calendar drawn into the email ──────────────────────────
//
// Recipients kept having to hold five prose dates in their head. A month
// grid says the same thing at a glance. Table + inline styles only: Gmail
// and Outlook strip <style> blocks, flexbox and grid, so this is built
// the way HTML email has always been built.

const CAL_DRAFT = "#fbe3b8";
const CAL_BUILD = "#cfe3f0";
const CAL_LINE = "#e5e9ee";
const CAL_OFF = "#aab3bd";

const pad2 = (n: number) => String(n).padStart(2, "0");
const isoOf = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;
/** ISO date strings sort lexicographically, so plain compares work. */
const within = (d: string, a: string, b: string) => d >= a && d <= b;

interface CycleDates {
  month: string;
  draftOpen: string;
  draftDue: string;
  buildStart: string;
  approvalDue: string;
  sendDate: string;
}

type Phase = "draft" | "build" | "send";

/** Bar colours and the wording drawn ON the bar — no legend to decode. */
const PHASE_STYLE: Record<Phase, { bg: string; fg: string; long: string; short: string }> = {
  draft: { bg: CAL_DRAFT, fg: INK, long: "Drafts", short: "Draft" },
  build: { bg: CAL_BUILD, fg: INK, long: "Build + review", short: "Review" },
  send: { bg: BRAND, fg: "#ffffff", long: "Issue sends", short: "Sends" },
};

const isWeekend = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 || wd === 6;
};

/**
 * Which phase a day belongs to — or none.
 *
 * Weekends and holidays are never part of a window. The schedule counts
 * business days, so a draft window that reads Thu→Mon is two working
 * days, not five; shading the weekend would tell the leads they were
 * expected to write through it.
 */
function phaseOf(day: string, cycle: CycleDates, holidays: Set<string>): Phase | null {
  if (day === cycle.sendDate) return "send";
  if (isWeekend(day) || holidays.has(day)) return null;
  if (within(day, cycle.buildStart, cycle.approvalDue)) return "build";
  if (within(day, cycle.draftOpen, cycle.draftDue)) return "draft";
  return null;
}

/**
 * One month: a row of day numbers per week, and under it a row of bars
 * that span consecutive days of the same phase in one piece. Runs are
 * merged with colspan so a two-day window reads as one bar rather than
 * two shaded squares — the calendar convention for a multi-day event.
 */
function monthGrid(monthIso: string, cycle: CycleDates, holidays: Set<string>): string {
  const [y, m] = monthIso.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();

  // Flat list of 7-day weeks; null = padding outside the month.
  const days: ({ n: number; iso: string; phase: Phase | null; off: boolean } | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) days.push(null);
  for (let d = 1; d <= total; d++) {
    const iso = isoOf(y, m, d);
    days.push({
      n: d,
      iso,
      phase: phaseOf(iso, cycle, holidays),
      off: isWeekend(iso) || holidays.has(iso),
    });
  }
  while (days.length % 7 !== 0) days.push(null);

  const rows: string[] = [];
  for (let w = 0; w < days.length; w += 7) {
    const week = days.slice(w, w + 7);

    // Day numbers. Non-working days are greyed so "weekends don't count"
    // is visible even in a week with no bar over it.
    const numbers = week
      .map((c) =>
        `<td align="center" style="width:14.28%;padding:2px 0 0;font-size:12px;` +
        `color:${!c ? "transparent" : c.off ? CAL_OFF : INK};">${c ? c.n : "&nbsp;"}</td>`,
      )
      .join("");

    // Bars, merging consecutive same-phase days into one colspan cell.
    const bars: string[] = [];
    let i = 0;
    while (i < 7) {
      const p = week[i]?.phase ?? null;
      if (!p) {
        bars.push(`<td style="padding:0;">&nbsp;</td>`);
        i++;
        continue;
      }
      let j = i;
      while (j < 7 && week[j]?.phase === p) j++;
      const span = j - i;
      const s = PHASE_STYLE[p];
      const label = span >= 3 ? s.long : span === 2 ? s.long : s.short;
      bars.push(
        `<td colspan="${span}" style="padding:0;">` +
          `<div style="margin:1px;height:18px;line-height:18px;border-radius:4px;overflow:hidden;` +
          `background:${s.bg};color:${s.fg};font-size:9px;font-weight:700;letter-spacing:0.3px;` +
          `text-align:center;white-space:nowrap;">${esc(label)}</div></td>`,
      );
      i = j;
    }

    const hasBar = week.some((c) => c?.phase);
    rows.push(`<tr>${numbers}</tr>`);
    rows.push(
      hasBar
        ? `<tr>${bars.join("")}</tr>`
        : `<tr><td colspan="7" style="padding:0;height:5px;"></td></tr>`,
    );
  }

  const head = ["S", "M", "T", "W", "T", "F", "S"]
    .map(
      (d, i) =>
        `<th align="center" style="width:14.28%;padding:0 0 4px;font-size:10px;font-weight:700;` +
        `letter-spacing:0.6px;color:${i === 0 || i === 6 ? CAL_OFF : MUTED};">${d}</th>`,
    )
    .join("");

  return (
    `<div style="font-size:12px;font-weight:700;color:${INK};padding:0 0 6px;">${esc(monthLabel(monthIso))}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="border-collapse:collapse;table-layout:fixed;">` +
    `<thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table>`
  );
}

/** The grid(s) as one block for the email body. */
function calendarBlock(cycle: CycleDates, holidays: Set<string>): string {
  // Normally every milestone sits inside the issue month; a holiday shift
  // can pull the draft window back into the previous one, so render each
  // month that is actually touched rather than assuming one.
  const months = [...new Set(
    [cycle.draftOpen, cycle.draftDue, cycle.buildStart, cycle.approvalDue, cycle.sendDate]
      .map((d) => `${d.slice(0, 7)}-01`),
  )].sort();

  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="margin:2px 0 16px;border:1px solid ${CAL_LINE};border-radius:10px;background:#fbfcfd;">` +
    `<tbody><tr><td style="padding:14px 16px 12px;">` +
    months.map((mo) => monthGrid(mo, cycle, holidays)).join(`<div style="height:14px;"></div>`) +
    `</td></tr></tbody></table>`
  );
}

/** Plain-text counterpart of the grid, for the text/plain alternative. */
function calendarText(cycle: CycleDates): string {
  return [
    `  Drafts open   ${longDate(cycle.draftOpen)}`,
    `  Drafts due    ${longDate(cycle.draftDue)}`,
    `  Build starts  ${longDate(cycle.buildStart)}`,
    `  Approval due  ${longDate(cycle.approvalDue)}`,
    `  ISSUE SENDS   ${longDate(cycle.sendDate)}`,
    `  (working days only — weekends and holidays excluded)`,
  ].join("\n");
}

export interface ReminderContext {
  kind: ReminderKind;
  config: NewsletterConfig;
  cycle: {
    month: string;
    draftOpen: string;
    draftDue: string;
    buildStart: string;
    approvalDue: string;
    sendDate: string;
  };
  /** Absolute URL of the newsletter workshop, for the CTA. */
  workshopUrl: string;
}

/** Pretty "Friday, 14 August" for a "YYYY-MM-DD". */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** "August 2026" from a "YYYY-MM-01". */
export function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export interface ComposedReminder {
  subject: string;
  text: string;
  html: string;
  to: string[];
  cc: string[];
  /** Structured pieces, so the send dialog can show and edit the message
   *  rather than firing an opaque template. `paras` is the editable
   *  source of truth; html/text are rendered from it. */
  heading: string;
  paras: string[];
  cta?: { label: string; url: string };
  /** The cycle this is about, so the calendar can be re-rendered after
   *  the prose is edited without the edit dropping the grid. */
  cycle: CycleDates;
  /** Non-working days folded into the grid, as "YYYY-MM-DD". */
  holidays: string[];
}

/** What an admin may change in the send dialog before the mail goes out. */
export interface ReminderOverrides {
  subject?: string;
  to?: string[];
  cc?: string[];
  paras?: string[];
}

/** Paragraph source is plain text with `**bold**`; everything else is
 *  escaped, so an edited paragraph can never inject markup. */
const inlineHtml = (md: string) =>
  esc(md).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
const inlineText = (md: string) => md.replace(/\*\*/g, "");

/** Render the branded shell + plain-text alternative from the pieces. */
export function renderReminder(parts: {
  heading: string;
  paras: string[];
  cta?: { label: string; url: string };
  cycle: CycleDates;
  holidays: string[];
}): { html: string; text: string } {
  return {
    html: shell(
      parts.heading,
      parts.paras.map(inlineHtml),
      parts.cta,
      calendarBlock(parts.cycle, new Set(parts.holidays)),
    ),
    text:
      `${parts.heading}\n\n` +
      parts.paras.map(inlineText).join("\n\n") +
      `\n\nTHIS ISSUE\n${calendarText(parts.cycle)}\n` +
      (parts.cta ? `\n${parts.cta.label}: ${parts.cta.url}\n` : ""),
  };
}

/** The message each reminder kind sends, and who it goes to. */
export function composeReminder(ctx: ReminderContext): ComposedReminder {
  const { cycle, config } = ctx;
  const month = monthLabel(cycle.month);
  const leads = leadRecipients(config);

  // Non-working days for every month the cycle touches. Computed rather
  // than configured, matching how the planner decides the dates in the
  // first place — the grid and the schedule agree by construction.
  const first = [cycle.draftOpen, cycle.sendDate].sort()[0];
  const holidays = [
    ...new Set([
      ...config.schedule.holidays,
      ...(config.useStatHolidays ? statHolidaysBetween(`${first.slice(0, 7)}-01`, 2) : []),
    ]),
  ];

  /** The coordinator is copied on anything they are not already on, so
   *  the person running the cycle always has a record of what went out. */
  const withCoordinator = (to: string[], cc: string[]) => {
    const coord = config.coordinator.email;
    const has = (list: string[]) => list.some((e) => e.toLowerCase() === coord.toLowerCase());
    return has(to) || has(cc) ? cc : [...cc, coord];
  };

  const build = (p: {
    subject: string;
    heading: string;
    paras: string[];
    cta?: { label: string; url: string };
    to: string[];
    cc: string[];
  }): ComposedReminder => ({
    ...p,
    cc: withCoordinator(p.to, p.cc),
    cycle,
    holidays,
    ...renderReminder({ heading: p.heading, paras: p.paras, cta: p.cta, cycle, holidays }),
  });

  switch (ctx.kind) {
    case "draft_request":
      return build({
        subject: `${month} newsletter — your section is due ${longDate(cycle.draftDue)}`,
        heading: `${month} newsletter — drafts open`,
        paras: [
          `The **${month}** newsletter goes out on **${longDate(cycle.sendDate)}**.`,
          `Please drop your section into the workshop by **end of day ${longDate(cycle.draftDue)}**. Plain prose is fine — no formatting needed. The layout is generated from what you write.`,
          `Building and review run ${longDate(cycle.buildStart)}–${longDate(cycle.approvalDue)}, so anything after the deadline misses this issue.`,
        ],
        cta: { label: "Add your section", url: ctx.workshopUrl },
        to: leads,
        cc: config.cc,
      });

    case "draft_due":
      return build({
        subject: `Today: ${month} newsletter drafts close`,
        heading: `${month} drafts close today`,
        paras: [
          `A reminder that **${month}** newsletter sections are due **end of day today**.`,
          `If yours is already in, thank you — nothing further needed. Building starts ${longDate(cycle.buildStart)}.`,
        ],
        cta: { label: "Add your section", url: ctx.workshopUrl },
        to: leads,
        cc: config.cc,
      });

    case "approval":
      return build({
        subject: `${month} newsletter is ready for your approval`,
        heading: `${month} needs your approval`,
        paras: [
          `The **${month}** issue has been built and reviewed, and goes out **${longDate(cycle.sendDate)}**.`,
          `It needs your sign-off before it sends. Open the review, read it through, and press Approve.`,
        ],
        cta: { label: "Review and approve", url: `${ctx.workshopUrl}/review` },
        to: [config.approver.email],
        cc: [],
      });

    case "send_day":
      return build({
        subject: `Send day: the ${month} newsletter goes out today`,
        heading: `${month} goes out today`,
        paras: [
          `Today is the send day for the **${month}** issue.`,
          `Generate the final HTML in the workshop, paste it into the Mailchimp code block, and send.`,
        ],
        cta: { label: "Open the workshop", url: ctx.workshopUrl },
        to: [config.coordinator.email],
        cc: [],
      });
  }
}

/**
 * Fold an admin's edits from the send dialog into a composed message.
 * An explicitly empty `cc` clears the copy list; an omitted one keeps it.
 */
export function applyOverrides(
  base: ComposedReminder,
  o?: ReminderOverrides,
): ComposedReminder {
  if (!o) return base;
  const paras = o.paras?.length ? o.paras : base.paras;
  return {
    ...base,
    subject: o.subject?.trim() || base.subject,
    to: o.to?.length ? o.to : base.to,
    cc: o.cc ?? base.cc,
    paras,
    ...renderReminder({
      heading: base.heading,
      paras,
      cta: base.cta,
      cycle: base.cycle,
      holidays: base.holidays,
    }),
  };
}

/**
 * Wrap a composed message for MANUAL delivery: the coordinator receives
 * it with the intended recipients printed at the top, so they can send it
 * on themselves. Nothing reaches the leads from the platform.
 */
export function wrapForManualSend(
  msg: ComposedReminder,
  config: NewsletterConfig,
  kind: ReminderKind,
): ComposedReminder {
  const toLine = msg.to.join(", ");
  const ccLine = msg.cc.join(", ");
  const banner =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto 12px;background:#fff8e6;border:1px solid #f0d9a0;border-radius:10px;font-family:system-ui,-apple-system,sans-serif;">` +
    `<tbody><tr><td style="padding:14px 18px;font-size:14px;line-height:1.6;color:${INK};">` +
    `<strong>Action needed — send this yourself.</strong><br>` +
    `<span style="color:${MUTED};">${esc(REMINDER_LABEL[kind])} for this cycle is set to manual, so nothing has gone to the leads.</span><br><br>` +
    `<strong>To:</strong> ${esc(toLine)}<br>` +
    (ccLine ? `<strong>Cc:</strong> ${esc(ccLine)}<br>` : "") +
    `<strong>Subject:</strong> ${esc(msg.subject)}` +
    `</td></tr></tbody></table>`;

  return {
    ...msg,
    subject: `[Send this] ${msg.subject}`,
    html: banner + msg.html,
    text:
      `ACTION NEEDED — send this yourself.\n` +
      `${REMINDER_LABEL[kind]} is set to manual, so nothing has gone to the leads.\n\n` +
      `To: ${toLine}\n` +
      (ccLine ? `Cc: ${ccLine}\n` : "") +
      `Subject: ${msg.subject}\n\n` +
      `---\n\n${msg.text}`,
    to: [config.coordinator.email],
    cc: [],
  };
}

/**
 * Send the composed mail to ONE address — the admin looking at it — and
 * touch nothing else. No claim, no status change, nothing to the real
 * recipients, so a test can be repeated as often as needed. The subject
 * and a banner both say TEST, because the one failure mode that matters
 * here is a test being mistaken for the real chase.
 */
export async function sendTestReminder(opts: {
  reminderId: string;
  config: NewsletterConfig;
  workshopUrl: string;
  to: string;
  overrides?: ReminderOverrides;
}): Promise<{ ok: boolean; to: string; error?: string }> {
  const reminder = await prisma.newsletterReminder.findUnique({
    where: { id: opts.reminderId },
    include: { cycle: true },
  });
  if (!reminder) throw new Error("Reminder not found");
  if (!mailConfigured()) {
    return { ok: false, to: opts.to, error: "Email isn't configured on this platform (no SMTP)." };
  }

  const kind = reminder.kind as ReminderKind;
  const msg = applyOverrides(
    composeReminder({
      kind,
      config: opts.config,
      cycle: reminder.cycle,
      workshopUrl: opts.workshopUrl,
    }),
    opts.overrides,
  );

  const banner =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto 12px;background:#eef6ff;border:1px solid #b9d8f5;border-radius:10px;font-family:system-ui,-apple-system,sans-serif;">` +
    `<tbody><tr><td style="padding:14px 18px;font-size:14px;line-height:1.6;color:${INK};">` +
    `<strong>Test copy — nobody else received this.</strong><br>` +
    `<span style="color:${MUTED};">${esc(REMINDER_LABEL[kind])}. Sent for real, it would go to:</span><br>` +
    `<strong>To:</strong> ${esc(msg.to.join(", "))}<br>` +
    (msg.cc.length ? `<strong>Cc:</strong> ${esc(msg.cc.join(", "))}<br>` : "") +
    `<strong>Subject:</strong> ${esc(msg.subject)}` +
    `</td></tr></tbody></table>`;

  try {
    await sendMail({
      to: opts.to,
      subject: `[TEST] ${msg.subject}`,
      html: banner + msg.html,
      text:
        `TEST COPY — nobody else received this.\n` +
        `Sent for real it would go to: ${msg.to.join(", ")}\n` +
        (msg.cc.length ? `Cc: ${msg.cc.join(", ")}\n` : "") +
        `Subject: ${msg.subject}\n\n---\n\n${msg.text}`,
      replyTo: opts.config.coordinator.email,
    });
    return { ok: true, to: opts.to };
  } catch (e) {
    return { ok: false, to: opts.to, error: (e as Error).message || "Send failed" };
  }
}

export interface DispatchResult {
  reminderId: string;
  kind: ReminderKind;
  status: "sent" | "skipped" | "failed" | "already";
  to: string[];
  cc: string[];
  error?: string;
}

export interface ReminderPreview {
  reminderId: string;
  kind: ReminderKind;
  label: string;
  status: string;
  scheduledFor: string;
  mode: ReminderMode;
  /** Editable pieces, as they stand before any edits are applied. */
  subject: string;
  heading: string;
  paras: string[];
  /** Who the reminder is FOR. In manual mode these are printed in the
   *  coordinator's banner rather than being mailed directly. */
  to: string[];
  cc: string[];
  /** Who the platform will actually deliver to right now. */
  deliverTo: string[];
  deliverCc: string[];
  /** Rendered HTML of exactly what lands in the inbox. */
  html: string;
  /** False when SMTP isn't configured — the send would be recorded as
   *  skipped rather than delivered, so the dialog warns first. */
  mailConfigured: boolean;
  /** Where "send a test to me" would land — the viewer's own address. */
  testTo: string | null;
}

/**
 * Compose a reminder WITHOUT sending it, so the admin can read it, see
 * who it reaches, and adjust it first. Pass `overrides` to preview edits
 * live. Purely read-only: it never claims or mutates the reminder row.
 */
export async function previewReminder(opts: {
  reminderId: string;
  config: NewsletterConfig;
  workshopUrl: string;
  overrides?: ReminderOverrides;
  /** The signed-in admin, so the dialog can offer a test to themselves. */
  viewerEmail?: string | null;
}): Promise<ReminderPreview> {
  const reminder = await prisma.newsletterReminder.findUnique({
    where: { id: opts.reminderId },
    include: { cycle: true },
  });
  if (!reminder) throw new Error("Reminder not found");

  const kind = reminder.kind as ReminderKind;
  const base = applyOverrides(
    composeReminder({
      kind,
      config: opts.config,
      cycle: reminder.cycle,
      workshopUrl: opts.workshopUrl,
    }),
    opts.overrides,
  );
  // The row's mode is the per-reminder choice the calendar writes ("Let
  // me send it" / "Send automatically"); config.modes is only the default
  // it was seeded from. The row wins — otherwise that toggle is cosmetic
  // and a chase the admin claimed would still go straight to the leads.
  const mode: ReminderMode =
    reminder.mode === "auto" || reminder.mode === "manual"
      ? reminder.mode
      : (opts.config.modes[kind] ?? "manual");
  const delivered = mode === "manual" ? wrapForManualSend(base, opts.config, kind) : base;

  return {
    reminderId: reminder.id,
    kind,
    label: REMINDER_LABEL[kind],
    status: reminder.status,
    scheduledFor: reminder.scheduledFor,
    mode,
    subject: base.subject,
    heading: base.heading,
    paras: base.paras,
    to: base.to,
    cc: base.cc,
    deliverTo: delivered.to,
    deliverCc: delivered.cc,
    html: delivered.html,
    mailConfigured: mailConfigured(),
    testTo: opts.viewerEmail ?? null,
  };
}

/**
 * Send one reminder, exactly once.
 *
 * `sentById` marks a human-triggered send. `force` re-sends a reminder
 * that already went out — the only way past the claim, and only ever
 * reachable from an explicit admin action.
 */
export async function dispatchReminder(opts: {
  reminderId: string;
  config: NewsletterConfig;
  workshopUrl: string;
  sentById?: string | null;
  force?: boolean;
  /** Edits made in the send dialog. Applied before the manual-mode wrap,
   *  so a changed To/Subject shows in the coordinator's banner too. */
  overrides?: ReminderOverrides;
}): Promise<DispatchResult> {
  const reminder = await prisma.newsletterReminder.findUnique({
    where: { id: opts.reminderId },
    include: { cycle: true },
  });
  if (!reminder) throw new Error("Reminder not found");

  const kind = reminder.kind as ReminderKind;
  const base = applyOverrides(
    composeReminder({
      kind,
      config: opts.config,
      cycle: reminder.cycle,
      workshopUrl: opts.workshopUrl,
    }),
    opts.overrides,
  );
  // The row's mode is the per-reminder choice the calendar writes ("Let
  // me send it" / "Send automatically"); config.modes is only the default
  // it was seeded from. The row wins — otherwise that toggle is cosmetic
  // and a chase the admin claimed would still go straight to the leads.
  const mode: ReminderMode =
    reminder.mode === "auto" || reminder.mode === "manual"
      ? reminder.mode
      : (opts.config.modes[kind] ?? "manual");
  const msg = mode === "manual" ? wrapForManualSend(base, opts.config, kind) : base;

  // Claim: only a pending row may be taken. updateMany returns a count, so
  // a losing racer sees 0 and stops without mailing.
  if (!opts.force) {
    const claimed = await prisma.newsletterReminder.updateMany({
      where: { id: reminder.id, status: "pending" },
      data: { status: "sent", sentAt: new Date(), sentTo: msg.to, sentCc: msg.cc, sentById: opts.sentById ?? null },
    });
    if (claimed.count === 0) {
      return { reminderId: reminder.id, kind, status: "already", to: [], cc: [] };
    }
  }

  // SMTP unconfigured: leave the claim in place rather than unwinding it,
  // so switching SMTP on later doesn't fire a backlog of stale chases —
  // the same choice credits/expiry.ts makes for expiry notices.
  if (!mailConfigured()) {
    await prisma.newsletterReminder.update({
      where: { id: reminder.id },
      data: { status: "skipped", error: "SMTP not configured" },
    });
    return { reminderId: reminder.id, kind, status: "skipped", to: msg.to, cc: msg.cc };
  }

  try {
    await sendMail({
      to: msg.to.join(", "),
      cc: msg.cc,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      replyTo: opts.config.coordinator.email,
    });
    await prisma.newsletterReminder.update({
      where: { id: reminder.id },
      data: {
        status: "sent",
        sentAt: new Date(),
        sentTo: msg.to,
        sentCc: msg.cc,
        error: null,
        sentById: opts.sentById ?? null,
      },
    });
    return { reminderId: reminder.id, kind, status: "sent", to: msg.to, cc: msg.cc };
  } catch (e) {
    const error = (e as Error).message || "Send failed";
    await prisma.newsletterReminder.update({
      where: { id: reminder.id },
      data: { status: "failed", error },
    });
    return { reminderId: reminder.id, kind, status: "failed", to: msg.to, cc: msg.cc, error };
  }
}

/**
 * The daily sweep: send every pending reminder whose day has arrived.
 * Runs from daily-maintenance rather than its own cron — the Hobby plan
 * caps this project at two cron entries and both are spoken for.
 *
 * `today` is passed in so the sweep is testable and so a manual "catch up"
 * run can be reasoned about.
 */
export async function sweepDueReminders(opts: {
  today: string; // "YYYY-MM-DD"
  config: NewsletterConfig;
  workshopUrl: string;
}): Promise<{ due: number; results: DispatchResult[] }> {
  const due = await prisma.newsletterReminder.findMany({
    where: { status: "pending", scheduledFor: { lte: opts.today } },
    orderBy: { scheduledFor: "asc" },
    select: { id: true },
    take: 50,
  });

  const results: DispatchResult[] = [];
  for (const r of due) {
    try {
      results.push(
        await dispatchReminder({
          reminderId: r.id,
          config: opts.config,
          workshopUrl: opts.workshopUrl,
        }),
      );
    } catch (e) {
      // One bad reminder must never abort the sweep.
      results.push({
        reminderId: r.id,
        kind: "draft_request",
        status: "failed",
        to: [],
        cc: [],
        error: (e as Error).message,
      });
    }
  }
  return { due: due.length, results };
}
