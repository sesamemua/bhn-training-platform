/** One asset: detail (usage, versions), edit, and permanent delete from the trash. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteR2ObjectByUrl } from "@/lib/r2";
import { AssetPatch, normalizeTags } from "@/lib/assets/core";
import { assetActor, assetUrl, embedAsset, toCard } from "@/lib/assets/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

async function detail(id: string) {
  const a = await prisma.asset.findUnique({ where: { id }, include: { _count: { select: { usages: true } }, usages: { orderBy: { createdAt: "desc" } }, versions: { orderBy: { version: "desc" } } } });
  if (!a) return null;
  return { ...toCard(a),
    usages: a.usages.map((u) => ({ id: u.id, label: u.label, href: u.href, targetType: u.targetType, at: u.createdAt.toISOString() })),
    versions: a.versions.map((v) => ({ version: v.version, url: assetUrl(v.key)!, thumbUrl: assetUrl(v.thumbKey), sizeBytes: v.sizeBytes, width: v.width, height: v.height, at: v.createdAt.toISOString() })),
  };
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const gate = await assetActor(req, false);
  if ("error" in gate) return gate.error;
  const d = await detail((await params).id);
  return d ? NextResponse.json({ asset: d }, { headers: { "Cache-Control": "private, no-store" } }) : NextResponse.json({ error: "Not found." }, { status: 404 });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const gate = await assetActor(req, true);
  if ("error" in gate) return gate.error;
  const { id } = await params;
  const parsed = AssetPatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  const p = parsed.data;
  const a = await prisma.asset.findUnique({ where: { id }, select: { locked: true, _count: { select: { usages: true } } } });
  if (!a) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const onlyLockToggle = Object.keys(p).every((k) => k === "locked");
  if (a.locked && !onlyLockToggle && p.locked !== false) return NextResponse.json({ error: "This brand asset is locked. Unlock it to make changes." }, { status: 409 });
  if (p.trashed && a._count.usages) return NextResponse.json({ error: "This picture is still in use. Remove it from those places first." }, { status: 409 });
  const { trashed, tags, expiresAt, ...rest } = p;
  await prisma.asset.update({ where: { id }, data: {
    ...rest,
    ...(tags ? { tags: normalizeTags(tags) } : {}),
    ...(expiresAt !== undefined ? { expiresAt: expiresAt ? new Date(expiresAt) : null } : {}),
    ...(trashed !== undefined ? { deletedAt: trashed ? new Date() : null } : {}),
  } });
  if (p.title || p.caption !== undefined || tags || p.people !== undefined) await embedAsset(id).catch(() => {});
  return NextResponse.json({ asset: await detail(id) });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const gate = await assetActor(req, true);
  if ("error" in gate) return gate.error;
  const { id } = await params;
  const a = await prisma.asset.findUnique({ where: { id }, include: { versions: true, _count: { select: { usages: true } } } });
  if (!a) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!a.deletedAt) return NextResponse.json({ error: "Move it to the trash first." }, { status: 409 });
  if (a._count.usages) return NextResponse.json({ error: "This picture is still in use." }, { status: 409 });
  for (const k of [a.key, a.thumbKey, ...a.versions.flatMap((v) => [v.key, v.thumbKey])]) if (k) await deleteR2ObjectByUrl(k).catch(() => {});
  await prisma.asset.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
