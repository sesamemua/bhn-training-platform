import { clamp, type HeadRegion } from "./head-crop";

interface Detection { boundingBox?: { originX: number; originY: number; width: number; height: number } }
interface Detector { detect(image: HTMLImageElement | HTMLCanvasElement): { detections: Detection[] } }
interface Vision { FilesetResolver: { forVisionTasks(path: string): Promise<unknown> }; FaceDetector: { createFromOptions(files: unknown, options: unknown): Promise<Detector> } }
let engine: Promise<Detector> | undefined;
const cache = new Map<string, HeadRegion[]>();

/** Lazy same-origin runtime/model. No image upload, identity matching or background page scans. */
export async function detectHeads(image: HTMLImageElement): Promise<HeadRegion[]> {
  const cached = cache.get(image.currentSrc || image.src);
  if (cached) return cached;
  engine ??= (async () => {
    const moduleUrl = "/vendor/mediapipe-face/vision_bundle.mjs";
    const vision = await import(/* webpackIgnore: true */ moduleUrl) as Vision;
    const files = await vision.FilesetResolver.forVisionTasks("/vendor/mediapipe-face/wasm");
    return vision.FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: "/vendor/mediapipe-face/blaze_face_short_range.tflite", delegate: "CPU" }, runningMode: "IMAGE", minDetectionConfidence: .45 });
  })().catch(error => { engine = undefined; throw error; });
  const detector = await engine;
  const heads: HeadRegion[] = [];
  // A room projection can be too small for a short-range face model in the full image.
  // Overlapping upper-image crops provide a second scale without prioritizing bottom bystanders.
  for (const region of [{ x: 0, y: 0, w: 1, h: 1 }, { x: .2, y: .03, w: .6, h: .62 }, { x: 0, y: 0, w: .55, h: .7 }, { x: .45, y: 0, w: .55, h: .7 }]) {
    const canvas = document.createElement("canvas");
    const width = image.naturalWidth * region.w, height = image.naturalHeight * region.h;
    const scale = Math.min(1, 960 / Math.max(width, height));
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image analysis canvas is unavailable");
    context.drawImage(image, region.x * image.naturalWidth, region.y * image.naturalHeight, width, height, 0, 0, canvas.width, canvas.height);
    for (const { boundingBox: b } of detector.detect(canvas).detections) {
      if (!b) continue;
      const x = clamp(region.x + (b.originX - b.width * .12) / canvas.width * region.w);
      const y = clamp(region.y + (b.originY - b.height * .45) / canvas.height * region.h);
      const head: HeadRegion = { x, y, width: clamp(region.x + (b.originX + b.width * 1.12) / canvas.width * region.w) - x,
        height: clamp(region.y + (b.originY + b.height * 1.12) / canvas.height * region.h) - y, source: "detected" };
      if (head.width <= 0 || head.height <= 0) continue;
      if (!heads.some(h => Math.hypot(h.x + h.width / 2 - head.x - head.width / 2, h.y + h.height / 2 - head.y - head.height / 2) < Math.min(h.width, head.width) * .5)) heads.push(head);
    }
  }
  cache.set(image.currentSrc || image.src, heads);
  return heads;
}
