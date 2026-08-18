/**
 * The Training Week registration flow, as a starting chart.
 *
 * Laid out as ONE COLUMN, top to bottom. Registration is linear — you
 * answer something, then the next thing — so a chart that sprawls sideways
 * misrepresents it and forces horizontal scrolling to read something that
 * only ever moves in one direction. A branch steps one column right and
 * rejoins; that is the only sideways movement that carries meaning.
 *
 * Questions are GROUPED: one box carries a whole step ("about you", "your
 * affiliations") rather than one box per input. Sixteen inputs as sixteen
 * boxes is a wall; as six groups it reads as a form.
 */
import type { ChartDoc } from "./types";

const MAIN = 60;   // the spine every step sits on
const SIDE = 420;  // where a branch steps out to, and rejoins from
const W = 250;
const TOP = 34;    // clear air above the first box
const GAP = 54;    // between one step and the next

/**
 * The lane gap is 110px, not the 30 it started at. A branch sitting almost
 * against the spine reads as part of it, and left the arrow between them
 * no room to be seen — the two columns have to look like two columns.
 */

/** Vertical cursor, so spacing stays even however the boxes change. */
let cursor = TOP;
const at = (h: number, gap = GAP) => {
  const top = cursor;
  cursor += h + gap;
  return top;
};

export const TRAINING_WEEK_FLOW: ChartDoc = (() => {
  cursor = TOP;

  // Taller than the other pills: a start node carries a label AND an
  // actor, and 48px put both lines hard against the rounded ends.
  const n1 = { id: "n1", kind: "start" as const, x: MAIN, y: at(66), w: W, h: 66,
    text: "Registration opens", actor: "Coordinator" };

  const n2 = { id: "n2", kind: "question" as const, x: MAIN, y: at(78), w: W, h: 78,
    text: "Choose your sessions",
    field: { key: "sessions", type: "multi" as const, required: true,
      help: "Pick the ones you want to attend.",
      options: [
        "Mon 26 · CCRM tour + Lunch & Learn",
        "Mon 26 · Catalent tour + Lunch & Learn",
        "Mon 26 · CL3 workshop",
        "Tue 27 · Communication Chameleon (1 PM)",
        "Tue 27 · Negotiation Skills (1 PM)",
        "Wed 28 · Innovation showcase",
      ] } };

  // The limits on that pick, as their own box: what the week can hold,
  // and which sessions run against each other. Drawn beside the question
  // rather than buried in its settings, because "three, and the Tuesday
  // pair clash" is part of the process a reader needs to see.
  const n2r = { id: "n2r", kind: "rule" as const, x: SIDE, y: n2.y, w: W, h: 84,
    text: "Up to 3 sessions · clashes flagged",
    limit: {
      field: "sessions",
      max: 3,
      clashes: [
        {
          label: "Tuesday 1 PM",
          options: [
            "Tue 27 · Communication Chameleon (1 PM)",
            "Tue 27 · Negotiation Skills (1 PM)",
          ],
        },
      ],
    } };

  const n3 = { id: "n3", kind: "question" as const, x: MAIN, y: at(86), w: W, h: 86,
    text: "About you",
    fields: [
      { key: "contact", type: "contact" as const, required: true },
      { key: "position_title", type: "text" as const, required: true },
      { key: "linkedin", type: "text" as const, help: "Optional." },
      { key: "category", type: "choice" as const, required: true,
        options: ["Industry", "Academia", "Government", "Other"] },
    ] };

  const n4 = { id: "n4", kind: "question" as const, x: MAIN, y: at(86), w: W, h: 86,
    text: "Your affiliations",
    // Repeatable on purpose: one person can be a PhD student, a clinician
    // and a founder at once, and a single box loses two of them.
    fields: [
      { key: "academic", type: "academic" as const, help: "Leave blank if none." },
      { key: "health", type: "health" as const, help: "Leave blank if none." },
      { key: "company", type: "company" as const, help: "Leave blank if none." },
    ] };

  const n5 = { id: "n5", kind: "question" as const, x: MAIN, y: at(86), w: W, h: 86,
    text: "Your work",
    fields: [
      { key: "expertise", type: "multi" as const, required: true,
        options: ["R & D", "QA/QC", "Manufacturing", "Clinical Operations",
                  "Regulatory Affairs", "Medical Affairs", "Business Development", "Other"] },
      { key: "trainee", type: "yesno" as const, required: true },
    ] };

  const n6 = { id: "n6", kind: "question" as const, x: SIDE, y: at(86), w: W, h: 86,
    text: "Trainee details",
    fields: [
      { key: "trainee_status", type: "choice" as const,
        options: ["Master's Student", "PhD Student", "Post-doctoral Fellow",
                  "Research Associate", "Laboratory Technician", "Other"] },
      { key: "bhn_programs", type: "multi" as const,
        options: ["ENGAGE", "EXPERIENCE", "EQUIP"] },
      { key: "travel_origin", type: "text" as const,
        help: "City or town you would travel from, if you need support. Subject to approval." },
    ] };

  const n7 = { id: "n7", kind: "question" as const, x: MAIN, y: at(86), w: W, h: 86,
    text: "Before you finish",
    fields: [
      { key: "dietary", type: "text" as const, help: "Dietary requirements or allergies. Blank if none." },
      { key: "newsletter_optin", type: "yesno" as const },
      { key: "media_consent", type: "yesno" as const, required: true,
        help: "BioHubNet may capture photographs and video and use them for promotional purposes." },
    ] };

  const n8 = { id: "n8", kind: "decision" as const, x: MAIN, y: at(74), w: W, h: 74,
    text: "Any chosen session full?" };
  const n9 = { id: "n9", kind: "step" as const, x: SIDE, y: n8.y, w: W, h: 64,
    text: "Added to the waitlist", actor: "System" };

  const n10 = { id: "n10", kind: "step" as const, x: MAIN, y: at(68), w: W, h: 68,
    text: "Checked against the eligibility sheet", actor: "Program lead" };

  const n11 = { id: "n11", kind: "decision" as const, x: MAIN, y: at(74), w: W, h: 74,
    text: "Eligible?" };
  const n12 = { id: "n12", kind: "end" as const, x: SIDE, y: n11.y, w: W, h: 54,
    text: "Declined, with a reason" };

  const n13 = { id: "n13", kind: "step" as const, x: MAIN, y: at(68), w: W, h: 68,
    text: "Seat confirmed, info pack emailed", actor: "System" };

  // Holding a seat is not the same as turning up. An unconfirmed seat goes
  // back to the waitlist rather than to an empty chair.
  const n14 = { id: "n14", kind: "question" as const, x: MAIN, y: at(80), w: W, h: 80,
    text: "Confirm you can still attend",
    field: { key: "confirmed", type: "yesno" as const, required: true,
      help: "Asked before the day. Confirm by the cut-off or the seat is released." } };
  const n15 = { id: "n15", kind: "step" as const, x: SIDE, y: n14.y, w: W, h: 64,
    text: "Seat released to the waitlist", actor: "System" };

  const n16 = { id: "n16", kind: "end" as const, x: MAIN, y: at(54), w: W, h: 54,
    text: "Attends" };

  return {
    nodes: [n1, n2, n2r, n3, n4, n5, n6, n7, n8, n9, n10, n11, n12, n13, n14, n15, n16],
    edges: [
      { id: "e1", from: "n1", to: "n2" },
      { id: "e2", from: "n2", to: "n3" },
      { id: "e2r", from: "n2", to: "n2r", label: "limits" },
      { id: "e3", from: "n3", to: "n4" },
      { id: "e4", from: "n4", to: "n5" },
      // Trainee-only questions step aside and rejoin the spine.
      { id: "e5", from: "n5", to: "n6", when: { field: "trainee", op: "is", value: "Yes" }, label: "trainee" },
      { id: "e6", from: "n6", to: "n7" },
      { id: "e7", from: "n5", to: "n7", when: { field: "trainee", op: "is not", value: "Yes" }, label: "not a trainee" },
      { id: "e8", from: "n7", to: "n8" },
      { id: "e9", from: "n8", to: "n9", label: "yes" },
      { id: "e10", from: "n8", to: "n10", label: "no" },
      { id: "e11", from: "n10", to: "n11" },
      { id: "e12", from: "n11", to: "n12", label: "no" },
      { id: "e13", from: "n11", to: "n13", label: "yes" },
      { id: "e14", from: "n13", to: "n14" },
      { id: "e15", from: "n14", to: "n16", when: { field: "confirmed", op: "is", value: "Yes" }, label: "confirmed" },
      { id: "e16", from: "n14", to: "n15", when: { field: "confirmed", op: "is not", value: "Yes" }, label: "no reply" },
      { id: "e17", from: "n15", to: "n9", label: "offer it on" },
    ],
  };
})();
