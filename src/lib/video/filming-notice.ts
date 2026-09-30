/**
 * Printouts for a filming day, each one letter-size page built as a
 * standalone HTML document so the preview on screen is exactly what
 * prints: signs (quiet please, area closed, the windshield loading
 * notice…) and the photo & video release form people sign.
 *
 * Pure module: no React, no Prisma.
 */
import { z } from "zod";
export interface Notice {
  headline: string;
  subhead: string;
  when: string;
  where: string;
  message: string;
  thanks: string;
  /** A labelled blank line to fill in by hand — "Call or text:" on the windshield notice. */
  writeIn?: string;
  /** Absolute URL of the logo, printed as it is. */
  logoUrl: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Long headlines step down so they still fit in two or three lines. */
const headlineSize = (h: string) => (h.length <= 14 ? 64 : h.length <= 32 ? 54 : 42);
const lines = (s: string) => esc(s).replace(/\n/g, "<br>");

export function noticeHtml(n: Notice, opts: { print?: boolean; preview?: boolean } = {}): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(n.headline)}</title><style>
@page { size: letter portrait; margin: 0 }
* { box-sizing: border-box; margin: 0 }
html, body { background: #fff; color: #111; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact }
.page { width: 8.5in; height: 11in; padding: .75in .8in; display: flex; flex-direction: column; text-align: center; border: .18in solid #1f4b5b; margin: 0 auto }
.eyebrow { font-size: 15pt; font-weight: 700; letter-spacing: .35em; text-transform: uppercase; color: #1f4b5b; margin-top: .2in }
.dot { display: inline-block; width: .16in; height: .16in; border-radius: 50%; background: #d7263d; margin-right: .12in; vertical-align: middle }
h1 { font-size: 64pt; line-height: 1; font-weight: 800; margin-top: .35in; text-wrap: balance }
h2 { font-size: 28pt; font-weight: 600; margin-top: .2in; color: #333 }
.when { font-size: 22pt; font-weight: 700; margin-top: .55in }
.where { font-size: 15pt; color: #444; margin-top: .08in }
.message { font-size: 17pt; line-height: 1.45; margin: .55in auto 0; max-width: 6.2in; color: #222; text-wrap: pretty }
.thanks { font-size: 20pt; font-weight: 700; margin-top: .4in; color: #1f4b5b }
.foot { margin-top: auto; display: flex; justify-content: center }
.writein { display: flex; align-items: flex-end; gap: .15in; margin: .45in auto 0; width: 6.4in; font-size: 22pt; font-weight: 700 }
.writein .rule { flex: 1; height: .75in; border-bottom: 3px solid #111 }
.foot img { height: .7in; width: auto }
${opts.preview ? "" : "@media screen { body { padding: .25in 0; background: #e6e6e6 } .page { box-shadow: 0 1px 8px rgba(0,0,0,.2); background: #fff } }"}
</style></head><body><div class="page">
<p class="eyebrow"><span class="dot"></span>${esc(n.subhead)}</p>
<h1 style="font-size:${headlineSize(n.headline)}pt">${esc(n.headline)}</h1>
<p class="when">${esc(n.when)}</p>
<p class="where">${esc(n.where)}</p>
<p class="message">${lines(n.message)}</p>
${n.writeIn ? `<div class="writein"><span>${esc(n.writeIn)}</span><span class="rule"></span></div>` : ""}
<p class="thanks">${esc(n.thanks)}</p>
<div class="foot"><img src="${esc(n.logoUrl)}" alt="BioHubNet"></div>
</div>${opts.print ? `<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 300); });</script>` : ""}</body></html>`;
}

// ── the saved signs ──────────────────────────────────────────────────


/** Where a project's signs are kept (PlatformSetting), edits and all. */
export const printoutsKey = (projectId: string) => `video.printouts.${projectId}`;

export const SignSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(60),
  /** Made here rather than one of the built-in ones — can be deleted. */
  custom: z.boolean(),
  /** "sign" (a poster) or "release" (the form people sign). */
  kind: z.enum(["sign", "release"]).default("sign"),
  fields: z.object({
    subhead: z.string().max(80),
    headline: z.string().max(120),
    when: z.string().max(120),
    where: z.string().max(160),
    message: z.string().max(2000),
    thanks: z.string().max(200),
    writeIn: z.string().max(60).default(""),
  }),
});
export type Sign = z.infer<typeof SignSchema>;
export const SignsSchema = z.array(SignSchema).max(30);

/** Saved signs, read back safely: anything unreadable is dropped. */
export function parseSigns(raw: string | null | undefined): Sign[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.flatMap((x) => { const r = SignSchema.safeParse(x); return r.success ? [r.data] : []; }).slice(0, 30);
  } catch {
    return [];
  }
}

/** The built-in signs, with any saved edits laid over them, then the ones made here. */
export function mergeSigns(builtIn: Sign[], saved: Sign[]): Sign[] {
  const byId = new Map(saved.map((s) => [s.id, s]));
  return [
    ...builtIn.map((b) => { const s = byId.get(b.id); return s && !s.custom ? { ...b, fields: s.fields, label: s.label } : b; }),
    // (kind always comes from the built-in: a saved copy cannot turn a sign into a form)
    ...saved.filter((s) => s.custom),
  ];
}

/** The University of Toronto signature with the Leslie Dan Faculty of Pharmacy — official lockup, on white only. */
const UOFT_PHARMACY_LOGO = "/uoft-pharmacy-logo.png";

/**
 * The photo, video & audio release, one per person. The consent wording,
 * project, date, place and contact line are editable; the tick boxes, the
 * lines to sign and the privacy notice are fixed.
 */
export function releaseHtml(n: Notice, opts: { print?: boolean; preview?: boolean } = {}): string {
  const line = (label: string, wide = false) => `<div class="f${wide ? " wide" : ""}"><span class="rule"></span><span class="lab">${esc(label)}</span></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(n.headline)}</title><style>
@page { size: letter portrait; margin: 0 }
* { box-sizing: border-box; margin: 0 }
html, body { background: #fff; color: #111; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact }
.page { width: 8.5in; height: 11in; padding: .6in .7in; display: flex; flex-direction: column; margin: 0 auto; font-size: 10.5pt; line-height: 1.45 }
.logos { display: flex; justify-content: space-between; align-items: center; gap: .4in; padding-bottom: .16in; border-bottom: 1px solid #ddd }
.logos .uoft { height: .62in; width: auto }
.logos .bhn { height: .5in; width: auto }
.top { margin-top: .2in }
h1 { font-size: 20pt; line-height: 1.1; font-weight: 800; color: #1f4b5b }
.meta { margin-top: .08in; color: #333 }
.meta strong { color: #111 }
.consent { margin-top: .22in; text-wrap: pretty }
.ticks { margin-top: .18in; display: grid; gap: .07in }
.tick { display: flex; gap: .12in; align-items: baseline }
.box { display: inline-block; width: .17in; height: .17in; border: 1.5px solid #111; flex-shrink: 0; transform: translateY(.03in) }
.fields { margin-top: .25in; display: grid; grid-template-columns: 1fr 1fr; gap: .28in .35in }
.f { display: flex; flex-direction: column }
.f.wide { grid-column: span 2 }
.f .rule { height: .32in; border-bottom: 1.2px solid #111 }
.f .lab { font-size: 8.5pt; color: #555; margin-top: .03in }
.contact { margin-top: .2in; font-weight: 600; color: #1f4b5b }
.privacy { margin-top: auto; font-size: 7.5pt; line-height: 1.4; color: #555 }
${opts.preview ? "" : "@media screen { body { padding: .25in 0; background: #e6e6e6 } .page { box-shadow: 0 1px 8px rgba(0,0,0,.2); background: #fff } }"}
</style></head><body><div class="page">
<div class="logos"><img class="uoft" src="${esc(UOFT_PHARMACY_LOGO)}" alt="University of Toronto — Leslie Dan Faculty of Pharmacy"><img class="bhn" src="${esc(n.logoUrl)}" alt="BioHubNet"></div>
<div class="top"><h1>${esc(n.headline)}</h1>
<p class="meta"><strong>${esc(n.subhead)}</strong>${n.when ? ` · ${esc(n.when)}` : ""}${n.where ? `<br>${esc(n.where)}` : ""}</p></div>
<p class="consent">${lines(n.message)}</p>
<div class="ticks">
<p class="tick"><span class="box"></span><span>I agree to be <strong>photographed</strong> and <strong>filmed</strong>, including my <strong>voice</strong>.</span></p>
<p class="tick"><span class="box"></span><span>You may show my <strong>name and role or programme</strong> with my image.</span></p>
</div>
<div class="fields">
${line("Full name (please print)")}${line("Email")}
${line("Programme, organisation or role")}${line("Date")}
${line("Signature", true)}
</div>
<p class="contact">${esc(n.thanks)}</p>
<p class="privacy">The personal information on this form is collected under the authority of the University of Toronto Act, 1971, to keep a record of your consent and to contact you about it. It is protected in accordance with Ontario's Freedom of Information and Protection of Privacy Act. Questions about it can go to the contact above.</p>
</div>${opts.print ? `<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 300); });</script>` : ""}</body></html>`;
}

/** Whichever layout a printout uses. */
export const printableHtml = (kind: string | undefined, n: Notice, opts: { print?: boolean; preview?: boolean } = {}) =>
  kind === "release" ? releaseHtml(n, opts) : noticeHtml(n, opts);
