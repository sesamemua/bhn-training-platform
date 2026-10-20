import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteR2ObjectByUrl, putR2Object, r2PublicUrl } from "@/lib/r2";
import { matchPlanPeople } from "@/lib/events/people-plan";
import { loadPeoplePlan, PEOPLE_PLAN_KEY } from "@/lib/events/people-plan-store";
import { PUBLICATION_EVENT, PublicationStateSchema } from "@/lib/events/people-publication";
import { loadPublication, PUBLICATION_KEY, PublicationConflict } from "@/lib/events/people-publication-store";
import { publicationPhotoSource, publicationImageType } from "@/lib/events/publication-photo";

export const runtime = "nodejs";
const Framing = z.object({ zoom: z.number().min(0.5).max(4), x: z.number().min(-10000).max(10000), y: z.number().min(-10000).max(10000) }).strict();
const SavedCrop = z.object({ originalUrl: z.string().url(), currentUrl: z.string().url(), framing: Framing });
const Id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const Target = z.union([z.object({ personId: Id }).strict(), z.object({ speakerId: Id }).strict()]);
type Context = { params: Promise<{ slug: string }> };

async function resolveHeadshot(req: NextRequest, ctx: Context) {
  const target = Target.parse(Object.fromEntries(req.nextUrl.searchParams));
  const { slug } = await ctx.params;
  const board = slug === PUBLICATION_EVENT ? await loadPeoplePlan() : null;
  const matches = board ? matchPlanPeople(board.snapshot.people, board.snapshot.speakers) : new Map();
  const person = "personId" in target ? board?.snapshot.people.find((p) => p.id === target.personId && !p.archived) : null;
  if ("personId" in target && !person) return null;
  const speakerId = "speakerId" in target ? target.speakerId : matches.get(person!.id)?.speaker?.id;
  const speaker = speakerId ? await prisma.speaker.findFirst({
    where: { id: speakerId, ...("speakerId" in target ? { event: { slug } } : {}) },
    select: { id: true, photoUrl: true, submittedAt: true },
  }) : null;
  if (speakerId && !speaker) return null;
  const photoUrl = speaker?.photoUrl || person?.photoUrl;
  if (!photoUrl) return null;
  const key = `headshot.crop.${speaker ? `speaker.${speaker.id}` : `person.${person!.id}`}`;
  const saved = await prisma.platformSetting.findUnique({ where: { key } });
  const previous = saved ? SavedCrop.parse(JSON.parse(saved.value)) : null;
  // A newer submission starts a new original, never a crop of yesterday's crop.
  const crop = previous?.currentUrl === photoUrl ? previous : null;
  const personIds = person ? [person.id] : board?.snapshot.people.filter((p) => !p.archived && matches.get(p.id)?.speaker?.id === speaker?.id).map((p) => p.id) ?? [];
  return { board, person, personIds, speaker, photoUrl, key, saved, crop, originalUrl: crop?.originalUrl ?? photoUrl };
}

export async function GET(req: NextRequest, ctx: Context) {
  if (!await requireRole("admin").catch(() => null)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const source = await resolveHeadshot(req, ctx);
    if (!source) return NextResponse.json({ error: "Headshot not found." }, { status: 404 });
    const url = publicationPhotoSource(source.originalUrl);
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15000), cache: "no-store" });
    if (!response.ok || !response.body) throw new Error("Headshot unavailable");
    const chunks: Uint8Array[] = [];
    let length = 0;
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 5 * 1024 * 1024) throw new Error("Image too large");
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const bytes = Buffer.concat(chunks);
    const type = publicationImageType(bytes);
    return new Response(bytes, { headers: {
      "Content-Type": type.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "X-Headshot-Version": encodeURIComponent(source.photoUrl),
      "X-Headshot-Framing": JSON.stringify(source.crop?.framing ?? null),
    } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid headshot request." }, { status: 400 });
    console.error("Headshot read failed", error);
    return NextResponse.json({ error: "Couldn't load the original headshot. Please retry." }, { status: 503 });
  }
}

export async function POST(req: NextRequest, ctx: Context) {
  const session = await requireRole("admin").catch(() => null);
  const actorId = (session?.user as { id?: string } | undefined)?.id;
  if (!actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (Number(req.headers.get("content-length") ?? 0) > 3_100_000) return NextResponse.json({ error: "Headshot must be under 3 MB." }, { status: 413 });
  let uploaded: string | null = null;
  try {
    const source = await resolveHeadshot(req, ctx);
    if (!source) return NextResponse.json({ error: "Headshot not found." }, { status: 404 });
    const form = await req.formData();
    const file = form.get("headshot");
    const framing = Framing.parse(JSON.parse(String(form.get("framing"))));
    if (form.get("version") !== source.photoUrl) throw new PublicationConflict("This headshot changed. Reopen the editor before saving.");
    if (!(file instanceof File) || file.type !== "image/png" || !file.size || file.size > 3_000_000) {
      return NextResponse.json({ error: "Choose a PNG headshot under 3 MB." }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(bytes, { limitInputPixels: 4_000_000 }).metadata().catch(() => null);
    if (metadata?.format !== "png" || metadata.width !== 600 || metadata.height !== 600) {
      return NextResponse.json({ error: "The headshot must be a 600-pixel square PNG." }, { status: 400 });
    }
    const publication = source.board ? await loadPublication() : null;
    const key = `people-publication/headshots/${randomUUID()}.png`;
    const url = r2PublicUrl(key);
    await putR2Object(key, bytes, "image/png");
    uploaded = url;
    const now = new Date(Math.max(Date.now(), Date.parse(publication?.version ?? "") + 1 || 0, Date.parse(source.board?.snapshot.version ?? "") + 1 || 0));
    await prisma.$transaction(async (tx) => {
      const conflict = () => { throw new PublicationConflict("A colleague changed this profile. Reopen the editor before saving."); };
      const data = { value: JSON.stringify({ originalUrl: source.originalUrl, currentUrl: url, framing }), updatedAt: now };
      if (source.saved) {
        if (!(await tx.platformSetting.updateMany({ where: { key: source.key, value: source.saved.value, updatedAt: source.saved.updatedAt }, data })).count) conflict();
      } else await tx.platformSetting.create({ data: { key: source.key, ...data } });
      if (source.speaker) {
        if (!(await tx.speaker.updateMany({ where: { id: source.speaker.id, photoUrl: source.photoUrl }, data: { photoUrl: url } })).count) conflict();
      } else {
        const board = source.board!;
        const people = board.snapshot.people.map((p) => p.id === source.person!.id ? { ...p, photoUrl: url } : p);
        const data = { value: JSON.stringify({ people }), updatedAt: now };
        if (board.raw === null) await tx.platformSetting.create({ data: { key: PEOPLE_PLAN_KEY, ...data } });
        else if (!(await tx.platformSetting.updateMany({ where: { key: PEOPLE_PLAN_KEY, value: board.raw, updatedAt: new Date(board.snapshot.version!) }, data })).count) conflict();
      }
      let websiteUpdated = false;
      if (publication?.state.approved.some((p) => source.personIds.includes(p.id))) {
        const next = structuredClone(publication.state);
        next.revision++; next.updatedAt = now.toISOString();
        for (const entry of next.approved.filter((p) => source.personIds.includes(p.id))) {
          entry.profile.photoUrl = url; entry.approvedRevision = next.revision;
          if (source.speaker?.submittedAt) entry.sourceSubmissionId = source.speaker.id;
        }
        for (const draft of next.drafts.filter((p) => source.personIds.includes(p.id))) draft.profile.photoUrl = url;
        const value = JSON.stringify(PublicationStateSchema.parse(next));
        if (!(await tx.platformSetting.updateMany({ where: { key: PUBLICATION_KEY, value: publication.raw!, updatedAt: new Date(publication.version!) }, data: { value, updatedAt: now } })).count) conflict();
        websiteUpdated = true;
      }
      await tx.auditLog.create({ data: {
        actorId, action: "speaker.headshot.adjust", targetType: source.speaker ? "speaker" : "person", targetId: source.speaker?.id ?? source.person!.id,
        detail: JSON.stringify({ before: source.photoUrl, after: url, original: source.originalUrl, framing, websiteUpdated }),
      } });
    });
    return NextResponse.json({ photoUrl: url });
  } catch (error) {
    // Only this unsuccessful upload is disposable. Source photos and prior crops are retained.
    if (uploaded) await deleteR2ObjectByUrl(uploaded).catch(() => {});
    if (error instanceof PublicationConflict || (error as { code?: string }).code === "P2002") return NextResponse.json({ error: "This profile changed. Reopen the editor before saving." }, { status: 409 });
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid headshot adjustment." }, { status: 400 });
    console.error("Headshot adjustment failed", error);
    return NextResponse.json({ error: "Couldn't save the headshot. Nothing was changed. Please retry." }, { status: 500 });
  }
}
