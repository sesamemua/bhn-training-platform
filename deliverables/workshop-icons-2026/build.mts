import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import archiver from "archiver";
import { Download } from "lucide-react";
import { WORKSHOP_ICONS } from "../../src/components/training-week/WorkshopIcon";
import { SESSIONS } from "../../src/lib/training-week/schedule-2026";

const destination = "public/workshop-icons";
await mkdir(destination, { recursive: true });
assert.deepEqual(Object.keys(WORKSHOP_ICONS).sort(), SESSIONS.map((s) => s.slug).sort());
const escape = (text: string) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const cards: string[] = [];
const files: string[] = [];
const distinct = new Set<string>();
const download = renderToStaticMarkup(createElement(Download, { size: 16, "aria-hidden": true }));
for (const session of SESSIONS) {
  const { Icon, colour, symbol, asset } = WORKSHOP_ICONS[session.slug as keyof typeof WORKSHOP_ICONS];
  const svg = renderToStaticMarkup(createElement(Icon, { size: 512, strokeWidth: 2, color: colour, style: asset === "communication-chameleon" ? { color: colour } : undefined }));
  assert.match(svg, /viewBox="0 0 24 24"/);
  assert.ok(!svg.includes("<text"));
  distinct.add(svg);
  await writeFile(`${destination}/${asset}.svg`, svg);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const alpha = (await sharp(png).stats()).channels[3];
  assert.equal(alpha.min, 0); assert.equal(alpha.max, 255);
  await writeFile(`${destination}/${asset}.png`, png);
  files.push(`${asset}.svg`, `${asset}.png`);
  cards.push(`<article><div class="preview"><img src="${asset}.svg" alt="${escape(symbol)}" width="80" height="80"></div><h2>${escape(session.title)}</h2><div class="sizes" aria-label="Small-size previews">${[16, 24, 32].map((size) => `<img src="${asset}.svg" alt="" width="${size}" height="${size}">`).join("")}</div><div class="downloads"><a href="${asset}.svg" download>${download} SVG</a><a href="${asset}.png" download>${download} PNG</a></div></article>`);
}
assert.equal(distinct.size, SESSIONS.length);
await writeFile(`${destination}/index.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Training Week icons | BioHubNet</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f7f8;color:#172a30;font-family:Arial,sans-serif;letter-spacing:0}main{max-width:1100px;margin:auto;padding:36px 24px}header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:24px;flex-wrap:wrap}h1{font-size:26px;line-height:1.2;margin:0}header p{color:#4b626b;font-size:13px;margin:8px 0 0}.all{background:#075e68;color:white;padding:12px 16px;text-decoration:none;border-radius:6px;display:inline-flex;gap:8px;align-items:center}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}article{padding:24px;background:white;border-radius:8px;min-width:0}.preview{height:112px;display:flex;align-items:center;justify-content:center}h2{font-size:16px;line-height:1.4;min-height:45px;margin:12px 0;overflow-wrap:anywhere}.sizes{display:flex;gap:20px;align-items:center;height:44px}.downloads{display:flex;gap:20px;margin-top:20px}.downloads a{display:inline-flex;align-items:center;gap:6px;color:#075e68;font-size:13px;font-weight:bold;text-decoration:none}a:focus-visible{outline:3px solid #087da0;outline-offset:4px}a:hover{text-decoration:underline}footer{margin-top:24px;color:#4b626b;font-size:12px}@media(max-width:780px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:480px){main{padding:24px 16px}.grid{grid-template-columns:1fr}}
</style></head><body><main><header><div><h1>Training Week icons</h1><p>BioHubNet · October 26–28, 2026</p></div><a class="all" href="biohubnet-workshop-icons.zip" download>${download} Download all</a></header><div class="grid">${cards.join("")}</div><footer>SVG + transparent PNG, 512 × 512 · Lucide symbols (ISC licence) + custom BioHubNet chameleon</footer></main></body></html>`);
await writeFile(`${destination}/LICENSE.txt`, await readFile("node_modules/lucide-react/LICENSE", "utf8"));
files.push("index.html", "LICENSE.txt");
await new Promise<void>((resolve, reject) => {
  const output = createWriteStream(`${destination}/biohubnet-workshop-icons.zip`);
  const archive = archiver("zip", { zlib: { level: 9 } });
  output.on("close", resolve); output.on("error", reject); archive.on("error", reject);
  archive.pipe(output);
  for (const name of files) archive.file(`${destination}/${name}`, { name });
  void archive.finalize().catch(reject);
});
console.log(`${SESSIONS.length} distinct icons exported as SVG and transparent PNG; download gallery and ZIP ready.`);
