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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A submitted application is no longer the applicant's to change. */
const EDITABLE = new Set(["draft"]);

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
  if (!EDITABLE.has(app.status)) {
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

  await prisma.equipApplication.update({
    where: { id: app.id },
    data: { formData: body.formData as object },
  });
  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const app = await load(token);
  if (!app) return NextResponse.json({ error: "This link is no longer active." }, { status: 404 });
  if (!EDITABLE.has(app.status)) {
    return NextResponse.json({ error: "This has already been submitted." }, { status: 409 });
  }

  /*
   * The same rules the signed-in route applies, from the same function.
   * A public application that skipped a check the other one enforces
   * would be a second standard nobody agreed to.
   */
  const errors = validateVentureConnect(app.formData as Record<string, unknown>);
  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  await prisma.equipApplication.update({
    where: { id: app.id },
    data: { status: "submitted", submittedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
