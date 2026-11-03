import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { LinkedinAction } from "@/lib/events/linkedin";
import { loadLinkedinBoard, saveLinkedinBoard } from "@/lib/events/linkedin-store";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  if (!await requireRole("admin").catch(() => null)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  try { return NextResponse.json(await loadLinkedinBoard(), { headers }); }
  catch { return NextResponse.json({ error: "Could not load LinkedIn interactions." }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers });
  if (Number(request.headers.get("content-length") || 0) > 1_000_000) return NextResponse.json({ error: "Request too large" }, { status: 413, headers });
  const text = await request.text();
  if (text.length > 1_000_000) return NextResponse.json({ error: "Request too large" }, { status: 413, headers });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "Invalid input" }, { status: 400, headers }); }
  const input = z.object({ version: z.string().datetime().nullable(), change: LinkedinAction }).strict().safeParse(body);
  if (!input.success) return NextResponse.json({ error: "Check the LinkedIn link and required fields." }, { status: 400, headers });
  const actor = session.user?.name || session.user?.email || "Admin";
  try {
    const result = await saveLinkedinBoard(input.data.version, input.data.change, actor);
    return NextResponse.json(result, { status: result.conflict ? 409 : 200, headers });
  } catch (error) {
    const validation = error instanceof z.ZodError || (error instanceof Error && /already in the queue|no longer exists/.test(error.message));
    return NextResponse.json({ error: validation ? "This interaction already exists or changed. Reload the queue." : "Could not save. Your draft has not been discarded." }, { status: validation ? 400 : 503, headers });
  }
}
