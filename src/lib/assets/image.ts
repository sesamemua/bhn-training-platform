/**
 * The image pipeline: verify the real type, turn upright, drop camera and
 * GPS metadata, thumbnail, blur placeholder and dominant colour. sharp
 * only — no database, no storage — so it can be tested directly.
 */
import sharp from "sharp";
import { IMAGE_TYPES } from "./core";

const FORMAT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp", "image/gif": "gif" };

export interface Processed { bytes: Buffer; thumb: Buffer; width: number | null; height: number | null; color: string | null; blur: string | null }

/** Verify, rotate upright, strip metadata, thumbnail, sample colour. */
export async function processImage(input: Buffer, mimeType: string): Promise<Processed> {
  if (!(IMAGE_TYPES as readonly string[]).includes(mimeType)) throw new Error("Use a PNG, JPEG, WebP or GIF picture.");
  const meta = await sharp(input, { limitInputPixels: 80_000_000 }).metadata().catch(() => null);
  if (!meta || meta.format !== FORMAT[mimeType]) throw new Error("That file is not the picture type it claims to be.");
  // GIFs keep their animation; everything else is re-encoded, which drops EXIF and GPS.
  const base = sharp(input, { limitInputPixels: 80_000_000 }).rotate();
  const bytes = mimeType === "image/gif" ? input
    : mimeType === "image/png" ? await base.clone().png().toBuffer()
    : mimeType === "image/webp" ? await base.clone().webp({ quality: 90 }).toBuffer()
    : await base.clone().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const upright = await sharp(bytes, { pages: 1 }).metadata();
  const thumb = await sharp(bytes, { pages: 1 }).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
  const tiny = await sharp(bytes, { pages: 1 }).resize(16).webp({ quality: 40 }).toBuffer();
  const { dominant } = await sharp(thumb).stats();
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return {
    bytes, thumb,
    width: upright.width ?? null, height: upright.height ?? null,
    color: `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`,
    blur: `data:image/webp;base64,${tiny.toString("base64")}`,
  };
}

