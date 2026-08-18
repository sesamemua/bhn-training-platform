/* Render a chart with the real routing and label placement to a standalone
 * HTML file. The editor lives behind an admin login, so this is how the
 * geometry gets looked at without signing in to the app.
 *
 * Run: npx tsx scripts/render-flowchart-preview.ts [outfile]
 */
import { writeFileSync } from "node:fs";
import { routeEdge, toPath } from "../src/lib/flowchart/route";
import { labelSize, placeLabels } from "../src/lib/flowchart/labels";
import { fieldsOf } from "../src/lib/flowchart/form";
import { TRAINING_WEEK_FLOW } from "../src/lib/flowchart/seed";

const PANE = 944; // the pane width the editor measures on a desktop layout
const doc = TRAINING_WEEK_FLOW;
const content = Math.max(620, ...doc.nodes.map((n) => n.x + n.w + 60));
const W = Math.max(content, PANE);
const H = Math.max(560, ...doc.nodes.map((n) => n.y + n.h + 60));

const byId = new Map(doc.nodes.map((n) => [n.id, n]));
const laid = doc.edges.flatMap((e) => {
  const a = byId.get(e.from), b = byId.get(e.to);
  if (!a || !b) return [];
  const text = e.label ?? (e.when ? `${e.when.field} ${e.when.op}${e.when.value ? " " + e.when.value : ""}` : "");
  return [{ e, points: routeEdge(a, b, doc.nodes), text }];
});
const spots = placeLabels(laid.map((l) => ({ points: l.points, text: l.text })), doc.nodes, { w: W, h: H });

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

const arrows = laid.map((l, i) => {
  const spot = spots[i];
  const size = labelSize(l.text);
  const away = Math.hypot(spot.x - spot.anchorX, spot.y - spot.anchorY);
  const label = !l.text ? "" : `
    ${away > 26 ? `<line x1="${spot.anchorX}" y1="${spot.anchorY}" x2="${spot.x}" y2="${spot.y}" stroke="#7cc4ff" stroke-width="1" opacity="0.35"/>` : ""}
    <rect x="${spot.x - size.w / 2}" y="${spot.y - size.h / 2}" rx="3" width="${size.w}" height="${size.h}" fill="#0f1720"/>
    <text x="${spot.x}" y="${spot.y}" dominant-baseline="middle" text-anchor="middle" fill="#7cc4ff" font-size="10" font-weight="600">${esc(l.text)}</text>`;
  return `<path d="${toPath(l.points)}" fill="none" stroke="#4d9ede" stroke-width="1.5"${l.e.when ? ' stroke-dasharray="5 4"' : ""} marker-end="url(#a)" opacity="0.75"/>${label}`;
}).join("\n");

const boxes = doc.nodes.map((n) => {
  const fill = n.kind === "decision" ? "#3a2f14" : n.kind === "question" ? "#122436" : "#141b23";
  const stroke = n.kind === "decision" ? "#b8860b" : n.kind === "question" ? "#4d9ede" : "#2b3540";
  const rx = n.kind === "start" || n.kind === "end" ? n.h / 2 : 6;
  const count = fieldsOf(n).length;
  return `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${rx}" fill="${fill}" stroke="${stroke}"/>
    <text x="${n.x + n.w / 2}" y="${n.y + n.h / 2 - (n.actor || count > 1 ? 6 : 0)}" text-anchor="middle" dominant-baseline="middle" fill="#e6edf3" font-size="12" font-weight="600">${esc(n.text)}</text>
    ${n.actor ? `<text x="${n.x + n.w / 2}" y="${n.y + n.h / 2 + 10}" text-anchor="middle" fill="#8b98a5" font-size="10">${esc(n.actor)}</text>` : ""}
    ${!n.actor && count > 1 ? `<text x="${n.x + n.w / 2}" y="${n.y + n.h / 2 + 10}" text-anchor="middle" fill="#4d9ede" font-size="10">${count} questions</text>` : ""}`;
}).join("\n");

const html = `<!doctype html><meta charset="utf-8"><title>Flow chart geometry</title>
<body style="margin:0;background:#0b1017;font-family:system-ui">
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#4d9ede"/></marker></defs>
<rect width="${W}" height="${H}" fill="#0b1017"/>
${arrows}
${boxes}
</svg></body>`;

const out = process.argv[2] ?? "flowchart-preview.html";
writeFileSync(out, html);
console.log(`${out}  canvas ${W}x${H}, ${laid.filter((l) => l.text).length} labels`);
