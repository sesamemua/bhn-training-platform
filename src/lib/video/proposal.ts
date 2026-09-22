/**
 * The equipment proposal: the four things the shoot rents or hires —
 * camera, lens, lighting, sound — and the quotes that were turned down
 * to arrive at them.
 *
 * WHY THIS IS SEPARATE FROM production-cost.ts. That module is the whole
 * budget, mileage and lunches included, and it is the page. This is the
 * one-page argument for a reader who approves the spend and reads nothing
 * else: what we are buying, what it costs, and what it would have cost
 * the obvious way.
 *
 * Nothing here restates a figure. The four sections are derived from the
 * cost groups, so a change on the page moves the PDF with it, and the
 * test holds the two together. Only the turned-down quotes are literals,
 * because they exist nowhere else in the codebase — each is read off the
 * vendor's own document and carries its reference so it can be checked.
 *
 * Amounts are CENTS throughout, as in production-cost.ts.
 */
import { COST_GROUPS, HST, cad, groupTotal, kept, subtotal, type CostGroup } from "./production-cost";

export interface ProposalLine {
  label: string;
  note?: string;
  /** Pre-tax, cents. */
  amount: number;
}

export interface ProposalSection {
  key: "camera" | "lens" | "sound" | "lighting";
  title: string;
  vendor: string;
  lines: ProposalLine[];
  /** Pre-tax, tax and all-in, cents. */
  pre: number;
  tax: number;
  total: number;
}

const groupBy = (key: string): CostGroup => {
  const group = COST_GROUPS.find((g) => g.key === key);
  if (!group) throw new Error(`No cost group "${key}" — production-cost.ts changed shape.`);
  return group;
};

/** A whole cost group as one proposal section. */
function wholeGroup(group: CostGroup, key: ProposalSection["key"], title: string): ProposalSection {
  return {
    key, title, vendor: group.vendor,
    lines: kept(group).map((l) => ({ label: l.label, note: l.note, amount: l.amount })),
    pre: subtotal(group), tax: group.tax, total: groupTotal(group),
  };
}

/**
 * Part of a group as its own section.
 *
 * CamArt quotes sound and lighting on one document, and the reader wants
 * them apart — the whole point of the comparison is that the lighting
 * came almost free with the sound. Tax is recomputed on the slice at the
 * same rate rather than apportioned, which is what the vendor would have
 * charged had the two been quoted separately; the test checks the slices
 * still add back to the group.
 */
function sliceOf(group: CostGroup, key: ProposalSection["key"], title: string, labels: string[]): ProposalSection {
  const lines = kept(group).filter((l) => labels.includes(l.label));
  if (lines.length !== labels.length) throw new Error(`${key}: expected ${labels.length} lines, found ${lines.length}.`);
  const pre = lines.reduce((s, l) => s + l.amount, 0);
  const tax = Math.round(pre * HST);
  return {
    key, title, vendor: group.vendor,
    lines: lines.map((l) => ({ label: l.label, note: l.note, amount: l.amount })),
    pre, tax, total: pre + tax,
  };
}

const camera = groupBy("camera");
const lens = groupBy("lens");
const sound = groupBy("sound");

export const SOUND_LABELS = ["Sound mixer — labour", "Sound gear — basic package"];
export const LIGHTING_LABELS = [
  "8 ft softbox diffusion, 6×6 frame, negative fill, stands, sandbags",
  "Aputure 600x for the softbox",
];

export const PROPOSAL_SECTIONS: ProposalSection[] = [
  wholeGroup(camera, "camera", "Camera package"),
  wholeGroup(lens, "lens", "Lens"),
  sliceOf(sound, "sound", "Sound", SOUND_LABELS),
  sliceOf(sound, "lighting", "Lighting", LIGHTING_LABELS),
];

/**
 * The one line on the CamArt quote that is neither sound nor lighting.
 * Carried so the four sections plus this reconcile to what CamArt is
 * actually paid, which is what the page shows.
 */
export const CAMART_INCIDENTAL = (() => {
  const line = kept(sound).find((l) => !SOUND_LABELS.includes(l.label) && !LIGHTING_LABELS.includes(l.label));
  if (!line) throw new Error("The CamArt incidental line is gone — check production-cost.ts.");
  return { label: line.label, amount: line.amount };
})();

export interface Alternative {
  key: string;
  /** What this quote would have covered. */
  covers: string;
  vendor: string;
  /** The vendor's own reference, so the number can be checked. */
  ref: string;
  pre: number;
  /** null where the vendor did not state tax. */
  tax: number | null;
  total: number;
  instead: string;
  why: string;
}

/**
 * The quotes that were not taken, read off the vendors' own documents.
 *
 * Kept as literals and never derived: they are the counterfactual, and if
 * the budget changes these must NOT follow it.
 */
export const ALTERNATIVES: Alternative[] = [
  {
    key: "sunbelt",
    covers: "Camera and lens together",
    vendor: "Sunbelt Rentals Film & TV (William F. White)",
    ref: "Contract 66047695, dated 10 Sep 2026",
    pre: 559500, tax: 72737, total: 632237,
    instead: "Camera from 2D House, and the lens rented on its own",
    why: "One contract for the whole camera order, at more than twice what the same kit costs split between two vendors. One line on it was worth keeping: the Caldwell Chameleon 75 mm anamorphic, which no other Toronto rental house carries. We rent that lens from them and nothing else.",
  },
  {
    key: "2dhouse-ge",
    covers: "Lighting (grip and electric)",
    vendor: "2D House Inc.",
    ref: "Quote 263435, dated 10 Sep 2026",
    pre: 78185, tax: 10164, total: 88349,
    instead: "The softbox, frame, negative fill and Aputure on the CamArt quote",
    why: "A full grip-and-electric order — 1200x light kit, butterfly frames, twelve stands, ten sandbags — for a sit-down interview in one office. The shoot needs one soft source and some negative fill, which the sound vendor already owns and brings.",
  },
  {
    key: "james-sound",
    covers: "Sound",
    vendor: "James, independent sound recordist",
    ref: "Quoted by text message, 17 Sep 2026",
    pre: 110000, tax: null, total: 110000,
    instead: "Sound mixer and gear on the CamArt quote",
    why: "$1,100 for sound alone, kit and labour included, tax not stated. CamArt's sound and lighting together come to the same $1,100 before tax — $900 for the mixer and gear, $200 for the softbox and the Aputure. The same money, and the lighting comes with it.",
  },
];

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

/** What is being asked for, and what the same four things would have cost. */
export const PROPOSAL_TOTALS = (() => {
  const sections = sum(PROPOSAL_SECTIONS.map((s) => s.total));
  const chosen = sections + CAMART_INCIDENTAL.amount;
  const alternative = sum(ALTERNATIVES.map((a) => a.total));
  return {
    pre: sum(PROPOSAL_SECTIONS.map((s) => s.pre)),
    tax: sum(PROPOSAL_SECTIONS.map((s) => s.tax)),
    /** Everything in this proposal, taxes in. */
    chosen,
    /** The three turned-down quotes added up. */
    alternative,
    /** What not taking them is worth. */
    saved: alternative - chosen,
  };
})();

/** One vendor's share of the proposal, for the "who gets paid" line. */
export const VENDOR_TOTALS = [
  { vendor: camera.vendor, total: groupTotal(camera) },
  { vendor: lens.vendor, total: groupTotal(lens) },
  { vendor: sound.vendor, total: groupTotal(sound) },
];

export { cad };
