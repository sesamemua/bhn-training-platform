/**
 * Outreach — send a campaign's email from the platform.
 *
 *   POST /api/workspace/outreach/campaigns/[id]/send
 *     { personIds: string[], dryRun?: boolean }
 *
 * Admin only. Until this existed, Outreach could only draft: it handed the
 * user a mailto: link and they sent from their own client.
 *
 * Three properties this route is built around, because each one is a way to
 * mail a real partner organisation by mistake:
 *
 *   Idempotent — OutreachSend has a unique (campaignId, personId) and every
 *   recipient is claimed by inserting that row *before* the message goes out.
 *   A double-click, a retry, or a refreshed page loses the race and skips,
 *   rather than emailing someone twice.
 *
 *   Honest — the row records what was actually sent, including the rendered
 *   body, and a failure is recorded as a failure. The old sentPersonIds array
 *   had no way to say "attempted and bounced", so a failed send would have
 *   marked the contact reached and stamped introSentAt, quietly demoting them
 *   to the returning-contact template forever.
 *
 *   Bounded — SEND_BATCH_MAX per request, throttled, so a batch cannot outrun
 *   the serverless function timeout and strand itself half-sent. The client
 *   sends the next chunk when this one returns.
 *
 * dryRun runs every check and renders every message but sends nothing, which
 * is what the confirmation dialog shows.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mailConfigured, sendMail } from "@/lib/mail";
import { findTemplate, resolveOutreachTemplate } from "@/lib/outreach/templates";
import {
  SEND_BATCH_MAX,
  SEND_THROTTLE_MS,
  checkRecipient,
  composeBody,
  unsubscribeUrl,
} from "@/lib/outreach/send";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Schema = z.object({
  personIds: z.array(z.string().min(1).max(64)).min(1).max(SEND_BATCH_MAX),
  dryRun: z.boolean().optional(),
});

interface Outcome {
  personId: string;
  email: string;
  status: "sent" | "failed" | "skipped";
  detail?: string;
  subject?: string;
}

function values(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // Sending on the organisation's behalf is admin-only — a wider gate would
  // let anyone instructor+ email every partner in the directory.
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const meId = (session.user as { id?: string }).id ?? null;
  const meName = (session.user as { name?: string }).name ?? "BHN team";
  const meEmail = (session.user as { email?: string }).email ?? null;

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? `Select between 1 and ${SEND_BATCH_MAX} recipients.` },
      { status: 400 },
    );
  }
  const { personIds, dryRun } = parsed.data;

  if (!dryRun && !mailConfigured()) {
    return NextResponse.json(
      { error: "Email isn't configured on this deployment. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM." },
      { status: 503 },
    );
  }

  const campaign = await prisma.outreachCampaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "No such campaign." }, { status: 404 });

  const intro = findTemplate(campaign.templateId);
  const returning = campaign.returningTemplateId ? findTemplate(campaign.returningTemplateId) : null;
  if (!intro) return NextResponse.json({ error: "This campaign's template is missing." }, { status: 409 });

  const people = await prisma.outreachPerson.findMany({
    where: { id: { in: personIds } },
    select: { id: true, values: true, introSentAt: true, unsubscribedAt: true },
  });

  const origin = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
  const campaignVars = values(campaign.vars);

  const outcomes: Outcome[] = [];

  for (const person of people) {
    const v = values(person.values);
    const email = (v.email ?? "").trim();

    // A prior row for this pair means someone already sent — the unique index
    // makes that authoritative rather than advisory.
    const existing = await prisma.outreachSend.findUnique({
      where: { campaignId_personId: { campaignId: id, personId: person.id } },
      select: { status: true },
    });

    const verdict = checkRecipient({
      email,
      unsubscribedAt: person.unsubscribedAt,
      alreadySent: Boolean(existing && existing.status !== "failed"),
    });

    const tpl = person.introSentAt && returning ? returning : intro;
    // Same mapping the campaign screen uses (CampaignDetailClient.fillsFor),
    // so the message a sender previews is the message that goes out.
    const contactName = v.name ?? "";
    const { subject, body } = resolveOutreachTemplate(tpl, {
      ...campaignVars,
      firstName: contactName.split(" ")[0] ?? "",
      contactName,
      org: v.org ?? "",
      senderName: campaignVars.senderName || meName,
    });
    const text = composeBody(body, unsubscribeUrl(origin, person.id));

    if (!verdict.ok) {
      outcomes.push({ personId: person.id, email, status: "skipped", detail: verdict.detail, subject });
      if (!dryRun && verdict.reason !== "already-sent") {
        await prisma.outreachSend.upsert({
          where: { campaignId_personId: { campaignId: id, personId: person.id } },
          update: { status: "skipped", detail: verdict.detail ?? null },
          create: {
            campaignId: id, personId: person.id, email, status: "skipped",
            detail: verdict.detail ?? null, subject, body: text, byId: meId, byName: meName,
          },
        });
      }
      continue;
    }

    if (dryRun) {
      outcomes.push({ personId: person.id, email, status: "sent", subject, detail: "Would send." });
      continue;
    }

    // Claim the recipient BEFORE sending. If two requests race, one insert
    // wins and the other throws on the unique index — that loser must not send.
    try {
      await prisma.outreachSend.create({
        data: {
          campaignId: id, personId: person.id, email, status: "queued",
          subject, body: text, byId: meId, byName: meName,
        },
      });
    } catch {
      outcomes.push({ personId: person.id, email, status: "skipped", detail: "Already being sent." });
      continue;
    }

    try {
      await sendMail({ to: email, subject, text, replyTo: meEmail ?? undefined });
      await prisma.$transaction([
        prisma.outreachSend.update({
          where: { campaignId_personId: { campaignId: id, personId: person.id } },
          data: { status: "sent", sentAt: new Date() },
        }),
        // The touch log is what staff read day to day; keep it in step.
        prisma.outreachTouch.create({
          data: {
            personId: person.id,
            listId: campaign.listId,
            kind: "email",
            note: `Campaign “${campaign.name}” — ${subject}`,
            byId: meId,
            byName: meName,
          },
        }),
        // First contact stamps introSentAt so the next campaign greets them
        // as someone who already knows us. Only ever on a real send.
        ...(person.introSentAt
          ? []
          : [prisma.outreachPerson.update({ where: { id: person.id }, data: { introSentAt: new Date() } })]),
      ]);
      outcomes.push({ personId: person.id, email, status: "sent", subject });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Send failed.";
      await prisma.outreachSend.update({
        where: { campaignId_personId: { campaignId: id, personId: person.id } },
        data: { status: "failed", detail },
      });
      outcomes.push({ personId: person.id, email, status: "failed", detail });
    }

    await new Promise((r) => setTimeout(r, SEND_THROTTLE_MS));
  }

  const sent = outcomes.filter((o) => o.status === "sent").length;
  if (!dryRun && sent > 0) {
    const reached = new Set<string>([
      ...(Array.isArray(campaign.sentPersonIds) ? (campaign.sentPersonIds as string[]) : []),
      ...outcomes.filter((o) => o.status === "sent").map((o) => o.personId),
    ]);
    await prisma.outreachCampaign.update({
      where: { id },
      data: { sentPersonIds: [...reached], status: campaign.status === "draft" ? "active" : campaign.status },
    });
  }

  return NextResponse.json({
    ok: true,
    dryRun: Boolean(dryRun),
    sent,
    failed: outcomes.filter((o) => o.status === "failed").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
    outcomes,
  });
}
