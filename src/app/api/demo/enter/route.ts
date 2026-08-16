/**
 * Demo entry — turn a persona choice into a signed-in session.
 *
 *   POST /api/demo/enter   { persona: "trainee" | "admin" | "employer", next?: string }
 *   GET  /api/demo/enter?persona=admin&next=/admin/workspace/merch
 *
 * Only exists on the demo deployment: on production (no
 * NEXT_PUBLIC_DEMO_MODE) both verbs return 404 before touching anything.
 * The GET form is what the backstage feature index uses so a single click
 * can pick a persona AND land on the feature it demonstrates.
 *
 * Ensures the persona (idempotent upsert on a fixed demo email), then
 * redirects through the existing /sandbox/[token] magic-token route — the
 * only session-minting path, which refuses accountKind="real". This route
 * adds no second way to create a session; it only mints tokens for the
 * three demo personas.
 */
import { NextRequest, NextResponse } from "next/server";
import { demoMode, safeLocalPath } from "@/lib/demo/mode";
import { ensurePersona, isPersonaKey } from "@/lib/demo/personas";

export const dynamic = "force-dynamic";

async function enter(req: NextRequest, persona: string, next: string | null) {
  if (!demoMode()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isPersonaKey(persona)) {
    return NextResponse.json({ error: "Unknown persona." }, { status: 400 });
  }
  const { magicToken } = await ensurePersona(persona);
  const url = new URL(`/sandbox/${magicToken}`, req.nextUrl.origin);
  const n = safeLocalPath(next);
  if (n) url.searchParams.set("next", n);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("persona") ?? "";
  return enter(req, p, req.nextUrl.searchParams.get("next"));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const persona = typeof body?.persona === "string" ? body.persona : "";
  const next = typeof body?.next === "string" ? body.next : null;
  return enter(req, persona, next);
}
