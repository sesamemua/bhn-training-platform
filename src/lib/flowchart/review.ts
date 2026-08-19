/**
 * The coordinator's 2026 registration note, as living checks.
 *
 * Each entry is one request from the note, summarised in its own words,
 * paired with a test that runs against the CURRENT chart — not against
 * the chart as it stood when the note was answered. People rearrange
 * this workflow freely, so a review that was written once and stored
 * would drift into fiction the first time someone edited a box. These
 * re-measure on every change instead; there is nothing to comment on
 * and nothing to go stale.
 *
 * Pure module: no React, no I/O, so every check is testable directly.
 */
import type { ChartDoc, FieldDef, FlowNode } from "./types";
import { fieldsOf } from "./form";

export type ReviewStatus = "met" | "missed" | "attention" | "out-of-scope";

export interface ReviewItem {
  id: string;
  /** The request, close to the note's own words. */
  request: string;
  /** Where in the note it comes from. */
  source: string;
  check: (doc: ChartDoc) => { status: ReviewStatus; evidence: string };
}

export interface ReviewResult extends Omit<ReviewItem, "check"> {
  status: ReviewStatus;
  evidence: string;
}

// ── shared readings of the chart ─────────────────────────────────────

const allFields = (doc: ChartDoc): { node: FlowNode; field: FieldDef }[] =>
  doc.nodes.flatMap((node) => fieldsOf(node).map((field) => ({ node, field })));

const findField = (doc: ChartDoc, key: string) =>
  allFields(doc).find((f) => f.field.key === key);

const mentions = (doc: ChartDoc, re: RegExp) =>
  doc.nodes.filter(
    (n) =>
      re.test(n.text) ||
      fieldsOf(n).some(
        (f) => re.test(f.key) || re.test(f.help ?? "") || (f.options ?? []).some((o) => re.test(o)),
      ),
  );

const PICKER_TYPES = ["academic", "health", "company"];

// ── the note, item by item ───────────────────────────────────────────

export const NOTE_REVIEW: ReviewItem[] = [
  {
    id: "training-week-only",
    request:
      "Separate Training Week and the Annual Symposium — one registration space for two events confused the data and inflated symposium counts.",
    source: "Last Year's Collection · Request for Change",
    check: (doc) => {
      const hits = mentions(doc, /symposium/i);
      return hits.length
        ? {
            status: "missed",
            evidence: `The symposium is mentioned in: ${hits.map((n) => `"${n.text}"`).join(", ")}. This workflow must register Training Week only.`,
          }
        : {
            status: "met",
            evidence: "No box, question or option mentions the symposium. This workflow registers Training Week only; the symposium registers separately.",
          };
    },
  },
  {
    id: "trainee-gate",
    request: "Ask \"Are you a current BioHubNet trainee?\" (Y/N) — Training Week is intended for HQP.",
    source: "2026 Potential Questions",
    check: (doc) => {
      const f = allFields(doc).find(
        (x) => x.field.type === "yesno" && (/trainee/i.test(x.field.key) || /trainee/i.test(x.field.help ?? "")),
      );
      if (!f) return { status: "missed", evidence: "No yes/no trainee question exists." };
      if (!f.field.required)
        return { status: "missed", evidence: `"${f.node.text}" asks it, but it is optional.` };
      return {
        status: "met",
        evidence: `Asked in "${f.node.text}", required, and the trainee-only questions branch off its answer.`,
      };
    },
  },
  {
    id: "drop-institution-free-text",
    request:
      "Remove the free-text \"Institution / Company\" question entirely — venture students named their company instead of their institution, which inflated industry figures.",
    source: "Q. Institution / Company (a)",
    check: (doc) => {
      const free = allFields(doc).filter(
        (x) =>
          (x.field.type === "text" || x.field.type === "long") &&
          /institution|company/i.test(x.field.key),
      );
      return free.length
        ? {
            status: "missed",
            evidence: `Free-text field(s) still ask for it: ${free.map((x) => x.field.key).join(", ")}.`,
          }
        : {
            status: "met",
            evidence: "No free-text institution or company field remains. Classification is by position and organisation type instead.",
          };
    },
  },
  {
    id: "institution-dropdown",
    request:
      "Institutions arrive as a drop-down pick, not typing — last year University of Toronto was written more than 20 ways.",
    source: "Q. Institution / Company (b)",
    check: (doc) => {
      const pickers = allFields(doc).filter((x) => PICKER_TYPES.includes(x.field.type));
      return pickers.length
        ? {
            status: "met",
            evidence: `${pickers.length} picker question(s): ${pickers.map((x) => `"${x.node.text}"`).join(", ")}. Entries arrive pre-standardised.`,
          }
        : { status: "missed", evidence: "No institution picker exists — names would arrive as typing again." };
    },
  },
  {
    id: "one-primary-institution",
    request:
      "Collect ONE institution, identified as the primary — multiple entries per person could not be compiled.",
    source: "Q. Institution / Company (c)",
    check: (doc) => {
      const repeatable = allFields(doc).filter((x) => x.field.type === "affiliation");
      if (repeatable.length)
        return {
          status: "missed",
          evidence: "A repeatable affiliations question still allows several entries per person.",
        };
      const pickers = doc.nodes.filter((n) =>
        fieldsOf(n).some((f) => PICKER_TYPES.includes(f.type) || f.key === "org_other"),
      );
      const unbranched = pickers.filter((n) =>
        doc.edges.filter((e) => e.to === n.id).every((e) => !e.when),
      );
      if (!pickers.length)
        return { status: "missed", evidence: "No primary-institution question exists." };
      if (unbranched.length)
        return {
          status: "attention",
          evidence: `Every person can reach ${unbranched.map((n) => `"${n.text}"`).join(", ")} — more than one institution question may be answered.`,
        };
      const primary = pickers.every((n) => /primary/i.test(n.text));
      return primary
        ? {
            status: "met",
            evidence: "Each person meets exactly one institution question — chosen by their organisation type — and it asks for the primary.",
          }
        : {
            status: "attention",
            evidence: `The branching guarantees one answer, but not every question says "primary": ${pickers.map((n) => `"${n.text}"`).join(", ")}.`,
          };
    },
  },
  {
    id: "category-replaced",
    request:
      "Retire the old three-way Category (Industry / Academia / Government). Government was 1 registrant in 500 yet a third of the menu.",
    source: "Q. Category (a)",
    check: (doc) => {
      const old = allFields(doc).find(
        (x) =>
          x.field.type === "choice" &&
          (x.field.options ?? []).includes("Industry") &&
          (x.field.options ?? []).includes("Academia"),
      );
      if (old)
        return {
          status: "missed",
          evidence: `The old Category menu still exists on "${old.node.text}".`,
        };
      const org = findField(doc, "primary_org");
      return org
        ? {
            status: "met",
            evidence: `Replaced by "Primary organization of engagement" with ${org.field.options?.length ?? 0} types and an Other.`,
          }
        : { status: "missed", evidence: "The old menu is gone but nothing replaced it." };
    },
  },
  {
    id: "definitions-in-question",
    request:
      "Put the definitions in the questions themselves: Industry Professional = a member of a private company, not a student; Academia = faculty, staff and students. Label it \"Industry Professional\".",
    source: "Q. Category (b)",
    check: (doc) => {
      const pos = findField(doc, "primary_position");
      const org = findField(doc, "primary_org");
      const help = `${pos?.field.help ?? ""} ${org?.field.help ?? ""}`;
      const labelled = (pos?.field.options ?? []).includes("Industry Professional");
      const industryDefined = /private company/i.test(help) && /not a student/i.test(help);
      const academiaDefined = /faculty,? staff and students/i.test(help);
      if (labelled && industryDefined && academiaDefined)
        return {
          status: "met",
          evidence: "Both definitions sit under the questions, and the option is labelled \"Industry Professional\".",
        };
      const missing = [
        !labelled && "the \"Industry Professional\" label",
        !industryDefined && "the industry definition",
        !academiaDefined && "the academia definition",
      ].filter(Boolean);
      return { status: "missed", evidence: `Missing: ${missing.join(", ")}.` };
    },
  },
  {
    id: "hospitals-included",
    request:
      "Include hospitals — laboratory technicians working at hospitals fit neither Academia nor Industry.",
    source: "Q. Category (c)",
    check: (doc) => {
      const org = findField(doc, "primary_org");
      const pos = findField(doc, "primary_position");
      const orgHas = (org?.field.options ?? []).some((o) => /hospital|healthcare/i.test(o));
      const posHas = (pos?.field.options ?? []).some((o) => /laboratory technician/i.test(o));
      return orgHas && posHas
        ? {
            status: "met",
            evidence: "\"Healthcare / Hospital\" is an organisation type and \"Laboratory Technician / Research Associate\" a position.",
          }
        : {
            status: "missed",
            evidence: `${orgHas ? "" : "No hospital organisation type. "}${posHas ? "" : "No laboratory-technician position."}`,
          };
    },
  },
  {
    id: "position-dropdown",
    request:
      "Position title as a drop-down of predetermined positions with an Other — free text produced 11 spellings of PhD and 13 of postdoc.",
    source: "Q. Position Title",
    check: (doc) => {
      const pos = findField(doc, "primary_position");
      const freeTitle = allFields(doc).find(
        (x) => (x.field.type === "text" || x.field.type === "long") && /position|title/i.test(x.field.key),
      );
      if (freeTitle)
        return { status: "missed", evidence: `"${freeTitle.field.key}" still takes the title as typing.` };
      if (!pos || pos.field.type !== "choice")
        return { status: "missed", evidence: "No position drop-down exists." };
      return (pos.field.options ?? []).includes("Other")
        ? {
            status: "met",
            evidence: `A drop-down of ${pos.field.options!.length} positions from the note's list, with Other.`,
          }
        : { status: "missed", evidence: "The drop-down exists but has no Other." };
    },
  },
  {
    id: "expertise-clarify",
    request:
      "\"Area of expertise\" was collected for last year's symposium discussions — obtain clarification on whether it is still useful for 2026.",
    source: "Q. Area of Expertise",
    check: (doc) => {
      const f = findField(doc, "expertise");
      const flagged = doc.nodes.some((n) => n.kind === "note" && /area of expertise/i.test(n.text));
      return {
        status: "attention",
        evidence: `${f ? "Still asked" : "Currently dropped"}${flagged ? ", and flagged on the chart as awaiting the coordinator's decision" : " — but nothing on the chart records that the question is open"}. The note asks for a decision, not a default.`,
      };
    },
  },
  {
    id: "symposium-participant-q",
    request:
      "Proposed Q3 — Symposium Participant (Attendee / Speaker / Panelist / Sponsor / Exhibitor / Organizer).",
    source: "2026 Potential Questions · Q3",
    check: (doc) => {
      const crept = allFields(doc).find((x) =>
        (x.field.options ?? []).includes("Speaker") && (x.field.options ?? []).includes("Exhibitor"),
      );
      return crept
        ? { status: "missed", evidence: `A symposium-participant question crept into "${crept.node.text}".` }
        : {
            status: "out-of-scope",
            evidence: "Belongs to the symposium's own registration, which this workflow deliberately no longer covers.",
          };
    },
  },
  {
    id: "relevant-questions",
    request:
      "Speak to the appropriate demographic with relevant questions — nobody should answer questions that are not about them.",
    source: "Purpose · 3",
    check: (doc) => {
      const branched = doc.edges.filter((e) => e.when).length;
      return branched >= 4
        ? {
            status: "met",
            evidence: `${branched} conditioned arrows: trainee questions only for trainees, and the institution question matches the organisation type given.`,
          }
        : {
            status: "attention",
            evidence: `Only ${branched} conditioned arrow(s) — most people see most questions.`,
          };
    },
  },
  {
    id: "standardised-data",
    request:
      "Make the data easy to compile by standardising what arrives — dropdowns over typing wherever the answers are knowable in advance.",
    source: "Purpose · 1 & 4",
    check: (doc) => {
      const fields = allFields(doc);
      const freeRequired = fields.filter(
        (x) => (x.field.type === "text" || x.field.type === "long") && x.field.required,
      );
      const structured = fields.filter((x) => x.field.type !== "text" && x.field.type !== "long");
      const names = freeRequired.map((x) => x.field.key).filter((k) => k !== "org_other");
      return names.length
        ? {
            status: "attention",
            evidence: `${structured.length} structured questions, but required free text remains: ${names.join(", ")}.`,
          }
        : {
            status: "met",
            evidence: `${structured.length} structured questions; the only required typing is the org name for the rare demographic no list covers.`,
          };
    },
  },
];

/** Run every check against the chart as it stands right now. */
export function runReview(doc: ChartDoc): ReviewResult[] {
  return NOTE_REVIEW.map(({ check, ...item }) => ({ ...item, ...check(doc) }));
}
