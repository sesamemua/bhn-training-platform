/**
 * The notice for the door on a filming day: filming in progress, the
 * hours, and a polite request to keep the noise down. One letter-size
 * page, built as a standalone HTML document so the preview on screen is
 * exactly what prints.
 *
 * Pure module: no React, no Prisma.
 */
export interface Notice {
  headline: string;
  subhead: string;
  when: string;
  where: string;
  message: string;
  thanks: string;
  /** Absolute URL of the logo, printed as it is. */
  logoUrl: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
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
.foot img { height: .7in; width: auto }
${opts.preview ? "" : "@media screen { body { padding: .25in 0; background: #e6e6e6 } .page { box-shadow: 0 1px 8px rgba(0,0,0,.2); background: #fff } }"}
</style></head><body><div class="page">
<p class="eyebrow"><span class="dot"></span>${esc(n.subhead)}</p>
<h1>${esc(n.headline)}</h1>
<p class="when">${esc(n.when)}</p>
<p class="where">${esc(n.where)}</p>
<p class="message">${lines(n.message)}</p>
<p class="thanks">${esc(n.thanks)}</p>
<div class="foot"><img src="${esc(n.logoUrl)}" alt="BioHubNet"></div>
</div>${opts.print ? `<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 300); });</script>` : ""}</body></html>`;
}
