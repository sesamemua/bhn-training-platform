/**
 * A plain-text letter as a designed HTML email.
 *
 * The text is still sent alongside, unchanged, so a client that shows
 * plain text gets the same words and links. Here the same text is laid
 * out as one card: a header band, then each paragraph of the letter as
 * its own box where it is one — sessions ("  • Name — when") in a box
 * coloured by what it says (green for a confirmed seat, amber for the
 * waitlist, grey for not offered), a blue strip for "information will
 * follow", and a quiet panel for the "I can't attend" buttons.
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
/** A box of sessions takes its colour from the sentence that introduces it. */
const TONES = {
  good: { bar: "#059669", bg: "#ecfdf5", line: "#a7f3d0", head: "#065f46" },
  wait: { bar: "#d97706", bg: "#fffbeb", line: "#fde68a", head: "#92400e" },
  none: { bar: "#64748b", bg: "#f8fafc", line: "#e2e8f0", head: "#334155" },
};
const toneOf = (heading: string): keyof typeof TONES =>
  /waitlist/i.test(heading) ? "wait" : /not able|released|declin|no longer/i.test(heading) ? "none" : "good";
const BOX = "margin:0 0 12px;border-radius:8px;padding:12px 14px";

/** `after` may add HTML under a line (the pass QR sits under its link this way). */
export function letterHtml(text: string, buttons: LetterButton[] = [], after?: (line: string) => string): string {
  const byUrl = new Map(buttons.map((b) => [b.url, b]));
  const buttonOf = (raw: string) => { const u = (raw.match(URL_RE) ?? []).find((x) => byUrl.has(x)); return u ? byUrl.get(u)! : null; };
  const plain = (raw: string) => {
    const linked = esc(raw.trim()).replace(URL_RE, (u) => `<a href="${u}" style="color:${TEAL}">${u}</a>`);
    // Indented detail lines ("  When:  …") sit a step in.
    return `<div${/^\s{2,}\S/.test(raw) ? ' style="padding-left:12px;color:#334155"' : ""}>${linked}</div>${after?.(raw) ?? ""}`;
  };
  const button = (b: { url: string; label: string; tone?: "quiet" | "primary" }) =>
    `<div style="margin:6px 0 0"><a href="${esc(b.url)}" style="display:inline-block;text-decoration:none;${BUTTON[b.tone ?? "quiet"]}">${esc(b.label)}</a></div>`;
  const session = (raw: string, t: (typeof TONES)[keyof typeof TONES]) => {
    const body = raw.replace(/^\s*•\s+/, "");
    // The name may itself hold a dash ("Discovery to Delivery — CCRM"): the when is after the LAST one.
    const cut = body.lastIndexOf(" — ");
    const name = cut < 0 ? body : body.slice(0, cut);
    const when = cut < 0 ? "" : body.slice(cut + 3);
    return `<div style="margin:8px 0 0;padding:8px 0 0;border-top:1px solid ${t.line}"><strong style="color:#0f172a">${esc(name)}</strong>${when ? `<br><span style="font-size:14px;color:#475569">${esc(when)}</span>` : ""}</div>`;
  };

  const blocks = text.split(/\n{2,}/).map((block) => {
    const lines = block.split("\n");
    const isBullet = (l: string) => /^\s*•\s+/.test(l);
    if (lines.some(isBullet)) {
      const heading = lines.filter((l) => !isBullet(l)).join(" ");
      const t = TONES[toneOf(heading)];
      return (
        `<div style="${BOX};background:${t.bg};border:1px solid ${t.line};border-left:4px solid ${t.bar}">` +
        (heading.trim() ? `<div style="font-weight:700;color:${t.head}">${esc(heading.trim())}</div>` : "") +
        lines.filter(isBullet).map((l) => session(l, t)).join("") + `</div>`
      );
    }
    if (lines.some((l) => buttonOf(l))) {
      return `<div style="${BOX};background:#f8fafc;border:1px solid #e2e8f0">${lines.map((l) => { const b = buttonOf(l); return b ? button(b) : plain(l); }).join("")}</div>`;
    }
    if (/^location information/i.test(block.trim())) {
      return `<div style="${BOX};background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a">${lines.map(plain).join("")}</div>`;
    }
    return `<div style="margin:0 0 12px">${lines.map(plain).join("")}</div>`;
  });
  return (
    `<div style="max-width:600px;border:1px solid #d9e2ec;border-radius:12px;overflow:hidden;font:15px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;overflow-wrap:anywhere">` +
    `<div style="padding:14px 20px;background:#0b4a5e;font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#ffffff">BioHubNet Training Week 2026</div>` +
    `<div style="padding:20px 20px 8px;background:#ffffff">${blocks.join("")}</div>` +
    `</div>`
  );
}
