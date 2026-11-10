/**
 * Workspace → Assets: list/search (GET) and upload (POST, multipart, many files).
 */
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ASSET_FOLDERS, AssetQuery, MAX_ASSET_BYTES, nearestSwatch } from "@/lib/assets/core";
import { assetActor, ingestAsset, semanticSearch, toCard } from "@/lib/assets/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const gate = await assetActor(req, false);
  if ("error" in gate) return gate.error;
  const parsed = AssetQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid filters." }, { status: 400 });
  const f = parsed.data;
  const now = new Date();
  const where: Prisma.AssetWhereInput = {
    deletedAt: f.view === "trash" ? { not: null } : null,
    key: { not: "" }, // failed-import markers
    ...(f.view === "unused" ? { usages: { none: {} } } : {}),
    ...(f.view === "brand" ? { OR: [{ locked: true }, { folder: "Brand" }] } : {}),
    ...(f.view === "expiring" ? { expiresAt: { lte: new Date(now.getTime() + 30 * 86_400_000) } } : {}),
    ...(f.folder ? { folder: f.folder } : {}),
    ...(f.tag ? { tags: { has: f.tag } } : {}),
    ...(f.consent ? { consent: f.consent } : {}),
  };
  if (f.collection) {
    const c = await prisma.assetCollection.findUnique({ where: { id: f.collection }, select: { assetIds: true } });
    where.id = { in: c?.assetIds ?? [] };
  }
  let ids: string[] | null = null;
  if (f.q) {
    const q = f.q;
    const keyword = await prisma.asset.findMany({
      where: { ...where, OR: [
        { title: { contains: q, mode: "insensitive" } }, { fileName: { contains: q, mode: "insensitive" } },
        { caption: { contains: q, mode: "insensitive" } }, { people: { contains: q, mode: "insensitive" } },
        { credit: { contains: q, mode: "insensitive" } }, { tags: { has: q.toLowerCase() } },
      ] }, select: { id: true }, take: 300,
    });
    const meaning = await semanticSearch(q);
    ids = [...new Set([...keyword.map((r) => r.id), ...meaning])];
    where.id = { in: ids, ...(where.id as object | undefined) };
  }
  const rows = await prisma.asset.findMany({ where, include: { _count: { select: { usages: true } } }, orderBy: { createdAt: "desc" }, take: 400 });
  // ponytail: colour filter runs in JS over ≤400 rows; add a stored swatch column if the library outgrows that.
  let list = f.color ? rows.filter((r) => r.color && nearestSwatch(r.color) === f.color) : rows;
  if (ids) { const rank = new Map(ids.map((id, i) => [id, i])); list = [...list].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)); }
  const [tagRows, counts] = await Promise.all([
    prisma.$queryRaw<{ tag: string; n: number }[]>`SELECT unnest("tags") AS tag, COUNT(*)::int AS n FROM "Asset" WHERE "deletedAt" IS NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 40`.catch(() => []),
    prisma.asset.groupBy({ by: ["folder"], where: { deletedAt: null }, _count: true }),
  ]);
  return NextResponse.json({
    assets: list.map(toCard),
    tags: tagRows,
    folders: ASSET_FOLDERS.map((name) => ({ name, n: counts.find((c) => c.folder === name)?._count ?? 0 })),
  }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  const gate = await assetActor(req, true);
  if ("error" in gate) return gate.error;
  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("files") ?? []).filter((f): f is File => f instanceof File).slice(0, 20);
  if (!files.length) return NextResponse.json({ error: "Choose at least one picture." }, { status: 400 });
  const folderIn = String(form?.get("folder") ?? "General");
  const folder = (ASSET_FOLDERS as readonly string[]).includes(folderIn) ? folderIn : "General";
  const results: { name: string; id?: string; duplicate?: boolean; error?: string }[] = [];
  for (const file of files) {
    if (file.size > MAX_ASSET_BYTES) { results.push({ name: file.name, error: "Over 4 MB after shrinking." }); continue; }
    try {
      const r = await ingestAsset({ bytes: Buffer.from(await file.arrayBuffer()), fileName: file.name, mimeType: file.type, folder, actor: gate.actor });
      results.push({ name: file.name, id: r.asset.id, duplicate: r.duplicate });
    } catch (e) { results.push({ name: file.name, error: (e as Error).message }); }
  }
  const saved = await prisma.asset.findMany({ where: { id: { in: results.flatMap((r) => r.id ? [r.id] : []) } }, include: { _count: { select: { usages: true } } } });
  return NextResponse.json({ results, assets: saved.map(toCard) }, { headers: noStore });
}
