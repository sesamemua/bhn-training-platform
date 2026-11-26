import { JSDOM } from "jsdom";
import { z } from "zod";
import { isWholeDocument, stripScripts } from "./paste-document";

export const imageEditSchema = z.object({
  index: z.number().int().nonnegative(),
  before: z.object({ src: z.string().max(8000), alt: z.string().max(2000) }).strict(),
  assetId: z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/).optional(),
  alt: z.string().max(400).optional(),
  width: z.number().int().min(10).max(100).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  remove: z.boolean().optional(),
}).strict().refine(edit => edit.remove || edit.assetId || edit.alt !== undefined || edit.width !== undefined || edit.align !== undefined);
export type ImageEdit = z.infer<typeof imageEditSchema>;
export type ResolvedImageEdit = ImageEdit & { url?: string };
export type SavedImageChange = ResolvedImageEdit & { imageId: string | null; src: string; altText: string };

const excluded = "#bhn-review-overlay,.bhn-review-marker,.bhn-report-inline-comment,dialog,[data-bhn-review-ui],template";
const imageNodes = (doc: Document) => Array.from(doc.body.querySelectorAll("img")).filter(image => !image.closest(excluded));
const parse = (html: string) => new JSDOM(isWholeDocument(html) ? stripScripts(html) : `<!doctype html><html><body>${stripScripts(html)}</body></html>`);

export function reviewImages(html: string) {
  const dom = parse(html);
  try {
    return imageNodes(dom.window.document).map((image, index) => ({ index, src: image.getAttribute("src") || "", alt: image.getAttribute("alt") || "" }));
  } finally { dom.window.close(); }
}

/** Only validated properties change; replacement URLs are resolved from Asset records by the server. */
export function editReviewImages(html: string, edits: ResolvedImageEdit[]) {
  if (!edits.length) return { html, changes: [] as SavedImageChange[] };
  const dom = parse(html);
  try {
    const nodes = imageNodes(dom.window.document), seen = new Set<number>();
    const changes: SavedImageChange[] = [];
    for (const edit of edits) {
      const image = nodes[edit.index];
      if (seen.has(edit.index) || !image || (image.getAttribute("src") || "") !== edit.before.src || (image.getAttribute("alt") || "") !== edit.before.alt) {
        throw new Error("The selected image changed. Reload before saving.");
      }
      seen.add(edit.index);
      const previous = image.outerHTML;
      const imageId = image.closest("[data-nl-image]")?.getAttribute("data-nl-image") || null;
      if (edit.assetId) {
        if (!edit.url || new URL(edit.url).protocol !== "https:") throw new Error("Choose a saved picture with a secure public URL.");
        image.setAttribute("src", edit.url);
        image.removeAttribute("height");
        image.style.height = "auto";
        for (const attribute of ["srcset", "sizes", "data-src", "data-srcset"]) image.removeAttribute(attribute);
        image.closest("picture")?.querySelectorAll("source").forEach(source => source.remove());
      }
      if (edit.alt !== undefined) image.setAttribute("alt", edit.alt);
      if (edit.width !== undefined) {
        image.setAttribute("width", `${edit.width}%`);
        image.removeAttribute("height");
        image.style.width = `${edit.width}%`;
        image.style.maxWidth = "100%";
        image.style.height = "auto";
        image.style.display = "block";
      }
      if (edit.align !== undefined) {
        image.removeAttribute("align");
        image.style.display = "block";
        image.style.marginLeft = edit.align === "left" ? "0" : "auto";
        image.style.marginRight = edit.align === "right" ? "0" : "auto";
      }
      const changed = edit.remove || previous !== image.outerHTML;
      if (changed) changes.push({ ...edit, imageId, src: image.getAttribute("src") || "", altText: image.getAttribute("alt") || "" });
      if (edit.remove) {
        const link = image.closest("a");
        image.remove();
        if (link && !link.textContent?.trim() && !link.querySelector("img,svg,video,audio,iframe,input,button")) link.remove();
      }
    }
    return { html: changes.length ? (isWholeDocument(html) ? dom.serialize() : dom.window.document.body.innerHTML) : html, changes };
  } finally { dom.window.close(); }
}
