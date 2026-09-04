/**
 * POST /api/admin/equip/applications/[id]/send-email
 *
 * The only way an applicant ever receives a decision/status email. No
 * status change triggers a send on its own (see PATCH .../[id]) — a
 * reviewer opens the application, sees the exact subject + body that
 * would go out, and this route fires when they choose to send it.
 *
 * Body: { templateId?: string, dryRun?: boolean }. templateId defaults
 * to whatever STATUS_TO_TEMPLATE suggests for the application's
 * current status; a reviewer can override it — to a different
 * built-in (e.g. re-send the submission receipt) or to any custom
 * template (see .../email-templates/custom) — as long as it applies to
 * this application's stream. dryRun renders with the applicant's real
 * data but sends nothing — the send panel calls it once to show what
 * would go out, then calls again without dryRun to actually send.
 */
import { NextResponse } from "next/server";
import { requireCommitteeOrAdmin } from "@/lib/committees/membership";
import { prisma } from "@/lib/prisma";
import { sendMail, mailConfigured } from "@/lib/mail";
import { applicantOf } from "@/lib/equip/applicant";
import {
  EQUIP_EMAIL_TEMPLATES,
  STATUS_TO_TEMPLATE,
  isEquipTemplateId,
  isCustomTemplateId,
  listCustomEquipTemplates,
  getEquipTemplateOverrides,
  resolveTemplateFields,
  renderEquipEmail,
  renderCustomEquipEmail,
  type Built,
} from "@/lib/equip/emails";
import type { EquipStatus, EquipStream, ApplicationStage } from "@/lib/equip/types";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCommitteeOrAdmin(["equip_review"], ["equip_grant_reviewer"]).catch(() => null);
  const reviewerId = (session?.user as { id?: string })?.id;
  if (!reviewerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const requested = body.templateId;
  const dryRun = body.dryRun === true;

  const app = await prisma.equipApplication.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stream = app.stream as EquipStream;
  const templateId: string | undefined =
    isEquipTemplateId(requested) || isCustomTemplateId(requested)
      ? requested
      : STATUS_TO_TEMPLATE[app.status as EquipStatus];

  if (!templateId) {
    return NextResponse.json(
      { error: "No email applies to this application's current status. Pick a template explicitly." },
      { status: 400 },
    );
  }

  const emailCtx = {
    applicantName: applicantOf(app).name,
    stream,
    stage: app.applicationStage as ApplicationStage,
    requestedAmount: app.requestedAmount,
    approvedAmount: app.approvedAmount,
    reviewerNote: app.reviewerNote,
    disbursementNote: app.disbursementNote,
  };

  let built: Built;
  if (isEquipTemplateId(templateId)) {
    const info = EQUIP_EMAIL_TEMPLATES.find((t) => t.id === templateId);
    if (!info || (info.appliesTo !== "both" && info.appliesTo !== stream)) {
      return NextResponse.json({ error: "That template doesn't apply to this application." }, { status: 400 });
    }
    const overrides = await getEquipTemplateOverrides();
    const { fields } = resolveTemplateFields(templateId, stream, overrides);
    built = renderEquipEmail(templateId, emailCtx, fields);
  } else if (isCustomTemplateId(templateId)) {
    const tpl = (await listCustomEquipTemplates()).find((t) => t.id === templateId);
    if (!tpl || (tpl.appliesTo !== "both" && tpl.appliesTo !== stream)) {
      return NextResponse.json({ error: "That template doesn't apply to this application." }, { status: 400 });
    }
    built = renderCustomEquipEmail(emailCtx, tpl);
  } else {
    return NextResponse.json({ error: "Unknown template." }, { status: 400 });
  }

  const notify = applicantOf(app);
  if (!notify.email) {
    return NextResponse.json({ error: "This applicant has no email on file." }, { status: 400 });
  }

  if (dryRun) {
    return NextResponse.json({ ok: true, templateId, subject: built.subject, html: built.html, to: notify.email });
  }

  if (!mailConfigured()) {
    return NextResponse.json({ error: "Email isn't configured on this deployment." }, { status: 400 });
  }

  try {
    await sendMail({ to: notify.email, subject: built.subject, text: built.text, html: built.html });
  } catch (err) {
    console.error("[equip] manual send-email failed", { id, templateId, err });
    return NextResponse.json({ error: "The send failed. Nothing was recorded — try again." }, { status: 502 });
  }

  const now = new Date();
  await prisma.equipApplication.update({
    where: { id },
    data: { lastEmailSentAt: now, lastEmailTemplateId: templateId },
  });

  return NextResponse.json({
    ok: true,
    templateId,
    subject: built.subject,
    sentAt: now.toISOString(),
    to: notify.email,
  });
}
