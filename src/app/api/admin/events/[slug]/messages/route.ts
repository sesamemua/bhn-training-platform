/**
 * Event bulk-email broadcast — admin compose + send.
 *
 *   POST /api/admin/events/[slug]/messages
 *     body: { subject, body (markdown), audienceFilter }
 *     Sends the same email to every registrant in the audience filter.
 *     Records an EventBroadcast row for audit + future re-send.
 *
 *   GET /api/admin/events/[slug]/messages
 *     Lists past broadcasts (subject + audience + sent count).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendMail, mailConfigured } from "@/lib/mail";

export const runtime = "nodejs";

const VALID_AUDIENCES = ["all", "confirmed", "pending", "waitlist", "checked_in"] as const;
type Audience = (typeof VALID_AUDIENCES)[number];

function isAudience(v: unknown): v is Audience {
  return typeof v === "string" && (VALID_AUDIENCES as readonly string[]).includes(v);
}

/** Very light markdown → HTML. Handles: line breaks, bold (**text**),
 *  italic (*text*), and links ([label](url)). Keeps the email body
 *  templated by the same chrome as the registration confirmation. */
function mdToHtml(md: string): string {
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#3b6cef;">$1</a>')
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br>");
}

function htmlBody(opts: {
  eventTitle: string;
  bodyHtml: string;
  contactEmail: string;
}): string {
  const FONT_STACK =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:${FONT_STACK};color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background:linear-gradient(135deg,#0b1b3b,#3b6cef 75%);padding:28px 36px;color:#fff;">
          <p style="margin:0;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.78);font-weight:700;">From your hosts</p>
          <h1 style="margin:6px 0 0 0;font-size:22px;line-height:1.2;font-weight:700;">${opts.eventTitle}</h1>
        </td></tr>
        <tr><td style="padding:26px 36px;font-size:15px;line-height:1.6;color:#0f172a;">
          <p>${opts.bodyHtml}</p>
        </td></tr>
        <tr><td style="padding:20px 36px 28px 36px;border-top:1px solid #e2e8f0;background:#f8fafc;text-align:center;">
          <p style="margin:0;font-size:12px;color:#475569;line-height:1.6;">
            Questions? Reply to this email or contact <a href="mailto:${opts.contactEmail}" style="color:#3b6cef;text-decoration:none;">${opts.contactEmail}</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { slug } = await ctx.params;
  const event = await prisma.bhnEvent.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const broadcasts = await prisma.eventBroadcast.findMany({
    where: { eventId: event.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      subject: true,
      audienceFilter: true,
      recipientCount: true,
      sentCount: true,
      sentAt: true,
      createdAt: true,
      sentBy: { select: { name: true, email: true } },
    },
  });
  return NextResponse.json({ broadcasts });
}

interface PostBody {
  subject?: string;
  body?: string;
  audienceFilter?: string;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminUserId = (session.user as { id?: string }).id;
  if (!adminUserId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { slug } = await ctx.params;
  const event = await prisma.bhnEvent.findUnique({
    where: { slug },
    select: { id: true, title: true },
  });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  if (!mailConfigured()) {
    return NextResponse.json(
      { error: "SMTP is not configured. Set SMTP_* env vars on Vercel." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as PostBody;
  const subject  = body.subject?.trim();
  const md       = body.body?.trim();
  const audience = body.audienceFilter;

  if (!subject) return NextResponse.json({ error: "subject is required" }, { status: 400 });
  if (!md)      return NextResponse.json({ error: "body is required" },    { status: 400 });
  if (!isAudience(audience)) {
    return NextResponse.json(
      { error: `audienceFilter must be one of: ${VALID_AUDIENCES.join(", ")}` },
      { status: 400 },
    );
  }

  // Resolve recipient set.
  let where: Record<string, unknown> = { eventId: event.id };
  switch (audience) {
    case "confirmed":  where.registrationStatus = "confirmed"; break;
    case "pending":    where.registrationStatus = "pending";   break;
    case "waitlist":   where.registrationStatus = "waitlist";  break;
    case "checked_in": where = { ...where, checkedInAt: { not: null }, registrationStatus: { not: "cancelled" } }; break;
    case "all":        where.registrationStatus = { not: "cancelled" }; break;
  }
  const recipients = await prisma.registration.findMany({
    where,
    select: {
      guestEmail: true,
      guestName: true,
      user: { select: { email: true, name: true } },
    },
  });

  // Create the broadcast row up front so the audit is recorded even
  // if the send loop crashes part-way.
  const broadcast = await prisma.eventBroadcast.create({
    data: {
      eventId: event.id,
      sentById: adminUserId,
      subject,
      body: md,
      audienceFilter: audience,
      recipientCount: recipients.length,
    },
  });

  const contactEmail = process.env.SMTP_FROM_EMAIL ?? "info@biohubnet.ca";
  const html = htmlBody({ eventTitle: event.title, bodyHtml: mdToHtml(md), contactEmail });

  // Send loop. SMTP rate limits + retries are nodemailer's problem.
  let sent = 0;
  for (const r of recipients) {
    const to = r.user?.email ?? r.guestEmail;
    if (!to) continue;
    try {
      await sendMail({ to, subject, text: md, html });
      sent++;
    } catch (err) {
      console.error("Broadcast send failed:", to, (err as Error).message);
    }
  }

  await prisma.eventBroadcast.update({
    where: { id: broadcast.id },
    data: { sentAt: new Date(), sentCount: sent },
  });

  return NextResponse.json({
    ok: true,
    broadcastId: broadcast.id,
    recipientCount: recipients.length,
    sentCount: sent,
  });
}
