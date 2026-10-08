/**
 * Turn what somebody picked — a PDF or an image — into page images in the
 * browser, small enough to upload (each under the request limit) and sharp
 * enough to judge a design by.
 *
 * PDFs are drawn with pdf.js, loaded from cdnjs only when a PDF is actually
 * chosen: nothing is added to the app's bundle for a tool most visits never use.
 * ponytail: CDN-loaded pdf.js 3.11 (UMD). If the CDN is ever blocked, add
 * pdfjs-dist as a dependency and import it here instead.
 */
import { MAX_PAGE_BYTES, MAX_PAGES } from "@/lib/design-review/types";

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";
/** Long side of a stored page, in pixels: readable when zoomed, a reasonable file. */
const LONG_SIDE = 3200;

export interface RenderedPage { blob: Blob; w: number; h: number }

type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> } }> }> };
};

let loading: Promise<PdfJs> | null = null;
function pdfjs(): Promise<PdfJs> {
  loading ??= new Promise<PdfJs>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${PDFJS}/pdf.min.js`;
    s.onload = () => {
      const lib = (window as unknown as { pdfjsLib?: PdfJs }).pdfjsLib;
      if (!lib) return reject(new Error("The PDF reader didn't load."));
      lib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`;
      resolve(lib);
    };
    s.onerror = () => { loading = null; reject(new Error("The PDF reader couldn't be loaded — check your connection, or upload images instead.")); };
    document.head.appendChild(s);
  });
  return loading;
}

/** A canvas as a JPEG under the upload limit — quality first, then size, gives way. */
async function toJpeg(canvas: HTMLCanvasElement): Promise<RenderedPage> {
  let c = canvas;
  for (let attempt = 0; attempt < 6; attempt++) {
    for (const q of [0.9, 0.8, 0.7]) {
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", q));
      if (blob && blob.size <= MAX_PAGE_BYTES * 0.95) return { blob, w: c.width, h: c.height };
    }
    const smaller = document.createElement("canvas");
    smaller.width = Math.round(c.width * 0.8);
    smaller.height = Math.round(c.height * 0.8);
    smaller.getContext("2d")!.drawImage(c, 0, 0, smaller.width, smaller.height);
    c = smaller;
  }
  throw new Error("That page is too detailed to upload — export it at a lower resolution.");
}

export async function renderFile(file: File, onProgress?: (done: number, total: number) => void): Promise<RenderedPage[]> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    if (doc.numPages > MAX_PAGES) throw new Error(`That PDF has ${doc.numPages} pages — the most one artwork can hold is ${MAX_PAGES}.`);
    const out: RenderedPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: LONG_SIDE / Math.max(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      out.push(await toJpeg(canvas));
      onProgress?.(n, doc.numPages);
    }
    return out;
  }
  if (!file.type.startsWith("image/")) throw new Error("Upload a PDF or an image (PNG, JPEG, WebP).");
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error("That image couldn't be read.");
  const k = Math.min(1, LONG_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  onProgress?.(1, 1);
  return [await toJpeg(canvas)];
}

/** Render a file and upload its pages; returns them as the artwork stores them. */
export async function uploadFile(file: File, onProgress?: (label: string) => void) {
  onProgress?.("Reading the file…");
  const pages = await renderFile(file, (d, t) => onProgress?.(`Preparing page ${d} of ${t}…`));
  const out: { key: string; url: string; w: number; h: number }[] = [];
  for (let i = 0; i < pages.length; i++) {
    onProgress?.(`Uploading page ${i + 1} of ${pages.length}…`);
    const fd = new FormData();
    fd.set("file", new File([pages[i].blob], `page-${i + 1}.jpg`, { type: "image/jpeg" }));
    const r = await fetch("/api/workspace/design-review/upload", { method: "POST", body: fd }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { ok?: boolean; key?: string; url?: string; error?: string };
    if (!r?.ok || !j.key || !j.url) throw new Error(j.error ?? "A page didn't upload — try again.");
    out.push({ key: j.key, url: j.url, w: pages[i].w, h: pages[i].h });
  }
  return out;
}
