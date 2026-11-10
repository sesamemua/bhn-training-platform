/**
 * The asset agent. "Find consented photos from the panel and draft a
 * LinkedIn post" → it searches the library by meaning, keeps only
 * pictures that are cleared to publish, drafts the post, and runs the
 * pre-publish checks. Creating the Social draft is a second, explicit step.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { chat } from "@/lib/ai";
import { postChecks, publishBlock } from "@/lib/assets/core";
import { assetActor, assetUrl, semanticSearch, setUsage, toCard } from "@/lib/assets/store";

export const runtime = "nodejs";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ask"), prompt: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal("check"), body: z.string().max(6000), assetId: z.string().nullable() }),
  z.object({ action: z.literal("create"), assetId: z.string().min(1), title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(3000) }),
]);

export async function POST(req: NextRequest) {
  const gate = await assetActor(req, true);
  if ("error" in gate) return gate.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Say what you're looking for." }, { status: 400 });
  const d = parsed.data;

  if (d.action === "check") {
    const a = d.assetId ? await prisma.asset.findUnique({ where: { id: d.assetId } }) : null;
    return NextResponse.json({ checks: postChecks(d.body, a) });
  }

  if (d.action === "create") {
    const a = await prisma.asset.findFirst({ where: { id: d.assetId, deletedAt: null, kind: "image" } });
    if (!a) return NextResponse.json({ error: "That picture is gone." }, { status: 404 });
    const block = publishBlock(a);
    if (block) return NextResponse.json({ error: block }, { status: 409 });
    const requestId = crypto.randomUUID();
    const post = await prisma.socialPost.create({ data: {
      key: `linkedin:post:${requestId}:0`, stream: "linkedin", kind: "post", deadlineId: requestId, body: d.body,
      scheduledFor: new Date(Date.now() + 86_400_000), assetUrl: assetUrl(a.key), assetSpec: { title: d.title, from: "asset-agent" },
    } });
    await setUsage(a.id, { targetType: "socialPost", targetId: post.id, label: `Social post · ${d.title}`, href: `/admin/workspace/marketing/social?post=${post.id}` });
    return NextResponse.json({ href: `/admin/workspace/marketing/social?post=${post.id}` });
  }

  // ask: words first (names, tags), then meaning; only pictures cleared to publish.
  const q = d.prompt;
  const keyword = await prisma.asset.findMany({ where: { deletedAt: null, kind: "image", OR: q.split(/\s+/).filter((w) => w.length > 3).slice(0, 8).flatMap((w) => [
    { title: { contains: w, mode: "insensitive" as const } }, { caption: { contains: w, mode: "insensitive" as const } }, { tags: { has: w.toLowerCase() } }, { people: { contains: w, mode: "insensitive" as const } },
  ]) }, select: { id: true }, take: 40 });
  const ids = [...new Set([...(await semanticSearch(q, 40)), ...keyword.map((k) => k.id)])];
  const rows = await prisma.asset.findMany({ where: { id: { in: ids }, deletedAt: null, kind: "image" }, include: { _count: { select: { usages: true } } } });
  const rank = new Map(ids.map((id, i) => [id, i]));
  const sorted = rows.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  const cleared = sorted.filter((r) => !publishBlock(r)).slice(0, 6);
  const held = sorted.filter((r) => publishBlock(r)).length;
  if (!cleared.length) return NextResponse.json({ assets: [], held, draft: "", checks: [], note: held ? `Found ${held} matching pictures, but none are cleared to publish yet. Record consent first.` : "No matching pictures yet." });

  const r = await chat([
    { role: "system", content: "You write LinkedIn posts for BioHubNet, a Canadian life-sciences training network. Warm, specific, professional; 80-160 words; one short call to action; at most 4 hashtags at the end; no emojis in the first line; never invent names, numbers or quotes beyond what you're given. Return only the post text." },
    { role: "user", content: `Request: ${q}\n\nPictures available:\n${cleared.slice(0, 3).map((c, i) => `${i + 1}. ${c.title}: ${c.caption ?? "no caption"}${c.people ? ` (pictured: ${c.people})` : ""}`).join("\n")}${cleared[0].origin.startsWith("ai") ? "\nThe first picture is AI-generated or AI-edited; say so briefly." : ""}` },
  ], { feature: "asset_agent", maxTokens: 400, temperature: 0.6 }).catch(() => null);
  const draft = ((r as { text?: string } | null)?.text ?? "").trim();
  return NextResponse.json({ assets: cleared.map(toCard), held, draft, checks: postChecks(draft, cleared[0]) });
}
