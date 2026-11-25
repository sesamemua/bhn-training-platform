/** Normalized source-image region, including hair/headroom rather than only facial landmarks. */
export interface HeadRegion { x: number; y: number; width: number; height: number; source?: "detected" | "manual" }
export interface CropPlacement { x: number; y: number; fit: "cover" | "portrait" | "whole"; zoom?: number; rotate?: 0 | 90 | 180 | 270; flip?: boolean }
export interface ImageSize { width: number; height: number }
export const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

/** Project a source point through the same object-fit, position, scale/mirror and turn used by PhotoFigure. */
export function projectImagePoint(p: { x: number; y: number }, image: ImageSize, frame: ImageSize, crop: CropPlacement) {
  const turn = (crop.rotate ?? 0) * Math.PI / 180;
  const quarter = crop.rotate === 90 || crop.rotate === 270;
  const w = quarter ? frame.height : frame.width, h = quarter ? frame.width : frame.height;
  const size = (crop.fit === "whole" ? Math.min : Math.max)(w / image.width, h / image.height);
  const dw = image.width * size, dh = image.height * size;
  const ox = quarter ? w / 2 : w * crop.x / 100, oy = quarter ? h / 2 : h * crop.y / 100;
  const zoom = (crop.zoom ?? 100) / 100;
  const x = ((w - dw) * crop.x / 100 + p.x * dw - ox) * zoom * (crop.flip ? -1 : 1);
  const y = ((h - dh) * crop.y / 100 + p.y * dh - oy) * zoom;
  return { x: x * Math.cos(turn) - y * Math.sin(turn) + ox + (frame.width - w) / 2,
    y: x * Math.sin(turn) + y * Math.cos(turn) + oy + (frame.height - h) / 2 };
}

export function headCropRisk(head: HeadRegion, image: ImageSize, frame: ImageSize, crop: CropPlacement) {
  const points = [{ x: head.x, y: head.y }, { x: head.x + head.width, y: head.y },
    { x: head.x, y: head.y + head.height }, { x: head.x + head.width, y: head.y + head.height }]
    .map(p => projectImagePoint(p, image, frame, crop));
  const bounds = { left: Math.min(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)),
    right: Math.max(...points.map(p => p.x)), bottom: Math.max(...points.map(p => p.y)) };
  return { clipped: bounds.left < -1 || bounds.top < -1 || bounds.right > frame.width + 1 || bounds.bottom > frame.height + 1, bounds };
}

/** Exclude incidental people at the image's sides/bottom from automatic primary-subject selection. */
export function primaryHead(heads: HeadRegion[]): HeadRegion | undefined {
  return heads.filter(h => h.x + h.width / 2 > .2 && h.x + h.width / 2 < .8 && h.y + h.height / 2 < .68)
    .sort((a, b) => score(b) - score(a))[0];
}
function score(h: HeadRegion) { return h.width * h.height * (1 - .7 * Math.abs(h.x + h.width / 2 - .5)); }

/** Keep existing rotation/mirroring, reduce zoom only when needed, and search for a safe crop. */
export function headSafeCrop(head: HeadRegion, image: ImageSize, frame: ImageSize, crop: CropPlacement): CropPlacement | null {
  let best: { crop: CropPlacement; cost: number } | null = null;
  for (const zoom of Array.from(new Set([crop.zoom ?? 100, 100]))) for (let x = 0; x <= 100; x += 5) for (let y = 0; y <= 100; y += 5) {
    const candidate = { ...crop, x, y, zoom };
    if (headCropRisk(head, image, frame, candidate).clipped) continue;
    const cost = Math.abs(x - crop.x) + Math.abs(y - crop.y) + Math.abs(zoom - (crop.zoom ?? 100)) * 2;
    if (!best || cost < best.cost) best = { crop: candidate, cost };
  }
  return best?.crop ?? null;
}
