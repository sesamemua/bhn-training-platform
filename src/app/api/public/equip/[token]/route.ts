/**
 * The public VentureConnect application, addressed by its own token.
 *
 *   GET    — load the draft
 *   PATCH  — save it (autosave, same as the signed-in form)
 *   POST   — submit it
 *
 * The token IS the authorisation. It is 192 bits, it belongs to one
 * application, and it is the only way in — there is no account to check
 * against, which is the point of the whole route.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateVentureConnect } from "@/lib/equip/submit-validation";
import { validateInnovationFellowship } from "@/lib/equip/innovation-fellowship-validation";
import { buildVentureConnectSubmissionReceipt } from "@/lib/equip/venture-connect-receipt";
import { buildVentureConnectApplicationPacket } from "@/lib/equip/venture-connect-packet";
import { buildInnovationFellowshipSubmissionReceipt } from "@/lib/equip/innovation-fellowship-receipt";
import { buildInnovationFellowshipApplicationPacket } from "@/lib/equip/innovation-fellowship-packet";
import { getEquipCopyRecipients } from "@/lib/equip/emails";
import { canDelete } from "@/lib/equip/delete";
import { purgeApplication } from "@/lib/equip/purge";
import { mailConfigured, sendMail } from "@/lib/mail";
import { trackServer } from "@/lib/analytics";
import {
  campaignAttributionFromFormData,
  hasCampaignAttribution,
  sanitizeCampaignAttribution,
  withCampaignAttribution,
} from "@/lib/campaign/attribution";
import { CAMPAIGN_EVENT_NAMES } from "@/lib/campaign/events";
import {
  innovationFellowshipRequestedAmount,
  isEditable,
  type EquipDocument,
  type EquipStatus,
  type InnovationFellowshipFormData,
  type VentureConnectFormData,
} from "@/lib/equip/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function load(token: string) {
  if (!token || token.length < 20) return null;
  return prisma.equipApplication.findUnique({
    where: { publicToken: token },
    select: {
      id: true, status: true, stream: true, formData: true, documents: true,
      applicantName: true, applicantEmail: true, submittedAt: true, updatedAt: true,
    },
  });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const app = await load(token);
  if (!app) return NextResponse.json({ error: "This link is no longer active." }, { status: 404 });
  return NextResponse.json({ ok: true, application: app });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const app = await load(token);
  if (!app) return NextResponse.json({ error: "This link is no longer active." }, { status: 404 });
  if (!isEditable(app.status as EquipStatus)) {
    return NextResponse.json(
      { error: "This application has been submitted and can no longer be edited." },
      { status: 409 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { formData?: unknown };
  if (!body.formData || typeof body.formData !== "object") {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  }
  // Bounded: this is a form, not a file store.
  if (JSON.stringify(body.formData).length > 200_000) {
    return NextResponse.json({ error: "That is more than the form can hold." }, { status: 413 });
  }

  const incomingFormData = body.formData as Record<string, unknown>;
  const incomingAttribution = campaignAttributionFromFormData(incomingFormData);
  const storedAttribution = campaignAttributionFromFormData(app.formData);
  const formData = withCampaignAttribution(
    incomingFormData,
    hasCampaignAttribution(incomingAttribution) ? incomingAttribution : storedAttribution,
  );
  const applicantName = typeof formData.fullName === "string"
    ? formData.fullName.trim().slice(0, 160)
    : "";
  const applicantEmail = typeof formData.institutionEmail === "string"
    ? formData.institutionEmail.trim().slice(0, 200)
    : "";
  const institution = typeof formData.institutionAffiliation === "string"
    ? formData.institutionAffiliation.trim().slice(0, 240)
    : "";
  const applicantType = typeof formData.currentRole === "string"
    ? formData.currentRole.slice(0, 80)
    : "";

  await prisma.equipApplication.update({
    where: { id: app.id },
    data: {
      formData: formData as object,
      ...(applicantName ? { applicantName } : {}),
      ...(EMAIL.test(applicantEmail) ? { applicantEmail } : {}),
      ...(institution ? { institution: "other", institutionOther: institution } : {}),
      ...(applicantType ? { applicantType } : {}),
    },
  });
  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const app = await load(token);
  if (!app) return NextResponse.json({ error: "This link is no longer active." }, { status: 404 });
  if (!isEditable(app.status as EquipStatus)) {
    return NextResponse.json({ error: "This has already been submitted." }, { status: 409 });
  }

  /*
   * The same rules the signed-in route applies, from the same function.
   * A public application that skipped a check the other one enforces
   * would be a second standard nobody agreed to.
   */
  const documents = (app.documents as unknown as EquipDocument[]) ?? [];
  const isVentureConnect = app.stream === "venture_connect";
  const isInnovationFellowship = app.stream === "innovation_fellowship";
  if (!isVentureConnect && !isInnovationFellowship) {
    return NextResponse.json({ error: "This application type cannot be submitted here." }, { status: 400 });
  }

  const errors = isVentureConnect
    ? validateVentureConnect(app.formData as VentureConnectFormData, documents)
    : validateInnovationFellowship(app.formData as InnovationFellowshipFormData);
  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  const submitBody = (await req.json().catch(() => ({}))) as {
    campaignAttribution?: unknown;
  };
  const submittedAttribution = sanitizeCampaignAttribution(submitBody.campaignAttribution);
  const storedAttribution = campaignAttributionFromFormData(app.formData);
  const attribution = hasCampaignAttribution(submittedAttribution)
    ? submittedAttribution
    : storedAttribution;

  const submittedAt = new Date();
  const fellowshipData = isInnovationFellowship
    ? app.formData as InnovationFellowshipFormData
    : null;
  await prisma.equipApplication.update({
    where: { id: app.id },
    data: {
      status: "submitted",
      submittedAt,
      ...(fellowshipData
        ? { requestedAmount: innovationFellowshipRequestedAmount(fellowshipData.opportunity) }
        : {}),
    },
  });

  if (isVentureConnect) {
    await trackServer({
      name: CAMPAIGN_EVENT_NAMES.ventureConnectApplicationSubmitted,
      path: "/apply/venture-connect/[token]",
      props: {
        program: "venture_connect",
        applicationId: app.id,
        publicApplication: true,
        attribution,
      },
    });
  }

  // Confirmation is best-effort. The application is already safely
  // submitted before email is attempted, so an SMTP issue cannot lose it.
  const formData = app.formData as VentureConnectFormData | InnovationFellowshipFormData;
  const institutionEmail = formData.institutionEmail?.trim() ?? "";
  const recipient = EMAIL.test(institutionEmail)
    ? institutionEmail
    : app.applicantEmail?.trim();
  if (recipient && mailConfigured()) {
    try {
      const email = isVentureConnect
        ? buildVentureConnectSubmissionReceipt({
            applicationId: app.id,
            submittedAt,
            formData: formData as VentureConnectFormData,
          })
        : buildInnovationFellowshipSubmissionReceipt({
            applicationId: app.id,
            submittedAt,
            formData: formData as InnovationFellowshipFormData,
          });
      const packet = isVentureConnect
        ? await buildVentureConnectApplicationPacket({
            applicationId: app.id,
            submittedAt,
            formData: formData as VentureConnectFormData,
            documents,
          })
        : await buildInnovationFellowshipApplicationPacket({
            applicationId: app.id,
            submittedAt,
            formData: formData as InnovationFellowshipFormData,
            documents,
          });
      const copyRecipients = await getEquipCopyRecipients();
      await sendMail({
        to: recipient,
        bcc: isVentureConnect ? copyRecipients.venture_connect : copyRecipients.innovation_fellowship,
        subject: email.subject,
        text: email.text,
        html: email.html,
        attachments: [{
          filename: packet.filename,
          content: packet.content,
          contentType: packet.contentType,
        }],
      });
    } catch (err) {
      console.error("[equip] public application receipt failed", { id: app.id, stream: app.stream, err });
    }
  }

  return NextResponse.json({ ok: true });
}

/**
 * A public applicant deleting their own draft.
 *
 * Same rule as an account holder's: drafts only. The token is the
 * authorisation, as it is for everything else on this route.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const app = await load(token);
  if (!app) return NextResponse.json({ error: "This link is no longer active." }, { status: 404 });

  const verdict = canDelete({ status: app.status, approvedAmount: null }, "owner", false);
  if (!verdict.allowed) {
    return NextResponse.json({ error: verdict.reason }, { status: 409 });
  }

  await purgeApplication(app.id);
  return NextResponse.json({ ok: true });
}
