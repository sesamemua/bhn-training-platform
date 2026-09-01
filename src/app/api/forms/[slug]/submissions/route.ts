import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import type { FormField } from "@/lib/forms/types";
import {
  isSectionField, isChoiceField, isMultiCheckboxField, isFileField,
  isFieldVisible,
} from "@/lib/forms/types";
import { isR2PublicUrl } from "@/lib/r2";
import { trackServer } from "@/lib/analytics";
import { sanitizeCampaignAttribution } from "@/lib/campaign/attribution";
import { CAMPAIGN_EVENT_NAMES } from "@/lib/campaign/events";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { slug } = await params;
  const form = await prisma.eventForm.findUnique({ where: { slug } });
  if (!form) return NextResponse.json({ error: "Form not found." }, { status: 404 });
  if (!form.active) {
    return NextResponse.json({ error: "Form is not accepting submissions." }, { status: 410 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    data?: Record<string, string | string[]>;
    campaignAttribution?: unknown;
  };
  const incoming = body.data ?? {};
  const attribution = sanitizeCampaignAttribution(body.campaignAttribution);

  // Validate against schema. Strings get trimmed, choice values must be
  // in their option list, multicheckbox/file values must be string[].
  // Conditionally-hidden fields — both direct and chained (i.e. a
  // grandchild whose grandparent is hidden) — are treated as
  // not-required and their incoming values are dropped, matching
  // what the user actually saw on screen.
  const fields = form.fields as unknown as FormField[];
  const cleaned: Record<string, string | string[]> = {};
  for (const f of fields) {
    if (isSectionField(f)) continue;
    const visible = isFieldVisible(f, fields, incoming);
    const raw = incoming[f.id];

    if (!visible) {
      // Field hidden — skip both validation and storage.
      continue;
    }

    if (isMultiCheckboxField(f)) {
      const arr = Array.isArray(raw) ? raw.map((s) => String(s).trim()).filter(Boolean) : [];
      if (f.required && arr.length === 0) {
        return NextResponse.json(
          { error: `Missing required field: ${f.label}` },
          { status: 400 }
        );
      }
      const bad = arr.find((v) => !f.options.includes(v));
      if (bad) {
        return NextResponse.json(
          { error: `Invalid option "${bad}" for "${f.label}".` },
          { status: 400 }
        );
      }
      if (arr.length) cleaned[f.id] = arr;
      continue;
    }

    if (isFileField(f)) {
      const v = typeof raw === "string" ? raw.trim() : "";
      if (f.required && !v) {
        return NextResponse.json(
          { error: `Missing required file: ${f.label}` },
          { status: 400 }
        );
      }
      // Accept only our own R2 URLs to prevent storing arbitrary external
      // links — clients that didn't go through /upload can't sneak in.
      // (isR2PublicUrl recognises legacy hosts too, so it survives a bucket move.)
      if (v && !isR2PublicUrl(v)) {
        return NextResponse.json(
          { error: `Invalid upload reference for "${f.label}".` },
          { status: 400 }
        );
      }
      if (v) cleaned[f.id] = v;
      continue;
    }

    const v = typeof raw === "string" ? raw.trim() : "";
    if (f.required && !v) {
      return NextResponse.json(
        { error: `Missing required field: ${f.label}` },
        { status: 400 }
      );
    }
    if (v && isChoiceField(f) && !f.options.includes(v)) {
      return NextResponse.json(
        { error: `Invalid option for "${f.label}".` },
        { status: 400 }
      );
    }
    if (v) cleaned[f.id] = v;
  }

  const userId = (session.user as { id?: string }).id ?? null;
  const userEmail = (session.user as { email?: string }).email ?? null;

  const sub = await prisma.eventFormSubmission.create({
    data: {
      formId: form.id,
      data: cleaned,
      userId,
      email: userEmail,
    },
  });

  if (form.slug === "talent-application") {
    await trackServer({
      userId,
      role: (session.user as { role?: string }).role ?? "trainee",
      name: CAMPAIGN_EVENT_NAMES.experienceApplicationSubmitted,
      path: "/forms/talent-application",
      props: {
        program: "experience",
        submissionId: sub.id,
        attribution,
      },
    });
  }

  // For the talent-application form, extract skills from the long-form
  // pitch + status into the trainee's UserSkill profile (Phase 3).
  if (userId && form.slug === "talent-application") {
    const pitch = String(cleaned.pitch ?? "");
    const status = String(cleaned.status_goal ?? "");
    const text = [pitch, status].filter(Boolean).join("\n\n");
    if (text.length > 40) {
      import("@/lib/skills/ontology")
        .then(({ tagUser }) => tagUser(userId, text, "ai", { submissionId: sub.id, source: "talent_application" }))
        .catch(() => undefined);
    }
  }

  return NextResponse.json({ ok: true });
}
