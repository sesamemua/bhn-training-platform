/**
 * Picture edits for the ready-made sizes. sharp only, except expand(),
 * which asks Cloudflare's FLUX.2 [klein] model to paint the new edges.
 */
import "server-only";
import sharp from "sharp";
import { runFlux } from "@/lib/ai";

/** Fit the whole picture inside w×h over a blurred, dimmed copy of itself — nothing cropped. */
export async function fitWithBackdrop(src: Buffer, w: number, h: number): Promise<Buffer> {
  const back = await sharp(src, { pages: 1 }).resize(w, h, { fit: "cover" }).blur(40).modulate({ brightness: 0.85 }).toBuffer();
  const front = await sharp(src, { pages: 1 }).resize(w, h, { fit: "inside" }).toBuffer();
  return sharp(back).composite([{ input: front, gravity: "center" }]).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

const CF_ACCOUNT = process.env.CF_ACCOUNT_ID;
const CF_TOKEN = process.env.CF_AI_TOKEN;
const r64 = (n: number) => Math.max(64, Math.round(n / 64) * 64);

/**
 * Generative expand: grow the picture to w×h by painting new background
 * around it. The model works small, so its result is scaled up and the
 * real photo is laid back on top at full resolution — only the new edges
 * are AI. Returns null if the model is unavailable.
 */
export async function expandWithAI(src: Buffer, w: number, h: number, caption: string | null): Promise<Buffer | null> {
  if (!CF_ACCOUNT || !CF_TOKEN) return null;
  const k = 768 / Math.max(w, h);
  const ww = r64(w * k), wh = r64(h * k);
  const meta = await sharp(src, { pages: 1 }).metadata();
  const s = Math.min(ww / (meta.width ?? ww), wh / (meta.height ?? wh));
  const iw = Math.round((meta.width ?? ww) * s), ih = Math.round((meta.height ?? wh) * s);
  const left = Math.round((ww - iw) / 2), top = Math.round((wh - ih) / 2);
  const small = await sharp(src, { pages: 1 }).resize(iw, ih).toBuffer();
  const base = await sharp(src, { pages: 1 }).resize(ww, wh, { fit: "cover" }).blur(30)
    .composite([{ input: small, left, top }]).png().toBuffer();
  // FLUX has no mask: it gets the photo centred on a blurred copy of itself
  // and is asked to replace the blur. Only the edges are kept below.
  // The safety filter sometimes blanks event photos ("speakers", "audience"); retry once with a neutral prompt.
  const painted = await paint(base, ww, wh, sceneOf(caption)) ?? await paint(base, ww, wh, "A photograph");
  if (!painted) return null;
  // Lay the real photo back on top at full resolution, its edges feathered into the painted ones.
  const fw = Math.min(w, Math.round((meta.width ?? w) * Math.min(w / (meta.width ?? w), h / (meta.height ?? h))));
  const fh = Math.min(h, Math.round((meta.height ?? h) * Math.min(w / (meta.width ?? w), h / (meta.height ?? h))));
  const f = Math.max(8, Math.round(Math.min(fw, fh) * 0.04));
  const feather = await sharp(Buffer.from(`<svg width="${fw}" height="${fh}"><defs><filter id="b"><feGaussianBlur stdDeviation="${f / 2}"/></filter></defs><rect x="${f}" y="${f}" width="${fw - 2 * f}" height="${fh - 2 * f}" fill="#fff" filter="url(#b)"/></svg>`)).png().toBuffer();
  const front = await sharp(src, { pages: 1 }).resize(fw, fh).ensureAlpha().composite([{ input: feather, blend: "dest-in" }]).png().toBuffer();
  return sharp(painted).resize(w, h, { fit: "fill" }).composite([{ input: front, gravity: "center" }]).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

/** A scene description with words about people removed (they trip the safety filter). */
function sceneOf(caption: string | null): string {
  return (caption ?? "A photograph").replace(/\b(people|person|faces?|man|woman|men|women|child(ren)?|speakers?|audience|crowd|attendees?)\b/gi, "").replace(/\s+/g, " ").slice(0, 300);
}

async function paint(base: Buffer, width: number, height: number, scene: string): Promise<Buffer | null> {
  try {
    const out = await runFlux({
      prompt: `${scene}. Replace the blurred border with a natural continuation of the scene, matching light, colour and perspective. Keep the centre photo unchanged. High quality photo, no text, letters, logos, frames or borders.`,
      width, height, image: base, timeoutMs: 40_000,
    });
    // A blank (safety-filtered) answer is a failure, not a picture.
    const { channels } = await sharp(out).stats();
    return channels.slice(0, 3).every((c) => c.mean < 4) ? null : out;
  } catch { return null; }
}
