/**
 * Sanitizers for "html" scripts, whose content can come from anonymous share
 * link editors. Runs in the browser and on the server, so jsdom stays out of
 * this file (see sanitize-server.ts).
 */
import createDOMPurify, { type Config, type WindowLike } from "dompurify";

export interface HtmlRichContent {
  kind: "html";
  html: string;
  css: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The allowed richContent for a save, or undefined when it's malformed: an
 * HTML script's `{ kind, html, css }`, or (non-HTML formats) a TipTap doc/null.
 */
export function parseRichContent(value: unknown, format?: string): HtmlRichContent | Record<string, unknown> | null | undefined {
  if (isRecord(value) && value.kind === "html") {
    const { html, css = "" } = value;
    return typeof html === "string" && typeof css === "string" ? { kind: "html", html, css } : undefined;
  }
  if (format === "html") return undefined;
  if (value === null) return null;
  return isRecord(value) && value.type === "doc" ? value : undefined;
}

// External loads (data exfiltration) and breaking out of a <style> element.
const UNSAFE_CSS = /@import|<\/style|(?:url|src|image|image-set|cross-fade)\s*\(/i;

const decodeCssEscapes = (css: string) =>
  css.replace(/\\(?:([0-9a-f]{1,6})(?:\r\n|[ \t\r\n\f])?|([\s\S]))/gi, (_, hex: string | undefined, ch: string) => {
    if (!hex) return ch;
    const code = parseInt(hex, 16);
    return code <= 0x10ffff ? String.fromCodePoint(code) : "�";
  });

/**
 * Returns the CSS unchanged, or "" if it could load anything or escape its
 * <style>. Checking the whole text (escapes decoded) holds however a browser
 * parses it, which removing single rules would not.
 */
export function sanitizeScriptCss(css: unknown): string {
  if (typeof css !== "string") return "";
  return UNSAFE_CSS.test(decodeCssEscapes(css)) ? "" : css;
}

const HTML_CONFIG: Config = {
  USE_PROFILES: { html: true },
  ADD_ATTR: ["contenteditable"], // gantt labels and injected editor controls
  FORBID_TAGS: ["style", "form"], // <style> would bypass sanitizeScriptCss
};

export function createHtmlSanitizer(win: WindowLike): (html: string) => string {
  const purify = createDOMPurify(win);
  purify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName === "style") data.attrValue = sanitizeScriptCss(data.attrValue);
  });
  return (html) => purify.sanitize(html, HTML_CONFIG) as string;
}

let browserSanitizer: ((html: string) => string) | undefined;

/** Browser only: call immediately before any stored HTML reaches the DOM. */
export function sanitizeScriptHtml(html: string): string {
  browserSanitizer ??= createHtmlSanitizer(window);
  return browserSanitizer(html);
}
