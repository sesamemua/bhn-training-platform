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
import { REMINDER_LABEL, type ReminderKind } from "./schedule";
import { leadRecipients, type NewsletterConfig } from "./config";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const INK = "#1f2428";
const MUTED = "#6b7280";
const BRAND = "#016e8f";

function shell(heading: string, paras: string[], cta?: { label: string; url: string }): string {
  const body = paras
    .map((p) => `<tr><td style="padding:0 0 14px;font-size:15px;line-height:1.65;color:${INK};">${p}</td></tr>`)
    .join("");
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
    button +
    `</tbody></table></td></tr></tbody></table></div>`
  );
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
}

/** The message each reminder kind sends, and who it goes to. */
export function composeReminder(ctx: ReminderContext): ComposedReminder {
  const { cycle, config } = ctx;
  const month = monthLabel(cycle.month);
  const leads = leadRecipients(config);

  switch (ctx.kind) {
    case "draft_request": {
      const subject = `${month} newsletter — your section is due ${longDate(cycle.draftDue)}`;
      const paras = [
        `The <strong>${esc(month)}</strong> newsletter goes out on <strong>${esc(longDate(cycle.sendDate))}</strong>.`,
        `Please drop your section into the workshop by <strong>end of day ${esc(longDate(cycle.draftDue))}</strong>. Plain prose is fine — no formatting needed. The layout is generated from what you write.`,
        `Building and review run ${esc(longDate(cycle.buildStart))}–${esc(longDate(cycle.approvalDue))}, so anything after the deadline misses this issue.`,
      ];
      return {
        subject,
        html: shell(`${month} newsletter — drafts open`, paras, {
          label: "Add your section",
          url: ctx.workshopUrl,
        }),
        text:
          `${month} newsletter — drafts open\n\n` +
          `The ${month} newsletter goes out on ${longDate(cycle.sendDate)}.\n\n` +
          `Please add your section by end of day ${longDate(cycle.draftDue)}. Plain prose is fine.\n\n` +
          `Build + review: ${longDate(cycle.buildStart)}–${longDate(cycle.approvalDue)}.\n\n` +
          `Add your section: ${ctx.workshopUrl}\n`,
        to: leads,
        cc: config.cc,
      };
    }

    case "draft_due": {
      const subject = `Today: ${month} newsletter drafts close`;
      const paras = [
        `A reminder that <strong>${esc(month)}</strong> newsletter sections are due <strong>end of day today</strong>.`,
        `If yours is already in, thank you — nothing further needed. Building starts ${esc(longDate(cycle.buildStart))}.`,
      ];
      return {
        subject,
        html: shell(`${month} drafts close today`, paras, {
          label: "Add your section",
          url: ctx.workshopUrl,
        }),
        text:
          `${month} drafts close today\n\n` +
          `Sections are due end of day today. Building starts ${longDate(cycle.buildStart)}.\n\n` +
          `${ctx.workshopUrl}\n`,
        to: leads,
        cc: config.cc,
      };
    }

    case "approval": {
      const subject = `${month} newsletter is ready for your approval`;
      const paras = [
        `The <strong>${esc(month)}</strong> issue has been built and reviewed, and goes out <strong>${esc(longDate(cycle.sendDate))}</strong>.`,
        `It needs your sign-off before it sends. Open the review, read it through, and press Approve.`,
      ];
      return {
        subject,
        html: shell(`${month} needs your approval`, paras, {
          label: "Review and approve",
          url: `${ctx.workshopUrl}/review`,
        }),
        text:
          `${month} newsletter is ready for your approval\n\n` +
          `Built and reviewed; goes out ${longDate(cycle.sendDate)}.\n\n` +
          `Review and approve: ${ctx.workshopUrl}/review\n`,
        to: [config.approver.email],
        cc: [],
      };
    }

    case "send_day": {
      const subject = `Send day: the ${month} newsletter goes out today`;
      const paras = [
        `Today is the send day for the <strong>${esc(month)}</strong> issue.`,
        `Generate the final HTML in the workshop, paste it into the Mailchimp code block, and send.`,
      ];
      return {
        subject,
        html: shell(`${month} goes out today`, paras, {
          label: "Open the workshop",
          url: ctx.workshopUrl,
        }),
        text:
          `Send day: the ${month} newsletter goes out today.\n\n` +
          `Generate the HTML, paste into Mailchimp, send.\n\n${ctx.workshopUrl}\n`,
        to: [config.coordinator.email],
        cc: [],
      };
    }
  }
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

export interface DispatchResult {
  reminderId: string;
  kind: ReminderKind;
  status: "sent" | "skipped" | "failed" | "already";
  to: string[];
  cc: string[];
  error?: string;
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
}): Promise<DispatchResult> {
  const reminder = await prisma.newsletterReminder.findUnique({
    where: { id: opts.reminderId },
    include: { cycle: true },
  });
  if (!reminder) throw new Error("Reminder not found");

  const kind = reminder.kind as ReminderKind;
  const base = composeReminder({
    kind,
    config: opts.config,
    cycle: reminder.cycle,
    workshopUrl: opts.workshopUrl,
  });
  const mode = opts.config.modes[kind] ?? "manual";
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
