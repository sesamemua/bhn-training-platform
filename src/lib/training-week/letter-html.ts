/**
 * A plain-text letter as HTML, with chosen links drawn as buttons.
 *
 * The text is still sent alongside, unchanged, so a client that shows
 * plain text gets the same links. A line carrying a button link becomes
 * that button; every other link is made clickable where it stands.
 *
 * Pure module.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const URL_RE = /https?:\/\/[^\s<]+/g;

export function letterHtml(text: string, buttons: { url: string; label: string }[] = []): string {
  const byUrl = new Map(buttons.map((b) => [b.url, b.label]));
  const lines = text.split("\n").map((line) => {
    const hit = (line.match(URL_RE) ?? []).find((u) => byUrl.has(u));
    if (hit) {
      return `<a href="${esc(hit)}" style="display:inline-block;margin:4px 0;padding:9px 16px;border:1px solid #b91c1c;border-radius:8px;color:#b91c1c;font-weight:600;text-decoration:none;white-space:normal">${esc(byUrl.get(hit)!)}</a>`;
    }
    return esc(line).replace(URL_RE, (u) => `<a href="${u}" style="color:#1f4b5b">${u}</a>`);
  });
  return (
    `<div style="font:15px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;white-space:pre-wrap;overflow-wrap:anywhere">` +
    lines.join("<br>") +
    `</div>`
  );
}
