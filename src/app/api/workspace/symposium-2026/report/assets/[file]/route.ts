import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reportAssetTypes } from "@/lib/symposium-report/document";
import { isGalleryPhoto } from "@/lib/symposium-report/gallery";

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  if (!await requireRole("instructor").catch(() => null)) return new Response(null, { status: 403 });
  const { file } = await params;
  const type = isGalleryPhoto(file) ? "image/webp" : Object.hasOwn(reportAssetTypes, file) ? reportAssetTypes[file] : null;
  if (!type) return new Response(null, { status: 404 });
  const asset = await prisma.symposiumReportAsset.findUnique({ where: { name: file } });
  if (!asset) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(asset.content), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
