/**
 * Deterministic Mailchimp renderer.
 *
 * Why this isn't an LLM job: a 600-line table-based email has to survive
 * Outlook's Word renderer, and one dropped </td> silently breaks the whole
 * layout. So the AI decides *shape* (what becomes a glance card, a people
 * list, a CTA — see ./ai.ts) and this file guarantees the markup. Same
 * split as the rest of the platform: model decides, code emits.
 *
 * Output is a fragment intended for a Mailchimp **Code** content block,
 * matching the structure of the shipped June 2026 issue: 600px container,
 * gradient strips top and bottom, one ribbon per section.
 */
import { SECTION_THEME, SECTIONS } from "./types";
import type { Section, PieceLayout, GlanceRow, PersonRow, LinkRow } from "./types";

/** Escape for HTML text nodes. Contributions are pasted prose, so this is
 *  the only thing standing between a stray `<` and a broken email. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Only allow links we'd be happy pasting into an email client. */
function safeUrl(u: string | undefined): string | null {
  if (!u) return null;
  const t = u.trim();
  return /^https?:\/\//i.test(t) ? esc(t) : null;
}

const FONT = "Arial, Helvetica, sans-serif";

function paragraph(text: string, last = false, attrs = ""): string {
  return `<p${attrs} style="margin:0 0 ${last ? 0 : 16}px 0; font-family:${FONT}; font-size:15px; line-height:24px; color:#3a4a5c;">${esc(text)}</p>`;
}

function divider(rule: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0 28px 0;"><tbody><tr><td align="center"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tbody><tr><td width="32" height="1" style="background-color:${rule}; line-height:1px; font-size:0; opacity:0.5;">&nbsp;</td></tr></tbody></table></td></tr></tbody></table>`;
}

function glanceCard(rows: GlanceRow[], accent: string): string {
  const body = rows
    .map((r, i) => {
      const last = i === rows.length - 1;
      const tint = r.accent ? "#c0392b" : accent;
      const valTint = r.accent ? "#c0392b" : "#0b3558";
      const weight = r.accent ? "600" : "500";
      return `<tr><td width="100" style="font-family:${FONT}; font-size:13px; line-height:20px; color:${tint}; font-weight:600; letter-spacing:1.5px; text-transform:uppercase; vertical-align:top; padding:2px 16px ${last ? 0 : 10}px 0;">${esc(r.label)}</td><td style="font-family:${FONT}; font-size:15px; line-height:23px; color:${valTint}; font-weight:${weight}; vertical-align:top; padding:0 0 ${last ? 0 : 10}px 0;">${esc(r.value)}</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px 0; background-color:#fafbfc; background-image:linear-gradient(135deg, #f4f8f7 0%, #ffffff 100%); border-radius:12px;" class="bhn-card"><tbody><tr><td style="padding:22px 24px;"><p style="margin:0 0 14px 0; font-family:${FONT}; font-size:13px; line-height:18px; color:${accent}; font-weight:600; letter-spacing:2px; text-transform:uppercase;">At a Glance</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tbody>${body}</tbody></table></td></tr></tbody></table>`;
}

function peopleList(rows: PersonRow[], label: string | undefined, accent: string): string {
  const head = label
    ? `<tr><td style="padding:0 0 10px 0; font-family:${FONT}; font-size:14px; line-height:20px; color:${accent}; font-weight:600; text-transform:uppercase; letter-spacing:2.5px;">${esc(label)}</td></tr>`
    : "";
  const items = rows
    .map((p, i) => {
      const last = i === rows.length - 1;
      const detail = p.detail
        ? ` <span style="font-family:${FONT}; font-size:14px; font-weight:400; color:#7a8595;">· ${esc(p.detail)}</span>`
        : "";
      const org = p.org
        ? `<p style="margin:0; font-family:${FONT}; font-size:14px; line-height:21px; color:${accent}; font-weight:600;">${esc(p.org)}</p>`
        : "";
      return `<tr><td style="padding:14px 0 14px 0;${last ? "" : " border-bottom:1px solid #eef1f5;"}"><p style="margin:0 0 4px 0; font-family:${FONT}; font-size:17px; line-height:22px; color:#0b3558; font-weight:600; letter-spacing:-0.2px;">${esc(p.name)}${detail}</p>${org}</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;"><tbody>${head}<tr><td style="border-top:1px solid #d6e4ea; height:0; line-height:0; font-size:0;">&nbsp;</td></tr>${items}</tbody></table>`;
}

function noteCard(text: string, badge: string | undefined, accent: string): string {
  const chip = badge
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px 0;"><tbody><tr><td style="background-color:#ffffff; border:1px solid #cce0e8; border-radius:20px; padding:5px 14px; font-family:${FONT}; font-size:13px; line-height:16px; color:${accent}; font-weight:600; letter-spacing:1.5px; text-transform:uppercase;">${esc(badge)}</td></tr></tbody></table>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px 0; background-color:#f4f9fb; background-image:linear-gradient(135deg, #f4f9fb 0%, #ffffff 100%); border-radius:12px; border:1px solid #e6eef2;" class="bhn-card-teal"><tbody><tr><td style="padding:20px 24px;">${chip}<p style="margin:0; font-family:${FONT}; font-size:15px; line-height:23px; color:#0b3558; font-weight:600;">${esc(text)}</p></td></tr></tbody></table>`;
}

/** Two-across outlined chips, as in the June issue's pathway list. A
 *  two-column table rather than inline-blocks: Outlook ignores
 *  display:inline-block widths and would stack them full-bleed. */
function linkGrid(rows: LinkRow[], accent: string): string {
  const cells = rows.map((r) => {
    const url = safeUrl(r.url);
    if (!url) return null;
    return `<td width="50%" style="padding:0 6px 10px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tbody><tr><td align="center" style="border:1px solid ${accent}; border-radius:6px;"><a href="${url}" target="_blank" style="display:block; padding:11px 10px; font-family:${FONT}; font-size:13px; line-height:18px; color:${accent}; text-decoration:none; font-weight:700;">${esc(r.label)} &rarr;</a></td></tr></tbody></table></td>`;
  }).filter(Boolean) as string[];
  if (cells.length === 0) return "";
  const trs: string[] = [];
  for (let i = 0; i < cells.length; i += 2) {
    const pair = cells.slice(i, i + 2);
    if (pair.length === 1) pair.push(`<td width="50%">&nbsp;</td>`);
    trs.push(`<tr>${pair.join("")}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 18px 0;"><tbody>${trs.join("")}</tbody></table>`;
}

function button(label: string, url: string, solid: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tbody><tr><td><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tbody><tr><td align="center" style="background-color:${solid}; background-image:linear-gradient(135deg, ${solid} 0%, ${solid} 100%); border-radius:30px;"><a href="${url}" target="_blank" style="display:inline-block; padding:14px 32px; font-family:${FONT}; font-size:15px; line-height:20px; color:#ffffff; text-decoration:none; font-weight:600; letter-spacing:0.3px;">${esc(label)} &rarr;</a></td></tr></tbody></table></td></tr></tbody></table>`;
}

function renderPiece(l: PieceLayout, s: Section, isLast: boolean, pieceId?: string): string {
  const t = SECTION_THEME[s];
  const out: string[] = [];
  // Review anchors. `data-nl-*` attributes are inert in every email
  // client (unknown attributes are ignored) but give the in-app review
  // layer a stable handle on each element. They are emitted only when a
  // piece id is supplied, so the Mailchimp copy stays clean unless the
  // caller asks for anchors.
  const a = (label: string) =>
    pieceId ? ` data-nl-piece="${esc(pieceId)}" data-nl-part="${esc(label)}"` : "";
  out.push(
    `<h2${a("Headline")} style="margin:0 0 ${l.subhead ? 4 : 14}px 0; font-family:${FONT}; font-size:24px; line-height:30px; color:#0b3558; font-weight:600; letter-spacing:-0.3px;">${esc(l.headline)}</h2>`,
  );
  if (l.subhead) {
    out.push(
      `<h3${a("Subhead")} style="margin:0 0 14px 0; font-family:${FONT}; font-size:16px; line-height:23px; color:#3a4a5c; font-weight:500; letter-spacing:-0.1px;">${esc(l.subhead)}</h3>`,
    );
  }
  l.body.forEach((p, i) =>
    out.push(paragraph(p, i === l.body.length - 1 && !l.glance && !l.people, a(`Paragraph ${i + 1}`))),
  );
  if (l.people?.length) out.push(peopleList(l.people, l.peopleLabel, t.accent));
  if (l.glance?.length) out.push(glanceCard(l.glance, t.accent));
  if (l.links?.length) out.push(linkGrid(l.links, t.accent));
  if (l.note) out.push(noteCard(l.note, l.noteBadge, t.accent));
  const url = safeUrl(l.ctaUrl);
  if (url && l.ctaLabel) out.push(button(l.ctaLabel, url, t.solid));
  if (!isLast) out.push(divider(t.rule));
  return out.join("\n");
}

export interface RenderIssueInput {
  dateline: string;
  preheader?: string | null;
  /** Pieces already grouped + ordered by the caller. */
  bySection: Record<Section, PieceLayout[]>;
  /**
   * NewsletterPiece ids, parallel to `bySection`, enabling review
   * anchors. Omit for the Mailchimp export — the anchors are harmless in
   * email but there is no reason to ship them — and supply for the
   * in-app review preview, where they are what a comment pins to.
   */
  idsBySection?: Partial<Record<Section, string[]>>;
}

/** Build the Mailchimp code-block fragment for a whole issue. */
export function renderIssue(input: RenderIssueInput): string {
  const ids = input.idsBySection ?? {};
  const STRIP =
    "background-color:#011d57; background-image:linear-gradient(90deg, #0d6054 0%, #016e8f 50%, #011d57 100%);";
  const parts: string[] = [];

  parts.push(`<!-- ===================================================== -->
<!-- BioHubNet Newsletter — Mailchimp code block            -->
<!-- Generated by the Newsletter workshop. Paste into a     -->
<!-- Mailchimp "Code" content block.                        -->
<!-- ===================================================== -->`);

  if (input.preheader) {
    parts.push(
      `<div style="display:none; font-size:1px; color:#ffffff; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden;">${esc(input.preheader)}</div>`,
    );
  }

  parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bhn-bg" style="background-color:#ffffff; padding:32px 16px;"><tbody><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="bhn-container" style="width:600px; max-width:600px; background-color:#ffffff; border:1px solid #e5e9ee; border-radius:14px; overflow:hidden;"><tbody>
<tr><td style="padding:0; line-height:0; font-size:0; height:6px; ${STRIP}" height="6">&nbsp;</td></tr>`);

  for (const s of SECTIONS) {
    const pieces = input.bySection[s] ?? [];
    if (pieces.length === 0) continue; // an empty section prints nothing
    const t = SECTION_THEME[s];

    parts.push(`<tr><td style="background-color:${t.solid}; background-image:${t.ribbon}; padding:22px 36px;" align="left"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tbody><tr><td valign="middle"><p style="margin:0; font-family:${FONT}; font-size:26px; line-height:32px; color:#ffffff; font-weight:700; letter-spacing:1px;">${t.label} <span style="font-weight:400; font-size:14px; letter-spacing:1px; padding-left:6px; color:#ffffff;"> ${esc(t.tagline)}</span></p></td></tr></tbody></table></td></tr>`);

    const inner = pieces
      .map((p, i) => renderPiece(p, s, i === pieces.length - 1, ids[s]?.[i]))
      .join("\n");
    parts.push(`<tr><td style="padding:44px 44px 32px 44px;" align="left">${inner}</td></tr>`);
    parts.push(`<tr><td style="height:8px; line-height:8px; font-size:1px;">&nbsp;</td></tr>`);
  }

  parts.push(`<tr><td style="padding:0; line-height:0; font-size:0; height:6px; ${STRIP}" height="6">&nbsp;</td></tr>
</tbody></table>
</td></tr></tbody></table>`);

  return parts.join("\n");
}
