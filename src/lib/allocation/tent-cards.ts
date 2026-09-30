/**
 * Tent cards for the lunch table: they label the FOOD, not the people.
 *
 * A diet names the platter that meets it — "Halal", "Vegetarian". An
 * allergy or intolerance becomes a warning on the platter that has it —
 * "Contains kiwi" on the fruit, "Contains lactose" on the milk and the
 * yogurt — printed in red with a red frame, the card nobody must miss.
 * What people wrote under "Other" is read for the same words; anything
 * that cannot be turned into a card is listed on the page to deal with
 * by hand, never dropped. Each card names, small, the workshops it is
 * for, and nobody by name.
 *
 * Pure module: builds a standalone HTML page; the tab opens it and prints.
 */
import type { Entry } from "./catering";

export interface TentCard {
  /** The big word: "Halal", or for a warning what the dish contains: "Kiwi". */
  label: string;
  /** A warning ("Contains …"), printed in red. */
  contains: boolean;
  workshops: string[];
}

export interface TentCardSet {
  cards: TentCard[];
  /** Requirements typed under "Other" that are not a card — to read by hand. */
  byHand: { text: string; workshop: string }[];
}

const DIETS: [RegExp, string][] = [
  [/\bvegan\b/i, "Vegan"],
  [/\bvegetarian\b/i, "Vegetarian"],
  [/\bhalal\b/i, "Halal"],
  [/\bkosher\b/i, "Kosher"],
];
const WARNINGS: [RegExp, string][] = [
  [/gluten|coeliac|celiac/i, "Gluten"],
  [/lactose|dairy|\bmilk\b/i, "Lactose"],
  [/peanut/i, "Peanuts"],
  [/\btree ?nuts?\b|\bnuts?\b/i, "Nuts"],
  [/shellfish|shrimp|prawn|crab|lobster/i, "Shellfish"],
  [/sesame/i, "Sesame"],
];
/** Identifies a card across prints: the same words, the same kind. */
export const cardKey = (c: { label: string; contains: boolean }) => `${c.contains ? "contains" : "diet"}:${c.label.toLowerCase()}`;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The cards one requirement asks for; empty when it cannot be read. */
export function cardsFor(need: string): { label: string; contains: boolean }[] {
  const text = need.trim();
  const out: { label: string; contains: boolean }[] = [];
  for (const [re, label] of DIETS) if (re.test(text)) out.push({ label, contains: false });
  for (const [re, label] of WARNINGS) if (re.test(text)) out.push({ label, contains: true });
  if (!out.some((c) => c.contains)) {
    // "Allergic to kiwi", "kiwi allergy", "intolerant to eggs".
    const m = text.match(/(?:allergic|allergy|intoleran\w*)\s+(?:to\s+)?([a-z][a-z ,&/-]{1,40})/i)
      ?? text.match(/([a-z][a-z -]{1,30}?)\s+(?:allergy|intolerance)/i);
    const what = m?.[1]?.trim().replace(/[.,;]+$/, "");
    if (what && !/^(an?|the|some|food|foods|severe|mild)$/i.test(what)) out.push({ label: cap(what), contains: true });
  }
  return out;
}

export function tentCards(entries: Entry[]): TentCardSet {
  const cards = new Map<string, TentCard>();
  const byHand: TentCardSet["byHand"] = [];
  const ordered = [...entries].sort((a, b) => a.start.localeCompare(b.start));
  for (const e of ordered) {
    const needs = [...e.dietary, ...(e.dietaryOther ? [e.dietaryOther] : [])];
    for (const need of needs) {
      const found = cardsFor(need);
      if (!found.length) {
        if (!byHand.some((b) => b.text === need && b.workshop === e.workshop)) byHand.push({ text: need, workshop: e.workshop });
        continue;
      }
      for (const f of found) {
        const k = cardKey(f);
        const card = cards.get(k) ?? { ...f, workshops: [] };
        if (!card.workshops.includes(e.workshop)) card.workshops.push(e.workshop);
        cards.set(k, card);
      }
    }
  }
  return {
    cards: [...cards.values()].sort((a, b) => Number(b.contains) - Number(a.contains) || a.label.localeCompare(b.label)),
    byHand,
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const size = (label: string) => (label.length <= 10 ? 96 : label.length <= 18 ? 72 : label.length <= 30 ? 54 : 36);

function face(c: TentCard, top: boolean): string {
  return `<div class="face${top ? " top" : ""}"><div class="frame"></div>
    ${c.contains ? `<p class="kicker">Contains</p>` : ""}
    <p class="label" style="font-size:${size(c.label)}pt">${esc(c.label)}</p>
    <p class="ws">${c.workshops.map(esc).join(" · ")}</p></div>`;
}

/**
 * Letter portrait, one card per sheet: fold across the middle and stand
 * it up. The top half is printed upside down so both sides read.
 */
export function tentCardsHtml({ cards, byHand }: TentCardSet, title: string): string {
  const sheets = cards
    .map((c) => `<section class="sheet${c.contains ? " warn" : ""}">${face(c, true)}${face(c, false)}</section>`)
    .join("\n");
  const note = byHand.length
    ? `<div class="hand"><strong>Not made into a card — read these and label by hand:</strong><ul>${byHand
        .map((b) => `<li>${esc(b.text)} <span>(${esc(b.workshop)})</span></li>`).join("")}</ul></div>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page { size: letter portrait; margin: 0 }
* { box-sizing: border-box; margin: 0 }
body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact }
.sheet { width: 8.5in; height: 11in; display: flex; flex-direction: column; break-after: page; page-break-after: always; overflow: hidden }
.face { position: relative; height: 5.5in; padding: .6in .7in; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; gap: .15in }
.face.top { transform: rotate(180deg) }
.face:not(.top) { border-top: 1px dashed #aaa }
.frame { position: absolute; inset: .3in; border: 3px solid #222; border-radius: .12in }
.warn .frame { border: .14in solid #c8102e }
.kicker { font-size: 18pt; font-weight: 800; letter-spacing: .25em; text-transform: uppercase }
.label { font-weight: 800; line-height: 1.05; overflow-wrap: anywhere }
.warn .kicker, .warn .label { color: #c8102e }
.ws { font-size: 10.5pt; color: #555; max-width: 6.5in }
.bar { font: 14px system-ui, sans-serif; padding: 12px 16px; background: #111; color: #fff; display: flex; gap: 12px; align-items: center; position: sticky; top: 0 }
.bar button { font: inherit; font-weight: 700; padding: 6px 14px; border-radius: 6px; border: 0; cursor: pointer }
@media screen { body { background: #ddd } .sheet { background: #fff; margin: .3in auto; box-shadow: 0 1px 6px rgba(0,0,0,.25) } }
.hand { font: 14px system-ui, sans-serif; background: #fff4e5; color: #5a3b00; padding: 12px 16px; border-bottom: 1px solid #f0c27a }
.hand ul { margin: 6px 0 0 18px; padding: 0 } .hand span { color: #8a6a2a }
@media print { .bar, .hand { display: none } }
</style></head><body>
<div class="bar"><button onclick="window.print()">Print</button><span>${cards.length} card${cards.length === 1 ? "" : "s"} · letter paper, portrait · fold on the dashed line</span></div>
${note}
${sheets || `<p style="padding:1in;font-size:18pt">No dietary requirements to make cards for.</p>`}
<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 300); });</script>
</body></html>`;
}
