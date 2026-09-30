/**
 * Tent cards for the lunch table: one per dietary requirement, folded
 * from a letter sheet, so the kitchen's trays can be labelled "Halal",
 * "Nut allergy" and so on. Allergies print in red, with a red frame —
 * the card somebody must not miss. Each card names, small, the workshops
 * it is for, and nobody by name.
 *
 * Pure module: builds a standalone HTML page; the tab opens it and prints.
 */
import type { Entry } from "./catering";

export interface TentCard {
  label: string;
  allergy: boolean;
  workshops: string[];
}

/** Medical, not preference: an allergy, coeliac disease, anything needing an EpiPen. */
const ALLERGY = /allerg|coeliac|celiac|anaphyla|epi-?pen|\bnuts?\b|peanut|shellfish|sesame/i;
export const isAllergy = (label: string) => ALLERGY.test(label);

export function tentCards(entries: Entry[]): TentCard[] {
  const cards = new Map<string, TentCard>();
  const ordered = [...entries].sort((a, b) => a.start.localeCompare(b.start));
  for (const e of ordered) {
    const needs = [...e.dietary, ...(e.dietaryOther ? [e.dietaryOther] : [])];
    for (const raw of needs) {
      const label = raw.trim().replace(/\s+/g, " ").slice(0, 80);
      if (!label) continue;
      const k = label.toLowerCase();
      const card = cards.get(k) ?? { label, allergy: isAllergy(label), workshops: [] };
      if (!card.workshops.includes(e.workshop)) card.workshops.push(e.workshop);
      cards.set(k, card);
    }
  }
  return [...cards.values()].sort((a, b) => Number(b.allergy) - Number(a.allergy) || a.label.localeCompare(b.label));
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const size = (label: string) => (label.length <= 10 ? 96 : label.length <= 18 ? 72 : label.length <= 30 ? 54 : 36);

function face(c: TentCard, top: boolean): string {
  return `<div class="face${top ? " top" : ""}"><div class="frame"></div>
    ${c.allergy ? `<p class="kicker">Allergy</p>` : ""}
    <p class="label" style="font-size:${size(c.label)}pt">${esc(c.label)}</p>
    <p class="ws">${c.workshops.map(esc).join(" · ")}</p></div>`;
}

/**
 * Letter portrait, one card per sheet: fold across the middle and stand
 * it up. The top half is printed upside down so both sides read.
 */
export function tentCardsHtml(cards: TentCard[], title: string): string {
  const sheets = cards
    .map((c) => `<section class="sheet${c.allergy ? " allergy" : ""}">${face(c, true)}${face(c, false)}</section>`)
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page { size: letter portrait; margin: 0 }
* { box-sizing: border-box; margin: 0 }
body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact }
.sheet { width: 8.5in; height: 11in; display: flex; flex-direction: column; break-after: page; page-break-after: always; overflow: hidden }
.face { position: relative; height: 5.5in; padding: .6in .7in; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; gap: .15in }
.face.top { transform: rotate(180deg) }
.face:not(.top) { border-top: 1px dashed #aaa }
.frame { position: absolute; inset: .3in; border: 3px solid #222; border-radius: .12in }
.allergy .frame { border: .14in solid #c8102e }
.kicker { font-size: 18pt; font-weight: 800; letter-spacing: .25em; text-transform: uppercase }
.label { font-weight: 800; line-height: 1.05; overflow-wrap: anywhere }
.allergy .kicker, .allergy .label { color: #c8102e }
.ws { font-size: 10.5pt; color: #555; max-width: 6.5in }
.bar { font: 14px system-ui, sans-serif; padding: 12px 16px; background: #111; color: #fff; display: flex; gap: 12px; align-items: center; position: sticky; top: 0 }
.bar button { font: inherit; font-weight: 700; padding: 6px 14px; border-radius: 6px; border: 0; cursor: pointer }
@media screen { body { background: #ddd } .sheet { background: #fff; margin: .3in auto; box-shadow: 0 1px 6px rgba(0,0,0,.25) } }
@media print { .bar { display: none } }
</style></head><body>
<div class="bar"><button onclick="window.print()">Print</button><span>${cards.length} card${cards.length === 1 ? "" : "s"} · letter paper, portrait · fold on the dashed line</span></div>
${sheets || `<p style="padding:1in;font-size:18pt">No dietary requirements to print.</p>`}
<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 300); });</script>
</body></html>`;
}
