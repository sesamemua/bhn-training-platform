import { createHash } from "node:crypto";
import sharp from "sharp";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { REPORT_ID } from "@/lib/symposium-report/document";
import { chapterGallery, PHOTO_UPLOAD_LIMIT, reportSectionId, uploadedPhotoLabel } from "@/lib/symposium-report/gallery";
import { readReportGallery } from "@/lib/symposium-report/gallery-store";
import { reportTransaction } from "@/lib/symposium-report/store";

const error = (message: string, status: number) => Response.json({ error: message }, { status });

export async function GET(request: Request) {
  if (!await requireRole("instructor").catch(() => null)) return error("Sign in as a reviewer.", 403);
  const section = new URL(request.url).searchParams.get("section") ?? "";
  if (!reportSectionId.test(section)) return error("Choose a report section.", 400);
  const [catalogue, uploads] = await Promise.all([
    readReportGallery(),
    prisma.symposiumReportAsset.findMany({
      where: { name: { startsWith: `local.${section}.` } }, select: { name: true }, orderBy: { name: "asc" },
    }),
  ]);
  const preferred = chapterGallery[section] ?? [];
  const ordered = [...preferred.flatMap((id) => catalogue.groups.filter((group) => group.id === id)),
    ...catalogue.groups.filter((group) => !preferred.includes(group.id))];
  const groups = uploads.length
    ? [...ordered, { id: "local", title: "Uploaded for this section", photos: uploads.map(({ name }) => ({ file: name, label: uploadedPhotoLabel(name) })) }]
    : ordered;
  return Response.json({ groups }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!await requireRole("instructor").catch(() => null)) return error("Sign in as a reviewer.", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site") return error("Open the report to upload a photo.", 403);
  if (Number(request.headers.get("content-length")) > PHOTO_UPLOAD_LIMIT + 20_000) return error("Choose a photo under 3.5 MB.", 413);
  const data = await request.formData().catch(() => null);
  const section = data?.get("section");
  const file = data?.get("photo");
  if (typeof section !== "string" || !reportSectionId.test(section) || !(file instanceof File)) return error("Choose a local photograph.", 400);
  if (file.size > PHOTO_UPLOAD_LIMIT) return error("Choose a photo under 3.5 MB.", 413);
  let image: Buffer;
  try {
    const source = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 65_000_000 });
    const metadata = await source.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) return error("Choose a JPEG, PNG or WebP photo.", 415);
    image = await source.rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  } catch { return error("This photo couldn’t be read. Try exporting it as JPEG.", 415); }
  if (image.byteLength > 500_000) return error("This photo is too detailed for the review gallery. Choose a smaller copy.", 413);

  const slug = file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "photo";
  const hash = createHash("sha256").update(image).digest("hex").slice(0, 24);
  const name = `local.${section}.${hash}.${slug}.webp`;
  return reportTransaction(async (tx) => {
    const review = await tx.pageReview.findUnique({ where: { id: REPORT_ID }, select: { status: true } });
    if (review?.status !== "open") return error("This review round is locked.", 409);
    const existing = await tx.symposiumReportAsset.findUnique({ where: { name }, select: { name: true } });
    if (!existing) {
      const count = await tx.symposiumReportAsset.count({ where: { name: { startsWith: "local." } } });
      if (count >= 100) return error("The report has reached its 100-photo upload limit.", 409);
      await tx.symposiumReportAsset.create({ data: { name, content: new Uint8Array(image) } });
    }
    return Response.json({ file: name, label: uploadedPhotoLabel(name) });
  });
}
