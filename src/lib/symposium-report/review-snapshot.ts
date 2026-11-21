import type { Report, ReportPhoto } from "./document";
import { reportBlocks } from "./paginate";
import { photoAdjust, photoLabel, photoPreset, REPORT_ASSETS } from "./photos";

function escape(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function reportReviewSnapshot(report: Report, origin: string) {
  function figure(photo: ReportPhoto, showCaption = true) {
    const source = new URL(`${REPORT_ASSETS}/${encodeURIComponent(photo.file)}`, origin).href;
    const { scale, rotate } = photoAdjust(photo);
    const adjust = `${scale ? `;scale:${scale}` : ""}${rotate ? `;rotate:${rotate}` : ""}`;
    return `<figure style="overflow:hidden"><img src="${escape(source)}" alt="${escape(photoLabel(photo))}" style="object-position:${photo.x}% ${photo.y}%;object-fit:${photo.fit === "whole" ? "contain" : "cover"}${adjust}">${showCaption ? `<figcaption>${escape(photoLabel(photo))} · ${photo.fit} · ${photo.x}% / ${photo.y}%</figcaption>` : ""}</figure>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#fff;color:#172b35;font:14px/1.5 system-ui,sans-serif;overflow-wrap:anywhere}
    section{padding:18px 20px;border-bottom:1px solid #dce5e8}
    h1,h2,h3{line-height:1.2;font-family:Georgia,serif;margin:0 0 8px}
    p{white-space:pre-wrap}small,figcaption{color:#415760}figure{margin:12px 0}img{width:100%;height:auto;aspect-ratio:3/2;background:#edf1f2}
  </style></head><body>
    <section><h1>${escape(report.cover.title)}</h1><p>${escape(report.cover.theme)}</p><p>${escape(report.cover.date)}</p>${figure(report.cover.photo ?? photoPreset("cover.jpg"))}</section>
    ${report.pages.map((page) => `<section><small>${escape(page.label)}</small><h2>${escape(page.title)}</h2>
      ${reportBlocks(page.text).map(({ kind, text }) => {
        const tag = kind === "heading" ? "h3" : kind === "note" || kind === "quote" ? "blockquote" : kind === "bullet" ? "li" : "p";
        const content = `<${tag}>${escape(text)}</${tag}>`;
        return kind === "bullet" ? `<ul>${content}</ul>` : content;
      }).join("")}
      ${page.registration ? `<p>${page.registration.categories.map(({ label, count }) => `${escape(label)} ${page.registration!.percentagesOnly ? (count / page.registration!.categories.reduce((sum, c) => sum + c.count, 0) * 100).toFixed(1) + "%" : count}`).join(" · ")}</p>${page.registration.audience ? `<p>Trainee / HQP ${(page.registration.audience.trainees / (page.registration.audience.trainees + page.registration.audience.professionals) * 100).toFixed(0)}% · Professional ${(page.registration.audience.professionals / (page.registration.audience.trainees + page.registration.audience.professionals) * 100).toFixed(0)}%</p>` : ""}<p>${escape(page.registration.source)}</p>` : ""}
      ${Object.entries(page.photos ?? {}).sort(([a], [b]) => a.localeCompare(b)).filter(([, photo]) => !photo.hidden).map(([, photo]) => figure(photo, page.showCaptions !== false)).join("")}
    </section>`).join("")}
    <section><h2>${escape(report.back.title)}</h2><p>${escape(report.back.text)}</p></section>
  </body></html>`;
}
