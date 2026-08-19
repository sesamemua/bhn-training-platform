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

const MAIN = 36;   // the spine every step sits on
const SIDE = 366;  // where a branch steps out to, and rejoins from
const W = 220;
const TOP = 24;    // clear air above the first box
const GAP = 34;    // between one step and the next

/**
 * The lane gap is 110px, not the 30 it started at. A branch sitting almost
 * against the spine reads as part of it, and left the arrow between them
 * no room to be seen — the two columns have to look like two columns.
 *
 * Boxes are 220 wide rather than 250: the page now carries four columns,
 * and the chart is the one that can afford to give width back. The lane
 * gap is held at 110 while doing it — narrowing the chart must not undo
 * the separation between the spine and its branches.
 */

/**
 * Box heights are the measured height of their own content plus a little
 * air, not a round number picked by eye. Measuring found 30–40px of slack
 * in most boxes and three that were actually a few pixels SHORT, which is
 * the sort of thing you cannot see but adds a third to the height of the
 * whole chart.
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

  /*
   * Restructured August 2026 against the coordinator's note on last
   * year's data. The requests, in one line each — the Review section
   * under the chart measures the live chart against every one of them:
   *
   *   • Training Week ONLY. The symposium registers separately, so no
   *     question here may mention it.
   *   • Lead with "Are you a current BioHubNet trainee?" — the week is
   *     for HQP, and eligibility should be visible early.
   *   • No free-text "Institution / Company" (20+ spellings of UofT,
   *     inflated industry figures). Position and organisation type are
   *     two dropdowns, and the institution is a dropdown pick — ONE,
   *     the primary.
   *   • The old three-way Category (Industry/Academia/Government) is
   *     gone. Positions and org types follow the note's 2026 lists,
   *     with the definitions IN the question, hospitals included, and
   *     "Industry Professional" labelled exactly that.
   *   • Position title is a dropdown with Other, not free text.
   *   • "Area of expertise" is kept but flagged: the note asks whether
   *     it is still wanted for 2026, and that is the colleague's call.
   */

  // Taller than the other pills: a start node carries a label AND an
  // actor, and 48px put both lines hard against the rounded ends.
  const n1 = { id: "n1", kind: "start" as const, x: MAIN, y: at(62), w: W, h: 62,
    text: "Registration opens", actor: "Coordinator" };

  const n2 = { id: "n2", kind: "question" as const, x: MAIN, y: at(46), w: W, h: 46,
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
  const n2r = { id: "n2r", kind: "rule" as const, x: SIDE, y: n2.y, w: W, h: 62,
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

  // The trainee question leads, per the note: Training Week is for HQP,
  // so who you are comes before what you do.
  const n3 = { id: "n3", kind: "question" as const, x: MAIN, y: at(78), w: W, h: 78,
    text: "About you",
    fields: [
      { key: "contact", type: "contact" as const, required: true },
      { key: "trainee", type: "yesno" as const, required: true,
        help: "Are you a current BioHubNet trainee?" },
      { key: "linkedin", type: "text" as const, help: "Optional." },
    ] };

  // Trainee-only questions step aside and rejoin the spine.
  const n6 = { id: "n6", kind: "question" as const, x: SIDE, y: n3.y, w: W, h: 78,
    text: "Trainee details",
    fields: [
      { key: "bhn_programs", type: "multi" as const,
        options: ["ENGAGE", "EXPERIENCE", "EQUIP"] },
      { key: "travel_origin", type: "text" as const,
        help: "City or town you would travel from, if you need support. Subject to approval." },
    ] };

  // The note's 2026 questions, verbatim lists. The definitions live in
  // the questions themselves — last year "Industry" swallowed students
  // with company ties, and the fix the note asks for is words, not code.
  const n3b = { id: "n3b", kind: "question" as const, x: MAIN, y: at(78), w: W, h: 78,
    text: "Your role",
    fields: [
      { key: "primary_position", type: "choice" as const, required: true,
        help: "Students pick a student option even if they also work with a company. Industry Professional means a member of a private company, not a student.",
        options: [
          "Undergraduate Student",
          "Master's Student",
          "PhD Student",
          "Postdoctoral Fellow",
          "Laboratory Technician / Research Associate",
          "Faculty Member / Research Staff",
          "Administrative Staff",
          "Industry Professional",
          "Entrepreneur / Founder",
          "Other",
        ] },
      { key: "primary_org", type: "choice" as const, required: true,
        help: "Where you mainly work or study. Academia covers faculty, staff and students.",
        options: [
          "Academic Institution",
          "Industry / Private Sector",
          "Startup",
          "Government",
          "Healthcare / Hospital",
          "Non-Profit",
          "Entrepreneurial Venture",
          "Other",
        ] },
    ] };

  // ONE primary institution, as a pick rather than a text box — last
  // year University of Toronto arrived spelled twenty different ways.
  // Which picker you meet depends on the organisation type you just
  // gave, so nobody is asked to find a hospital in a university list.
  const n4a = { id: "n4a", kind: "question" as const, x: SIDE, y: at(56), w: W, h: 56,
    text: "Primary institution",
    field: { key: "academic", type: "academic" as const, required: true,
      help: "The institution you study or work at. One — your primary." } };
  const n4b = { id: "n4b", kind: "question" as const, x: SIDE, y: at(56), w: W, h: 56,
    text: "Primary hospital or network",
    field: { key: "health", type: "health" as const, required: true,
      help: "One — your primary." } };
  const n4c = { id: "n4c", kind: "question" as const, x: SIDE, y: at(56), w: W, h: 56,
    text: "Primary company",
    field: { key: "company", type: "company" as const, required: true,
      help: "One — your primary." } };
  const n4d = { id: "n4d", kind: "question" as const, x: SIDE, y: at(56), w: W, h: 56,
    text: "Primary organization",
    field: { key: "org_other", type: "text" as const, required: true,
      help: "Its name as it should appear in reports. One — your primary." } };

  const n5 = { id: "n5", kind: "question" as const, x: MAIN, y: at(62), w: W, h: 62,
    text: "Your work",
    field: { key: "expertise", type: "multi" as const, required: true,
      options: ["R & D", "QA/QC", "Manufacturing", "Clinical Operations",
                "Regulatory Affairs", "Medical Affairs", "Business Development", "Other"] } };

  // The note does not decide this one — it asks. Kept, and flagged.
  const n5r = { id: "n5r", kind: "note" as const, x: SIDE, y: n5.y, w: W, h: 62,
    text: "Note: the 2026 note asks whether 'Area of expertise' is still needed. Keep or drop is the coordinator's call — see the review below." };

  const n7 = { id: "n7", kind: "question" as const, x: MAIN, y: at(78), w: W, h: 78,
    text: "Before you finish",
    fields: [
      { key: "dietary", type: "text" as const, help: "Dietary requirements or allergies. Blank if none." },
      { key: "newsletter_optin", type: "yesno" as const },
      { key: "media_consent", type: "yesno" as const, required: true,
        help: "BioHubNet may capture photographs and video and use them for promotional purposes." },
    ] };

  const n8 = { id: "n8", kind: "decision" as const, x: MAIN, y: at(46), w: W, h: 46,
    text: "Any chosen session full?" };
  const n9 = { id: "n9", kind: "step" as const, x: SIDE, y: n8.y, w: W, h: 62,
    text: "Added to the waitlist", actor: "System" };

  const n10 = { id: "n10", kind: "step" as const, x: MAIN, y: at(78), w: W, h: 78,
    text: "Checked against the eligibility sheet", actor: "Program lead" };

  const n11 = { id: "n11", kind: "decision" as const, x: MAIN, y: at(46), w: W, h: 46,
    text: "Eligible?" };
  const n12 = { id: "n12", kind: "end" as const, x: SIDE, y: n11.y, w: W, h: 46,
    text: "Declined, with a reason" };

  const n13 = { id: "n13", kind: "step" as const, x: MAIN, y: at(78), w: W, h: 78,
    text: "Seat confirmed, info pack emailed", actor: "System" };

  // Holding a seat is not the same as turning up. An unconfirmed seat goes
  // back to the waitlist rather than to an empty chair.
  const n14 = { id: "n14", kind: "question" as const, x: MAIN, y: at(62), w: W, h: 62,
    text: "Confirm you can still attend",
    field: { key: "confirmed", type: "yesno" as const, required: true,
      help: "Asked before the day. Confirm by the cut-off or the seat is released." } };
  const n15 = { id: "n15", kind: "step" as const, x: SIDE, y: n14.y, w: W, h: 78,
    text: "Seat released to the waitlist", actor: "System" };

  const n16 = { id: "n16", kind: "end" as const, x: MAIN, y: at(46), w: W, h: 46,
    text: "Attends" };

  return {
    nodes: [n1, n2, n2r, n3, n6, n3b, n4a, n4b, n4c, n4d, n5, n5r, n7,
            n8, n9, n10, n11, n12, n13, n14, n15, n16],
    edges: [
      { id: "e1", from: "n1", to: "n2" },
      { id: "e2", from: "n2", to: "n3" },
      { id: "e2r", from: "n2", to: "n2r", label: "limits" },
      // Trainee-only questions step aside and rejoin the spine.
      { id: "e3a", from: "n3", to: "n6", when: { field: "trainee", op: "is", value: "Yes" }, label: "trainee" },
      { id: "e3b", from: "n6", to: "n3b" },
      { id: "e3c", from: "n3", to: "n3b", when: { field: "trainee", op: "is not", value: "Yes" }, label: "not a trainee" },
      // One institution question per demographic — the org type answered
      // above decides which one is asked. The unlabelled spine arrow is
      // what keeps the rest of the form visible before it is answered.
      { id: "e4a", from: "n3b", to: "n4a", when: { field: "primary_org", op: "any of", value: "Academic Institution" }, label: "academic" },
      { id: "e4b", from: "n3b", to: "n4b", when: { field: "primary_org", op: "any of", value: "Healthcare / Hospital" }, label: "hospital" },
      { id: "e4c", from: "n3b", to: "n4c", when: { field: "primary_org", op: "any of", value: "Industry / Private Sector,Startup,Entrepreneurial Venture" }, label: "industry" },
      { id: "e4d", from: "n3b", to: "n4d", when: { field: "primary_org", op: "any of", value: "Government,Non-Profit,Other" }, label: "other" },
      { id: "e4s", from: "n3b", to: "n5" },
      { id: "e5a", from: "n4a", to: "n5" },
      { id: "e5b", from: "n4b", to: "n5" },
      { id: "e5c", from: "n4c", to: "n5" },
      { id: "e5d", from: "n4d", to: "n5" },
      { id: "e5r", from: "n5", to: "n5r", label: "flagged" },
      { id: "e6", from: "n5", to: "n7" },
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
