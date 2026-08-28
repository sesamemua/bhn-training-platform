/**
 * Single Equip application — applicant-side.
 *
 *   GET   /api/equip/applications/[id]   → full application (mine)
 *   PATCH /api/equip/applications/[id]   → save draft / mark AI-assisted
 *
 * PATCH is the workhorse of the auto-save loop. The client posts
 * every 800ms with the current form blob; we shallow-merge so a
 * partial update is fine. Status transitions are intentionally NOT
 * allowed here — submission goes through the explicit `/submit`
 * endpoint so we can enforce eligibility + budget checks once,
 * authoritatively.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { isEditable, type EquipStatus } from "@/lib/equip/types";
import { canDelete } from "@/lib/equip/delete";
import { purgeApplication } from "@/lib/equip/purge";

export const runtime = "nodejs";

async function loadOwned(id: string, userId: string) {
  const app = await prisma.equipApplication.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      reviewer: { select: { id: true, name: true } },
    },
  });
  if (!app || app.userId !== userId) return null;
  return app;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const userId = (session?.user as { id?: string })?.id;
  if (!session || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const app = await loadOwned(id, userId);
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ application: app });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const userId = (session?.user as { id?: string })?.id;
  if (!session || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const app = await loadOwned(id, userId);
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isEditable(app.status as EquipStatus)) {
    // Once submitted, even the applicant can't edit (they can only
    // post messages on the thread).
    return NextResponse.json({ error: "Locked — application has been submitted" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const formData = body.formData as Record<string, unknown> | undefined;
  const requestedAmount = typeof body.requestedAmount === "number" ? body.requestedAmount : undefined;
  const aiAssisted = body.aiAssisted === true ? true : undefined;

  // Build a partial update that only sets the fields the client
  // actually sent. PATCH semantics — clients can save a single
  // field without re-sending the whole blob.
  const data: Record<string, unknown> = {};
  if (formData !== undefined) {
    // Shallow-merge over the existing formData so the client can
    // POST one field at a time without clobbering the rest.
    data.formData = {
      ...(app.formData as Prisma.JsonObject ?? {}),
      ...formData,
    } as Prisma.InputJsonValue;
  }
  if (requestedAmount !== undefined) data.requestedAmount = requestedAmount;
  if (aiAssisted) data.aiAssisted = true;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, noop: true, application: app });
  }

  const updated = await prisma.equipApplication.update({
    where: { id },
    data,
    select: {
      id: true, formData: true, requestedAmount: true,
      aiAssisted: true, updatedAt: true,
    },
  });
  return NextResponse.json({ ok: true, application: updated });
}

/**
 * An applicant deleting their own application.
 *
 * Drafts only. Once it has been submitted it is in somebody's queue,
 * and vanishing from a queue without a word is not a withdrawal — see
 * canDelete for the wording they get instead.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const userId = (session?.user as { id?: string })?.id;
  if (!session || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const app = await loadOwned(id, userId);
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const verdict = canDelete(app, "owner", false);
  if (!verdict.allowed) {
    return NextResponse.json({ error: verdict.reason }, { status: 409 });
  }

  const { files } = await purgeApplication(id);
  return NextResponse.json({ ok: true, files });
}
