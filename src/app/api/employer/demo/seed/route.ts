/**
 * Self-service demo seeder for HR / employer accounts.
 *
 *   POST   /api/employer/demo/seed   → create postings + funnel
 *   DELETE /api/employer/demo/seed   → clear (isDemoSeed-gated)
 *
 * Thin session-gated wrappers; the whole engine lives in
 * src/lib/employer/demo-seed.ts so the demo deployment's nightly
 * reset can drive it without a session.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { clearEmployerWorld, seedEmployerWorld } from "@/lib/employer/demo-seed";

export const runtime = "nodejs";

async function authed() {
  const session = await getSession();
  const role = (session?.user as { role?: string })?.role ?? "";
  const userId = (session?.user as { id?: string })?.id;
  if (!session || !userId || (role !== "employer" && !["admin", "superadmin"].includes(role))) {
    return null;
  }
  const realRole = (session.user as { realRole?: string }).realRole ?? role;
  return { userId, realRole };
}

export async function POST() {
  const auth = await authed();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await seedEmployerWorld(auth.userId, auth.realRole);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result);
}

export async function DELETE() {
  const auth = await authed();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await clearEmployerWorld(auth.userId, auth.realRole));
}
