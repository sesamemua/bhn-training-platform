/** Server-side save sanitizer. Separate so jsdom never reaches a client bundle. */
import type { WindowLike } from "dompurify";
import { JSDOM } from "jsdom";
import { createHtmlSanitizer, sanitizeScriptCss } from "./sanitize";

const sanitizeHtml = createHtmlSanitizer(new JSDOM("").window as unknown as WindowLike);

/** Cleans `html` and `css` wherever present; TipTap docs pass through. */
export function sanitizeRichContent(rc: unknown): unknown {
  if (typeof rc !== "object" || rc === null || Array.isArray(rc)) return rc;
  const out = { ...(rc as Record<string, unknown>) };
  if (typeof out.html === "string") out.html = sanitizeHtml(out.html);
  if ("css" in out) out.css = sanitizeScriptCss(out.css);
  return out;
}
