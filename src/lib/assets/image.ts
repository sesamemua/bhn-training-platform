/**
 * The image pipeline: verify the real type, turn upright, drop camera and
 * GPS metadata, thumbnail, blur placeholder and dominant colour. sharp
 * only — no database, no storage — so it can be tested directly.
 */
import sharp from "sharp";
import { IMAGE_TYPES } from "./core";

const FORMAT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp", "image/gif": "gif" };

export interface Processed { phash: string; bytes: Buffer; thumb: Buffer; width: number | null; height: number | null; color: string | null; blur: string | null }

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
    phash: await lookHash(bytes), bytes, thumb,
    width: upright.width ?? null, height: upright.height ?? null,
    color: `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`,
    blur: `data:image/webp;base64,${tiny.toString("base64")}`,
  };
}


/** 64-bit difference hash: how the picture's brightness steps left→right. */
export async function lookHash(bytes: Buffer): Promise<string> {
  const px = await sharp(bytes, { pages: 1 }).grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let hex = "";
  for (let row = 0; row < 8; row++) {
    let byte = 0;
    for (let col = 0; col < 8; col++) byte = (byte << 1) | (px[row * 9 + col] > px[row * 9 + col + 1] ? 1 : 0);
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

export interface Provenance {
  make?: string; model?: string; software?: string; capturedAt?: string;
  digitalSourceType?: string; generator?: string; contentCredentials: boolean;
}

const GENERATORS = /midjourney|dall[·\-\s]?e|firefly|stable ?diffusion|imagen|ideogram|flux\.?1|gpt-image|leonardo\.ai|runway/i;

/** Read the few EXIF text tags we keep, from sharp's raw EXIF block (TIFF inside "Exif\0\0"). */
function exifText(exif: Buffer | undefined): Partial<Provenance> {
  if (!exif || exif.length < 14) return {};
  const t = exif.subarray(exif.indexOf("Exif") === 0 ? 6 : 0);
  const le = t.toString("latin1", 0, 2) === "II";
  const u16 = (o: number) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
  const u32 = (o: number) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
  const out: Partial<Provenance> = {};
  const read = (ifd: number, depth = 0) => {
    if (ifd <= 0 || ifd + 2 > t.length || depth > 2) return;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > t.length) return;
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      if (tag === 0x8769) { read(u32(e + 8), depth + 1); continue; }
      if (type !== 2 || count < 2) continue;
      const at = count <= 4 ? e + 8 : u32(e + 8);
      if (at + count > t.length) continue;
      const v = t.toString("latin1", at, at + count).replace(/\0+$/, "").trim().slice(0, 120);
      if (tag === 0x010f) out.make = v;
      else if (tag === 0x0110) out.model = v;
      else if (tag === 0x0131) out.software = v;
      else if (tag === 0x9003 || (tag === 0x0132 && !out.capturedAt)) out.capturedAt = v;
    }
  };
  try { read(u32(4)); } catch { /* malformed EXIF: keep what we have */ }
  return out;
}

/**
 * What the file says about where it came from, read BEFORE metadata is
 * stripped. GPS is never kept. Content Credentials (C2PA) are detected,
 * not verified: re-encoding breaks their signature, so we record the fact.
 */
export async function readProvenance(input: Buffer): Promise<Provenance> {
  const meta = await sharp(input, { limitInputPixels: 80_000_000 }).metadata().catch(() => null);
  const ex = exifText(meta?.exif);
  const xmp = meta?.xmp ? meta.xmp.toString("utf8") : "";
  const head = input.subarray(0, 3_000_000).toString("latin1");
  const dst = xmp.match(/DigitalSourceType[^>]*?(?:rdf:resource=|>|=)\s*"?([^"<\s]+)/i)?.[1]
    ?? head.match(/digitalsourcetype\/(\w+)/i)?.[0];
  const tool = xmp.match(/CreatorTool(?:="|>)([^"<]+)/i)?.[1];
  const software = ex.software ?? tool;
  const generator = [software, tool, xmp.slice(0, 20000), head.includes("c2pa") ? head.slice(0, 200000) : ""].join(" ").match(GENERATORS)?.[0];
  return {
    ...ex, ...(software ? { software } : {}),
    ...(dst ? { digitalSourceType: dst } : {}),
    ...(generator ? { generator } : {}),
    contentCredentials: head.includes("c2pa") || head.includes("caBX"),
  };
}
