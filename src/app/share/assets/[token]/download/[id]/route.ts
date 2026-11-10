/** Download from a shared collection: counts the download, then hands over the original. */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assetUrl } from "@/lib/assets/usage";
import { sharedAssetIds } from "@/lib/assets/share";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const ids = await sharedAssetIds(token);
  if (!ids?.includes(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const a = await prisma.asset.update({ where: { id }, data: { downloads: { increment: 1 } }, select: { key: true } }).catch(() => null);
  return a ? NextResponse.redirect(assetUrl(a.key)!, 302) : NextResponse.json({ error: "Not found." }, { status: 404 });
}
