import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SYMPOSIUM_DAY_PREFIX, SYMPOSIUM_DAY_SOURCE, SYMPOSIUM_DAY_NOTE } from "@/lib/social/symposium-day";
import { loadSymposiumDayOrder, saveSymposiumDayOrder, SymposiumDayOrderSchema } from "@/lib/social/symposium-day-store";
import { withSocialTags } from "@/lib/social/tags";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const Input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(6000), requestId: z.string().uuid() }),
  z.object({ action: z.literal("order"), order: SymposiumDayOrderSchema, version: z.string().datetime().nullable() }),
]);

export async function GET() {
  if (!await requireRole("admin").catch(() => null)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  try { return NextResponse.json(await loadSymposiumDayOrder(), { headers }); }
  catch { return NextResponse.json({ error: "Couldn't load the shared post order." }, { status: 503, headers }); }
}

export async function POST(request: Request) {
  const session = await requireRole("admin").catch(() => null);
  if (!(session?.user as { id?: string } | undefined)?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers });
  const text = await request.text();
  if (text.length > 35000) return NextResponse.json({ error: "Request too large" }, { status: 413, headers });
  let input: unknown;
  try { input = JSON.parse(text); } catch { return NextResponse.json({ error: "Invalid input" }, { status: 400, headers }); }
  const parsed = Input.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "Check the title, post text and order." }, { status: 400, headers });
  try {
    const data = parsed.data;
    if (data.action === "order") {
      const result = await saveSymposiumDayOrder(data.order, data.version);
      return NextResponse.json(result, { status: result.conflict ? 409 : 200, headers });
    }
    const body = withSocialTags(data.body);
    if (body.length > 6000) return NextResponse.json({ error: "Use at most 6,000 characters including the standing tags." }, { status: 400, headers });
    const post = await prisma.socialPost.upsert({
      where: { key: SYMPOSIUM_DAY_PREFIX + data.requestId }, update: {},
      create: { key: SYMPOSIUM_DAY_PREFIX + data.requestId, stream: "events", kind: "event", deadlineId: data.requestId,
        body, scheduledFor: new Date("2026-10-29T17:00:00-04:00"), assetSpec: { title: data.title, campaign: "2026-symposium-day", sourceUrl: SYMPOSIUM_DAY_SOURCE } },
    });
    return NextResponse.json({ post: { ...post, scheduledFor: post.scheduledFor.toISOString(), cycleLabel: (post.assetSpec as { title: string }).title,
      symposiumDay: true, campaignSlug: post.id, organization: null, companyLogoUrl: null, overdue: false, stale: false, publicationNote: SYMPOSIUM_DAY_NOTE }, layout: await loadSymposiumDayOrder() }, { headers });
  } catch { return NextResponse.json({ error: "Couldn't save. Please retry." }, { status: 503, headers }); }
}
