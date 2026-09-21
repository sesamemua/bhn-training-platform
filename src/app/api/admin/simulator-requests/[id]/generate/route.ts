/**
 * POST /api/admin/simulator-requests/[id]/generate
 *
 * Admin triggers AI generation on a SimulationRequest. Flips the
 * request to status=generating, calls generateSimulation() with the
 * stored JD body, and either flips to ready (on success) or failed
 * (on AI error). Status transitions are atomic — a stale row from a
 * previous failed attempt won't block a retry, because the request
 * doesn't hold a Simulation FK until success.
 */
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateSimulation } from "@/lib/simulator/generator";
import { fulfillWithNewPayload } from "@/lib/simulator/request-fulfillment";
import { notifySimFailed } from "@/lib/simulator/notify";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const adminId = (session.user as { id?: string }).id;
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const request = await prisma.simulationRequest.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      jdBody: true,
      sourceHash: true,
      user: { select: { email: true, name: true } },
    },
  });
  if (!request) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }
  if (request.status === "ready") {
    return NextResponse.json(
      { error: "Request is already fulfilled — reopen it first if you want to regenerate." },
      { status: 409 },
    );
  }
  if (request.status === "generating") {
    return NextResponse.json(
      { error: "AI is already running on this request." },
      { status: 409 },
    );
  }

  // Optimistic-lock to "generating" so a parallel admin click can't
  // double-fire the AI call.
  await prisma.simulationRequest.update({
    where: { id },
    data: {
      status: "generating",
      adminNotes: null,
      processedById: adminId,
    },
  });

  const gen = await generateSimulation(request.jdBody, adminId);

  if (!gen.ok) {
    await prisma.simulationRequest.update({
      where: { id },
      data: {
        status: "failed",
        adminNotes: gen.error.slice(0, 1000),
        processedAt: new Date(),
      },
    });
    // Tell the requester so they're not left wondering. Failure is
    // usually an AI quota issue — retry-able by an admin and worth
    // surfacing so the user understands the delay.
    if (request.user.email) {
      await notifySimFailed({
        to: request.user.email,
        recipientName: request.user.name,
        jdSnippet: request.jdBody,
        reason: gen.error,
      });
    }
    return NextResponse.json(
      { ok: false, status: "failed", error: gen.error },
      { status: 502 },
    );
  }

  const result = await fulfillWithNewPayload({
    requestId: id,
    payload: gen.payload,
    modelUsed: gen.modelUsed,
    generationMs: gen.generationMs,
    adminId,
  });

  if (!result.ok) {
    await prisma.simulationRequest.update({
      where: { id },
      data: { status: "failed", adminNotes: result.error.slice(0, 1000) },
    });
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    status: "ready",
    simulationId: result.simulationId,
    attemptId: result.attemptId,
  });
}
