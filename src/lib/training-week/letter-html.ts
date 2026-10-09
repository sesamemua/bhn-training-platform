/**
 * A plain-text letter as a designed HTML email.
 *
 * The text is still sent alongside, unchanged, so a client that shows
 * plain text gets the same words and links. Here the same text is laid
 * out: a header, paragraphs, each session ("  • Name — when") as its own
 * row, and chosen links drawn as buttons — a quiet one for "I can't
 * attend", a solid one for "Check in".
 *
 * Inline styles only, one column, no images: what every mail client shows.
 *
 * Pure module.
 */
export interface LetterButton { url: string; label: string; tone?: "quiet" | "primary" }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const URL_RE = /https?:\/\/[^\s<]+/g;
const TEAL = "#0e7da3";
const BUTTON = {
  // Small and plain on purpose: it is there for whoever needs it, not shouting at everybody else.
  quiet: `padding:4px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;color:#475569;background:#ffffff`,
  primary: `padding:9px 18px;border:1px solid ${TEAL};border-radius:8px;font-size:15px;font-weight:600;color:#ffffff;background:${TEAL}`,
};

/** `after` may add HTML under a line (the pass QR sits under its link this way). */
export function letterHtml(text: string, buttons: LetterButton[] = [], after?: (line: string) => string): string {
  const byUrl = new Map(buttons.map((b) => [b.url, b]));
  const line = (raw: string): string => {
    const hit = (raw.match(URL_RE) ?? []).find((u) => byUrl.has(u));
    if (hit) {
      const b = byUrl.get(hit)!;
      return `<div style="margin:6px 0"><a href="${esc(hit)}" style="display:inline-block;text-decoration:none;${BUTTON[b.tone ?? "quiet"]}">${esc(b.label)}</a></div>`;
    }
    const extra = after?.(raw) ?? "";
    // A session: "  • Name — Monday 26 October, 11:00–13:30".
    const bullet = raw.match(/^\s*•\s+(.*)$/);
    if (bullet) {
      // The name may itself hold a dash ("Discovery to Delivery — CCRM"): the when is after the LAST one.
      const cut = bullet[1].lastIndexOf(" — ");
      const name = cut < 0 ? bullet[1] : bullet[1].slice(0, cut);
      const when = cut < 0 ? "" : bullet[1].slice(cut + 3);
      return (
        `<div style="margin:6px 0;padding:9px 12px;border-left:3px solid ${TEAL};background:#f3f8fa;border-radius:0 6px 6px 0">` +
        `<strong style="color:#0f172a">${esc(name)}</strong>${when ? `<br><span style="font-size:14px;color:#475569">${esc(when)}</span>` : ""}</div>${extra}`
      );
    }
    const linked = esc(raw.trim()).replace(URL_RE, (u) => `<a href="${u}" style="color:${TEAL}">${u}</a>`);
    // Indented detail lines ("  When:  …") sit a step in.
    return /^\s{2,}\S/.test(raw) ? `<div style="padding-left:12px;color:#334155">${linked}</div>${extra}` : `<div>${linked}</div>${extra}`;
  };
  const blocks = text.split(/\n{2,}/).map((b) => `<div style="margin:0 0 16px">${b.split("\n").map(line).join("")}</div>`);
  return (
    `<div style="max-width:600px;font:15px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;overflow-wrap:anywhere">` +
    `<div style="margin:0 0 20px;padding:0 0 10px;border-bottom:2px solid ${TEAL};font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#0b4a5e">BioHubNet Training Week 2026</div>` +
    blocks.join("") +
    `</div>`
  );
}
