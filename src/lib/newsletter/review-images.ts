import "server-only";
import type { Prisma } from "@prisma/client";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { r2, R2_BUCKET, r2KeyFromPublicUrl } from "@/lib/r2";
import { assetUrl } from "@/lib/assets/usage";
import { ingestAsset } from "@/lib/assets/store";
import { IMAGE_TYPES, MAX_ASSET_BYTES, publishBlock } from "@/lib/assets/core";
import { reviewImages, type ImageEdit, type ResolvedImageEdit, type SavedImageChange } from "@/lib/page-review/edit-images";

export class ReviewImageError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const imageTransformSchema = z.object({
  rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
  flipX: z.boolean().optional(), flipY: z.boolean().optional(),
  crop: z.object({ left: z.number().min(0).max(1), top: z.number().min(0).max(1), width: z.number().gt(0).max(1), height: z.number().gt(0).max(1) }).strict()
    .refine(crop => crop.left + crop.width <= 1.000001 && crop.top + crop.height <= 1.000001).optional(),
}).strict();
export type ImageTransform = z.infer<typeof imageTransformSchema>;

async function availableAsset(db: Pick<Prisma.TransactionClient, "asset">, id: string) {
  const asset = await db.asset.findUnique({ where: { id } });
  if (!asset || asset.kind !== "image" || !asset.key || asset.deletedAt) throw new ReviewImageError("This picture is no longer available.", 404);
  const blocked = publishBlock(asset);
  if (blocked) throw new ReviewImageError(blocked, 409);
  const url = assetUrl(asset.key);
  if (!url?.startsWith("https://")) throw new ReviewImageError("Secure image storage is unavailable.", 503);
  return { ...asset, url };
}

export async function newsletterReviewImages(html: string) {
  const images = reviewImages(html);
  const keys = [...new Set(images.flatMap(image => r2KeyFromPublicUrl(image.src) || []))];
  const assets = keys.length ? await prisma.asset.findMany({ where: { key: { in: keys }, deletedAt: null, kind: "image" }, select: { id: true, key: true } }) : [];
  return images.map(image => ({ ...image, assetId: assets.find(asset => asset.key === r2KeyFromPublicUrl(image.src))?.id ?? null }));
}

export async function resolveReviewImageEdits(db: Prisma.TransactionClient, edits: ImageEdit[]): Promise<ResolvedImageEdit[]> {
  return Promise.all(edits.map(async edit => edit.assetId && !edit.remove ? { ...edit, url: (await availableAsset(db, edit.assetId)).url } : edit));
}

/** Baked pixels, not CSS transforms, keep the same appearance in email clients. */
export async function transformReviewPicture(bytes: Buffer, transform: ImageTransform) {
  const source = sharp(bytes, { limitInputPixels: 80_000_000 });
  const meta = await source.metadata();
  if (!meta.format || !["jpeg", "png", "webp", "gif"].includes(meta.format)) throw new ReviewImageError("Choose a PNG, JPEG, WebP or GIF picture.", 415);
  if ((meta.pages ?? 1) > 1) throw new ReviewImageError("Animated pictures cannot be cropped or rotated here. Upload a still image instead.", 415);
  const oriented = await source.rotate().png().toBuffer({ resolveWithObject: true });
  let image = sharp(oriented.data, { limitInputPixels: 80_000_000 });
  if (transform.crop) {
    const crop = transform.crop, width = oriented.info.width, height = oriented.info.height;
    const left = Math.min(width - 1, Math.floor(crop.left * width)), top = Math.min(height - 1, Math.floor(crop.top * height));
    image = image.extract({ left, top, width: Math.min(width - left, Math.max(1, Math.round(crop.width * width))), height: Math.min(height - top, Math.max(1, Math.round(crop.height * height))) });
  }
  return image.flop(!!transform.flipX).flip(!!transform.flipY).rotate(transform.rotate).png().toBuffer();
}

export async function uploadReviewPicture(input: { file?: File; assetId?: string; transform?: ImageTransform; issueId: string; actorId: string }) {
  let bytes: Buffer, mimeType: string, fileName: string;
  let original: Awaited<ReturnType<typeof availableAsset>> | undefined;
  if (input.assetId) {
    original = await availableAsset(prisma, input.assetId);
    if (!input.transform) return { id: original.id, url: original.url, alt: original.altText || original.title, width: original.width, height: original.height };
    if (!r2) throw new ReviewImageError("Image storage is unavailable.", 503);
    if (original.sizeBytes > 20_000_000) throw new ReviewImageError("Choose an image under 20 MB for adjustments.", 413);
    const object = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: original.key }));
    if (!object.Body || (object.ContentLength ?? 0) > 20_000_000) throw new ReviewImageError("The saved picture is too large to adjust.", 413);
    bytes = Buffer.from(await object.Body.transformToByteArray());
    if (bytes.byteLength > 20_000_000) throw new ReviewImageError("The saved picture is too large to adjust.", 413);
    mimeType = original.mimeType; fileName = original.fileName;
  } else {
    const file = input.file!;
    if (!file.size || file.size > MAX_ASSET_BYTES) throw new ReviewImageError("Choose a picture under 4.3 MB.", 413);
    if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) throw new ReviewImageError("Choose a PNG, JPEG, WebP or GIF picture.", 415);
    bytes = Buffer.from(await file.arrayBuffer()); mimeType = file.type; fileName = file.name;
  }
  if (input.transform) {
    bytes = await transformReviewPicture(bytes, input.transform);
    mimeType = "image/png"; fileName = `${fileName.replace(/\.[^.]+$/, "")}-adjusted.png`;
    if (bytes.byteLength > 20_000_000) throw new ReviewImageError("The adjusted picture is too large. Choose a smaller crop.", 413);
  }
  const result = await ingestAsset({ bytes, fileName, mimeType, folder: "General", tags: ["newsletter"], source: `Newsletter ${input.issueId}`,
    ...(input.transform ? { origin: original?.origin === "ai_generated" || original?.origin === "ai_edited" ? original.origin : "edited" } : {}), actor: { id: input.actorId, name: null } });
  // Recheck after processing; a derived rendition must not reset the source's rights.
  if (original) {
    original = await availableAsset(prisma, original.id);
    if (result.duplicate) {
      const duplicate = await availableAsset(prisma, result.asset.id);
      const rights = (asset: Awaited<ReturnType<typeof availableAsset>>) => JSON.stringify([asset.consent, asset.people, asset.credit, asset.license, asset.expiresAt]);
      if (rights(original) !== rights(duplicate)) throw new ReviewImageError("An existing copy has different image rights. Ask an editor to reconcile its rights before using this adjustment.", 409);
    } else await prisma.asset.update({ where: { id: result.asset.id }, data: {
      consent: original.consent, people: original.people, credit: original.credit, license: original.license, expiresAt: original.expiresAt, altText: original.altText,
    } });
  }
  const asset = await availableAsset(prisma, result.asset.id);
  return { id: asset.id, url: asset.url, alt: asset.altText || asset.title, width: asset.width, height: asset.height };
}

/** Sync recognized Compose slots; keep both originals and replacements used by archived rounds. */
export async function saveReviewImageReferences(db: Prisma.TransactionClient, issueId: string, changes: SavedImageChange[]) {
  if (!changes.length) return;
  const prefix = `newsletter.media.${issueId}.`;
  const rows = await db.platformSetting.findMany({ where: { key: { startsWith: prefix } }, select: { key: true, value: true } });
  const retain = async (assetId: string) => {
    const usage = { assetId, targetType: "newsletterReviewImage", targetId: `newsletter-${issueId}:${assetId}` };
    await db.assetUsage.upsert({ where: { assetId_targetType_targetId: usage }, create: { ...usage, label: "Newsletter review history", href: `/admin/workspace/marketing/newsletter/review?issue=${encodeURIComponent(issueId)}` }, update: {} });
  };
  for (const change of changes) if (change.assetId && !change.remove) await retain(change.assetId);
  const oldKeys = [...new Set(changes.flatMap(change => r2KeyFromPublicUrl(change.before.src) || []))];
  if (oldKeys.length) {
    const originals = await db.asset.findMany({ where: { key: { in: oldKeys }, kind: "image" }, select: { id: true } });
    for (const original of originals) await retain(original.id);
  }
  for (const row of rows) {
    const stored = JSON.parse(row.value) as { version: number; images: { id: string; assetId: string; url: string; alt: string }[] };
    if (stored.version !== 1 || !Array.isArray(stored.images)) throw new ReviewImageError("Saved picture references could not be read.", 409);
    let modified = false;
    for (const change of changes) {
      const image = stored.images.find(item => item.id === change.imageId);
      if (!image) continue;
      if (image.url !== change.before.src) throw new ReviewImageError("This picture changed in Compose. Reload before saving.", 409);
      await retain(image.assetId);
      if (change.remove) stored.images = stored.images.filter(item => item !== image);
      else { image.url = change.src; image.alt = change.altText; if (change.assetId) image.assetId = change.assetId; }
      const targetId = `${row.key}.${image.id}`;
      await db.assetUsage.deleteMany({ where: { targetType: "newsletterImage", targetId } });
      if (!change.remove) {
        const usage = { assetId: image.assetId, targetType: "newsletterImage", targetId };
        await db.assetUsage.upsert({ where: { assetId_targetType_targetId: usage }, create: { ...usage, label: "Newsletter contribution", href: `/admin/workspace/marketing/newsletter/review?issue=${encodeURIComponent(issueId)}` }, update: {} });
      }
      modified = true;
    }
    if (modified) await db.platformSetting.update({ where: { key: row.key }, data: { value: JSON.stringify(stored) } });
  }
}
