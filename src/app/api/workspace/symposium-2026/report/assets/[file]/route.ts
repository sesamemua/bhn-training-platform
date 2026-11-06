import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reportAssetTypes } from "@/lib/symposium-report/document";

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  if (!await requireRole("instructor").catch(() => null)) return new Response(null, { status: 403 });
  const { file } = await params;
  if (!Object.hasOwn(reportAssetTypes, file)) return new Response(null, { status: 404 });
  const asset = await prisma.symposiumReportAsset.findUnique({ where: { name: file } });
  if (!asset) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(asset.content), {
    headers: {
      "Content-Type": reportAssetTypes[file as keyof typeof reportAssetTypes],
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
