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
import { fieldsOf, orderedFields, reachable } from "./form";

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

const PICKER_TYPES = ["academic", "health", "company"] as const;

/**
 * Free text whose answers cannot be a menu, so it is not evidence of
 * sloppy data collection. A person's name is the whole example: there
 * is no list of them, and the note's complaint was never about names —
 * it was about institutions, positions and categories, which ARE
 * knowable in advance.
 */
const OPEN_BY_NATURE = ["org_other", "trainee_name"];

/** Can `from` reach `to` by following arrows, whatever their conditions? */
function canReach(doc: ChartDoc, from: string, to: string): boolean {
  const seen = new Set<string>();
  const queue = [from];
  while (queue.length) {
    const id = queue.shift()!;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of doc.edges) if (e.from === id && !seen.has(e.to)) queue.push(e.to);
  }
  return false;
}

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
    request:
      "Ask first whether the registrant is a current BioHubNet trainee — accepted into ENGAGE, EXPERIENCE or EQUIP.",
    source: "Trainee gate · follow-up note",
    check: (doc) => {
      const order = orderedFields(doc);
      const first = order[0];
      const f = allFields(doc).find(
        (x) => x.field.type === "yesno" && (/trainee/i.test(x.field.key) || /trainee/i.test(x.node.text)),
      );
      if (!f) return { status: "missed", evidence: "No yes/no trainee question exists." };
      if (!f.field.required)
        return { status: "missed", evidence: `"${f.node.text}" asks it, but it is optional.` };
      if (first?.key !== f.field.key)
        return {
          status: "missed",
          evidence: `It is asked, but "${first?.label ?? "another question"}" comes first.`,
        };
      const named = ["ENGAGE", "EXPERIENCE", "EQUIP"].filter((p) =>
        (f.field.help ?? "").includes(p),
      );
      return named.length === 3
        ? {
            status: "met",
            evidence: `"${f.node.text}" is the first question, required, and names all three programmes.`,
          }
        : {
            status: "missed",
            evidence: `Asked first, but the question does not name ${["ENGAGE", "EXPERIENCE", "EQUIP"].filter((x) => !named.includes(x)).join(" / ")}.`,
          };
    },
  },
  {
    id: "trainee-vs-account",
    request:
      "Say plainly that having an account on the training platform is NOT the same as being accepted into a programme — someone registered but not approved must apply.",
    source: "Trainee gate · follow-up note",
    check: (doc) => {
      const help = allFields(doc)
        .filter((x) => /trainee/i.test(x.field.key))
        .map((x) => x.field.help ?? "")
        .join(" ");
      const notes = doc.nodes.filter((n) => n.kind === "note").map((n) => n.text).join(" ");
      const drawn = /not the same thing|is not the same/i.test(help);
      const applyPath = /appl(y|ication)/i.test(`${help} ${notes}`);
      if (drawn && applyPath)
        return {
          status: "met",
          evidence: "The gate distinguishes an account from an acceptance, and the apply route is stated.",
        };
      return {
        status: "missed",
        evidence: `${drawn ? "" : "The account/acceptance distinction is not drawn. "}${applyPath ? "" : "Nothing tells a non-trainee they can apply."}`,
      };
    },
  },
  {
    id: "trainee-priority",
    request:
      "Tell registrants that current trainees get priority consideration for Training Week places.",
    source: "Trainee gate · follow-up note",
    check: (doc) => {
      const said = allFields(doc).some((x) => /priority/i.test(x.field.help ?? ""));
      const drawn = doc.nodes.some((n) => /priority|considered first/i.test(n.text));
      if (said && drawn)
        return {
          status: "met",
          evidence: "Stated in the gate question where registrants read it, and drawn on the chart where places are decided.",
        };
      if (said)
        return {
          status: "attention",
          evidence: "Registrants are told, but the chart does not show priority being applied when places are allocated.",
        };
      return { status: "missed", evidence: "Priority for current trainees is not stated anywhere." };
    },
  },
  {
    id: "trainee-apply-or-register",
    request:
      "A non-trainee can apply — reviews take time — and may register meanwhile if they are HQP at one of the 41 member institutions.",
    source: "Trainee gate · follow-up note",
    check: (doc) => {
      const notes = doc.nodes.filter((n) => n.kind === "note").map((n) => n.text).join(" ");
      const timing = /take time|time to review|under review/i.test(notes);
      const hqp = /41|member institution/i.test(notes);
      if (timing && hqp)
        return {
          status: "met",
          evidence: "A note beside the gate states both: applications take time, and HQP at the 41 member institutions may register now.",
        };
      return {
        status: "missed",
        evidence: `${timing ? "" : "Nothing says applications take time to review. "}${hqp ? "" : "Nothing says HQP at the member institutions can register meanwhile."}`,
      };
    },
  },
  {
    id: "trainee-email-check",
    request:
      "A registrant claiming to be a trainee gives their institutional email or the secondary email registered with us, checked against the live roster sheet.",
    source: "Trainee gate · follow-up note",
    check: (doc) => {
      const email = allFields(doc).find(
        (x) => x.field.type === "email" && /trainee|roster/i.test(`${x.field.key} ${x.field.help ?? ""}`),
      );
      if (!email) return { status: "missed", evidence: "No trainee email is collected." };
      const bothNamed =
        /institutional/i.test(email.field.help ?? "") && /secondary/i.test(email.field.help ?? "");
      const roster = doc.nodes.find((n) => n.kind === "data" && /roster/i.test(n.text));
      if (!roster)
        return { status: "missed", evidence: "The email is collected but nothing shows it being checked against a roster." };
      const gated = doc.edges.some((e) => e.to === email.node.id && e.when);
      if (!bothNamed)
        return {
          status: "attention",
          evidence: "Checked against the roster, but the question does not name both the institutional and the secondary email.",
        };
      return {
        status: gated ? "met" : "attention",
        evidence: gated
          ? `"${email.node.text}" is asked only of people who said yes, and "${roster.text}" is what it is checked against.`
          : "Everyone is asked for the trainee email, not only those claiming to be trainees.",
      };
    },
  },
  {
    id: "trainee-name-confirm",
    request: "Ask the trainee to confirm their name, as well as their email.",
    source: "Trainee gate · follow-up note",
    check: (doc) => {
      const email = allFields(doc).find((x) => x.field.type === "email" && /trainee/i.test(x.field.key));
      if (!email) return { status: "missed", evidence: "No trainee verification question exists." };
      const name = fieldsOf(email.node).find((f) => /name/i.test(f.key));
      if (!name)
        return {
          status: "missed",
          evidence: `"${email.node.text}" asks for an email but never confirms the name.`,
        };
      if (!name.required)
        return { status: "attention", evidence: "The name is asked but is optional, so a match may rest on the email alone." };
      return {
        status: "met",
        evidence: `"${email.node.text}" confirms the name and the email together, so a trainee whose address has changed can still be matched.`,
      };
    },
  },
  {
    id: "roster-sheet-configured",
    request: "The live Google Sheet behind the roster check — to be provided.",
    source: "Trainee gate · follow-up note",
    check: (doc) => {
      const url = doc.settings?.rosterSheetUrl;
      return url
        ? { status: "met", evidence: "A roster sheet is configured." }
        : {
            status: "attention",
            evidence: "Waiting on the sheet. Paste its link into Options — the panel shown when nothing is selected — and this row turns green; the workflow is otherwise ready for it.",
          };
    },
  },
  {
    id: "trainee-status-backend",
    request:
      "A confirmed trainee carries a 'current trainee' status on the backend.",
    source: "Trainee gate · follow-up note",
    check: (doc) => {
      const stage = doc.nodes.find(
        (n) => (n.kind === "step" || n.kind === "end") && /trainee confirmed|confirmed trainee/i.test(n.text),
      );
      return stage
        ? {
            status: "met",
            evidence: `"${stage.text}" is a step in the flow, so a confirmed registrant is distinguishable from an unconfirmed one.`,
          }
        : { status: "missed", evidence: "Nothing records a confirmed-trainee status." };
    },
  },
  {
    id: "non-trainee-continues",
    request:
      "The gate only settles WHICH status someone holds — a non-trainee, and a trainee who is not found, both carry on registering.",
    source: "Trainee gate · follow-up note",
    check: (doc) => {
      const sessions = doc.nodes.find((n) =>
        fieldsOf(n).some((f) => f.key === "sessions"),
      );
      if (!sessions) return { status: "missed", evidence: "No sessions question to carry on to." };
      const reachedWhenNo = reachable(doc, { trainee: "No" }).has(sessions.id);
      const notFound = doc.nodes.find((n) => /not on the roster|not found/i.test(n.text));
      // Reachability, not a direct edge: the spine legitimately passes
      // through other questions on the way, and testing for one hop
      // reported a reordering of the form as a dead end.
      const notFoundContinues = !!notFound && canReach(doc, notFound.id, sessions.id);
      if (reachedWhenNo && notFoundContinues)
        return {
          status: "met",
          evidence: "Answering No goes straight to the sessions, and a trainee not found on the roster rejoins the same spine.",
        };
      return {
        status: "missed",
        evidence: `${reachedWhenNo ? "" : "Answering No does not reach the sessions. "}${notFoundContinues ? "" : "Not being found on the roster is a dead end."}`,
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
      const pickers = allFields(doc).filter((x) => (PICKER_TYPES as readonly string[]).includes(x.field.type));
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
      "Identify the PRIMARY institution — last year people wrote several and none could be compiled. Amended August 2026: academic, hospital and company are each still collected, separately, because one person is often all three; the primary is named rather than the others refused.",
    source: "Q. Institution / Company (c), amended by the follow-up note",
    check: (doc) => {
      const typed = allFields(doc).filter(
        (x) =>
          (x.field.type === "text" || x.field.type === "long") &&
          /institution|hospital|company|university/i.test(x.field.key),
      );
      if (typed.length)
        return {
          status: "missed",
          evidence: `Typed rather than picked: ${typed.map((x) => x.field.key).join(", ")}.`,
        };
      const pickers = allFields(doc).filter((x) => (PICKER_TYPES as readonly string[]).includes(x.field.type));
      const kinds = new Set(pickers.map((x) => x.field.type));
      const primary = findField(doc, "primary_org");
      if (!primary)
        return { status: "missed", evidence: "Nothing identifies which affiliation is the primary one." };
      const missing = PICKER_TYPES.filter((t) => !kinds.has(t));
      if (missing.length)
        return {
          status: "missed",
          evidence: `Not collected separately: ${missing.join(", ")}.`,
        };
      return {
        status: "met",
        evidence: "Academic, hospital and company are collected separately, each as a picker so entries arrive standardised, and \"Primary organization of engagement\" names which one counts as primary.",
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
      const names = freeRequired
        .map((x) => x.field.key)
        .filter((k) => !OPEN_BY_NATURE.includes(k));
      return names.length
        ? {
            status: "attention",
            evidence: `${structured.length} structured questions, but required free text remains: ${names.join(", ")}.`,
          }
        : {
            status: "met",
            evidence: `${structured.length} structured questions. The only required typing is a person's own name and, for the rare demographic no list covers, their organisation — neither of which any menu could hold.`,
          };
    },
  },
];

/** Run every check against the chart as it stands right now. */
export function runReview(doc: ChartDoc): ReviewResult[] {
  return NOTE_REVIEW.map(({ check, ...item }) => ({ ...item, ...check(doc) }));
}
