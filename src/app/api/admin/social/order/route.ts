import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { SocialOrderSchema } from "@/lib/social/order";
import { loadSocialOrder, saveSocialOrder } from "@/lib/social/order-store";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET() {
  if (!await requireRole("admin").catch(() => null)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  try { return NextResponse.json(await loadSocialOrder(), { headers }); }
  catch { return NextResponse.json({ error: "Couldn't load the shared post order." }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  if (!await requireRole("admin").catch(() => null)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers });
  const text = await request.text();
  if (text.length > 4000) return NextResponse.json({ error: "Request too large" }, { status: 413, headers });
  let input: unknown;
  try { input = JSON.parse(text); } catch { return NextResponse.json({ error: "Invalid input" }, { status: 400, headers }); }
  const parsed = z.object({ order: SocialOrderSchema, version: z.string().datetime().nullable() }).strict().safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "Include every campaign post exactly once." }, { status: 400, headers });
  try {
    const result = await saveSocialOrder(parsed.data.order, parsed.data.version);
    return NextResponse.json(result, { status: result.conflict ? 409 : 200, headers });
  } catch { return NextResponse.json({ error: "Couldn't save the post order. Nothing was changed." }, { status: 503, headers }); }
}
