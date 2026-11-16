/** Newsletter attachments are editorial data, separate from AI-owned layouts. */
import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assetUrl } from "@/lib/assets/usage";
import { publishBlock } from "@/lib/assets/core";
import { isSection, type NewsletterImage, type Section } from "./types";

export const MAX_NEWSLETTER_IMAGES = 20;
export interface NewsletterMedia {
  sectionImages: Partial<Record<Section, NewsletterImage[]>>;
  imagesByPieceId: Record<string, NewsletterImage[]>;
}
export interface NewsletterImageTarget { targetType: "section" | "piece"; targetId: string }
export type NewsletterImageMutation =
  | { action: "attach"; assetIds: string[] }
  | { action: "remove"; imageId: string }
  | { action: "updateAlt"; imageId: string; alt: string }
  | { action: "reorder"; imageIds: string[] };

export class NewsletterMediaError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const Id = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/);
const StoredImages = z.object({
  version: z.literal(1),
  images: z.array(z.object({
    id: Id, assetId: Id,
    url: z.url().refine((url) => /^https:\/\//i.test(url)),
    alt: z.string().max(400),
  })).max(MAX_NEWSLETTER_IMAGES),
});
const prefix = (issueId: string) => `newsletter.media.${issueId}.`;
const mediaKey = (issueId: string, target: NewsletterImageTarget) => `${prefix(issueId)}${target.targetType}.${target.targetId}`;
const usageId = (key: string, imageId: string) => `${key}.${imageId}`;

function parseImages(value: string): NewsletterImage[] {
  try { return StoredImages.parse(JSON.parse(value)).images; }
  catch { throw new NewsletterMediaError("Saved pictures could not be read. Please contact an editor before changing them.", 500); }
}

/** Ordered pictures for all section and contribution slots in one issue. */
export async function getNewsletterMedia(issueId: string): Promise<NewsletterMedia> {
  const rows = await prisma.platformSetting.findMany({ where: { key: { startsWith: prefix(issueId) } }, select: { key: true, value: true } });
  const result: NewsletterMedia = { sectionImages: {}, imagesByPieceId: {} };
  for (const row of rows) {
    const [kind, id] = row.key.slice(prefix(issueId).length).split(".");
    if (kind === "section" && isSection(id)) result.sectionImages[id] = parseImages(row.value);
    else if (kind === "piece" && Id.safeParse(id).success) result.imagesByPieceId[id] = parseImages(row.value);
  }
  return result;
}

/** Called in the piece-delete transaction; shared library files remain intact. */
export async function removeNewsletterPieceImages(tx: Prisma.TransactionClient, issueId: string, pieceId: string): Promise<void> {
  const key = mediaKey(issueId, { targetType: "piece", targetId: pieceId });
  await tx.assetUsage.deleteMany({ where: { targetType: "newsletterImage", targetId: { startsWith: `${key}.` } } });
  await tx.platformSetting.deleteMany({ where: { key } });
}

/**
 * The row and its asset usages change atomically. Serializable retries re-read
 * current images, so simultaneous appends/removals do not lose another edit.
 * Uploads happen before this transaction; retries never upload a second file.
 */
export async function mutateNewsletterImages(issueId: string, target: NewsletterImageTarget, mutation: NewsletterImageMutation): Promise<NewsletterImage[]> {
  if (!Id.safeParse(issueId).success || !Id.safeParse(target.targetId).success || !["section", "piece"].includes(target.targetType)) {
    throw new NewsletterMediaError("Choose a valid newsletter section or contribution.");
  }
  const key = mediaKey(issueId, target);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const issue = await tx.newsletterIssue.findUnique({ where: { id: issueId }, select: { title: true, status: true } });
        if (!issue) throw new NewsletterMediaError("Issue not found.", 404);
        if (issue.status === "sent") throw new NewsletterMediaError("This newsletter has already been sent. Its pictures cannot be changed.", 409);
        if (target.targetType === "section") {
          if (!isSection(target.targetId)) throw new NewsletterMediaError("Choose a valid newsletter section.");
        } else {
          const piece = await tx.newsletterPiece.findFirst({ where: { id: target.targetId, issueId }, select: { id: true } });
          if (!piece) throw new NewsletterMediaError("Contribution not found in this newsletter.", 404);
        }
        const row = await tx.platformSetting.findUnique({ where: { key }, select: { value: true } });
        const before = row ? parseImages(row.value) : [];
        let images = [...before];
        if (mutation.action === "attach") {
          const assetIds = [...new Set(mutation.assetIds)].filter((id) => !before.some((image) => image.assetId === id));
          if (images.length + assetIds.length > MAX_NEWSLETTER_IMAGES) throw new NewsletterMediaError(`Each section or contribution can have up to ${MAX_NEWSLETTER_IMAGES} pictures. Remove one before adding more.`, 409);
          const assets = assetIds.length ? await tx.asset.findMany({ where: { id: { in: assetIds }, deletedAt: null, kind: "image", key: { not: "" } } }) : [];
          for (const assetId of assetIds) {
            const asset = assets.find((item) => item.id === assetId);
            if (!asset) throw new NewsletterMediaError("A selected picture is unavailable.", 404);
            const blocked = publishBlock(asset);
            if (blocked) throw new NewsletterMediaError(blocked, 409);
            const url = assetUrl(asset.key);
            if (!url || !/^https:\/\//i.test(url)) throw new NewsletterMediaError("Secure image storage is unavailable.", 503);
            images.push({ id: randomUUID(), assetId, url, alt: (asset.altText || asset.title || asset.fileName || "Newsletter picture").slice(0, 400) });
          }
        } else if (mutation.action === "remove") {
          images = images.filter((image) => image.id !== mutation.imageId);
        } else if (mutation.action === "updateAlt") {
          if (!images.some((image) => image.id === mutation.imageId)) throw new NewsletterMediaError("Picture not found.", 404);
          images = images.map((image) => image.id === mutation.imageId ? { ...image, alt: mutation.alt.trim() } : image);
        } else {
          if (mutation.imageIds.length !== images.length || new Set(mutation.imageIds).size !== images.length || mutation.imageIds.some((id) => !images.some((image) => image.id === id))) {
            throw new NewsletterMediaError("The pictures changed while you were reordering them. Reload and try again.", 409);
          }
          images = mutation.imageIds.map((id) => images.find((image) => image.id === id)!);
        }
        await tx.platformSetting.upsert({ where: { key }, create: { key, value: JSON.stringify({ version: 1, images }) }, update: { value: JSON.stringify({ version: 1, images }) } });
        const removed = before.filter((image) => !images.some((current) => current.id === image.id));
        if (removed.length) await tx.assetUsage.deleteMany({ where: { targetType: "newsletterImage", targetId: { in: removed.map((image) => usageId(key, image.id)) } } });
        for (const image of images.filter((item) => !before.some((old) => old.id === item.id))) {
          const usage = { assetId: image.assetId, targetType: "newsletterImage", targetId: usageId(key, image.id) };
          const metadata = { label: `${issue.title} · ${target.targetType === "section" ? target.targetId.toUpperCase() : "contribution"}`, href: `/admin/workspace/marketing/newsletter/review?issue=${encodeURIComponent(issueId)}` };
          await tx.assetUsage.upsert({ where: { assetId_targetType_targetId: usage }, create: { ...usage, ...metadata }, update: metadata });
        }
        // Preserve the polished/custom HTML, but do not present it as current
        // after a contributor changes pictures. Saving a review refreshes it.
        if (JSON.stringify(images) !== JSON.stringify(before)) {
          await tx.newsletterIssue.update({ where: { id: issueId }, data: { renderedAt: null } });
        }
        return images;
      }, { isolationLevel: "Serializable", timeout: 10_000 });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      if (!["P2034", "P2002"].includes(String(code))) throw error;
      if (attempt === 3) throw new NewsletterMediaError("Another editor is changing these pictures. Please try again.", 409);
    }
  }
  throw new NewsletterMediaError("Could not save the pictures.", 500);
}
