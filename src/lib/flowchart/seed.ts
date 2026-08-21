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
import { clashPairs, MAX_SESSIONS, SESSION_OPTIONS } from "@/lib/training-week/schedule-2026";
import { ACCEPTED, BHN_STATUS_OPTIONS, ELIGIBLE_STATUS } from "@/lib/formbuilder/training-week";
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

  /*
   * The trainee gate comes FIRST, before the sessions are even shown.
   *
   * Training Week is for HQP and current trainees get priority for
   * places, so who is asking is the first thing the process needs to
   * know — asking it after someone has picked three workshops invites
   * them to invest in a choice their status may not support.
   *
   * The distinction this question exists to draw: being REGISTERED on
   * the training platform is not being ACCEPTED into a programme. Last
   * year that conflation is what produced registrations the team then
   * had to reject by hand.
   */
  const nT = { id: "nT", kind: "question" as const, x: MAIN, y: at(62), w: W, h: 62,
    text: "Where do you stand with BioHubNet?",
    field: { key: "bhn_status", type: "choice" as const, required: true,
      options: [...BHN_STATUS_OPTIONS],
      help: "Having an account on the training platform is not the same thing as being in a programme — someone registered but not accepted has to apply first. An EQUIP application counts from the moment it is submitted, funded or not. Current trainees get priority consideration for Training Week places." } };

  // The answer for everyone who says No, said where they will read it.
  // Rewritten because it had become FALSE, not merely stale: it told
  // the reader a non-trainee could "register now regardless", which is
  // the rule the four-way status question reverses.
  const nTinfo = { id: "nTinfo", kind: "note" as const, x: SIDE, y: nT.y, w: W, h: 78,
    text: "Two of the four answers carry on. An account with no programme, or no account, is shown how to apply to ENGAGE, EXPERIENCE or EQUIP at biohubnet.ca — and the form ends there rather than asking for anything else." };

  // Yes branch: confirm who they are against the roster, then carry on.
  const nTv = { id: "nTv", kind: "question" as const, x: MAIN, y: at(94), w: W, h: 94,
    text: "Confirm the details we know you by",
    // Name AND email, because either alone loses people: a trainee may
    // register with a personal address and appear on the roster under
    // an institutional one, or be on it under a name they no longer
    // use. Two fields let a near-miss be recognised rather than
    // rejected, and the pair is what the roster is matched on.
    fields: [
      { key: "trainee_name", type: "text" as const, required: true,
        help: "Your name as it appears on your BioHubNet record. Give that one even if you go by something else now." },
      { key: "trainee_email", type: "email" as const, required: true,
        help: "Your institutional email, or the secondary email registered with BioHubNet. It is checked against the trainee roster and used for nothing else on this form." },
    ] };

  // The roster is a record the process READS, so it is drawn as one —
  // out on its own lane, because it is not a step anybody performs. The
  // live sheet behind it is set in the admin panel.
  const nTroster = { id: "nTroster", kind: "data" as const, x: SIDE, y: nTv.y, w: W, h: 62,
    text: "BioHubNet trainee roster · live sheet" };

  const nTd = { id: "nTd", kind: "decision" as const, x: MAIN, y: at(46), w: W, h: 46,
    text: "Found on the roster?" };

  // Confirming sets the backend status; failing to confirm does NOT stop
  // the registration. The gate only settles WHICH status someone holds.
  const nTc = { id: "nTc", kind: "step" as const, x: MAIN, y: at(62), w: W, h: 62,
    text: "Current trainee confirmed", actor: "System" };
  const nTx = { id: "nTx", kind: "step" as const, x: SIDE, y: nTc.y, w: W, h: 78,
    text: "Not on the roster · continues as HQP", actor: "System" };

  const n6 = { id: "n6", kind: "question" as const, x: MAIN, y: at(78), w: W, h: 78,
    text: "Trainee details",
    fields: [
      { key: "bhn_programs", type: "multi" as const,
        options: ["ENGAGE", "EXPERIENCE", "EQUIP"] },
      { key: "travel_origin", type: "text" as const,
        help: "City or town you would travel from, if you need support. Subject to approval." },
    ] };

  /*
   * Who you are comes before what you are picking.
   *
   * Choosing three workshops and only then being asked who you are puts
   * the investment before the introduction. It also keeps the two
   * name-and-email questions next to each other, which is what makes
   * the difference between them legible: the box above confirms the
   * details BioHubNet already holds, for matching against the roster;
   * this one is where the coordinator should write to you about this
   * event. Far apart they look like the same question asked twice.
   */
  const n3 = { id: "n3", kind: "question" as const, x: MAIN, y: at(62), w: W, h: 62,
    text: "About you",
    fields: [
      { key: "contact", type: "contact" as const, required: true,
        help: "How the coordinator should reach you about Training Week." },
      { key: "linkedin", type: "text" as const, help: "Optional." },
    ] };

  const n2 = { id: "n2", kind: "question" as const, x: MAIN, y: at(46), w: W, h: 46,
    text: "Choose your sessions",
    field: { key: "sessions", type: "multi" as const, required: true,
      help: "Pick the ones you want to attend.",
      // The same list the live form offers, from the one place the
      // week is written down. A chart that names sessions the form
      // does not have is a drawing of a process nobody is running.
      options: SESSION_OPTIONS } };

  // The limits on that pick, as their own box: what the week can hold,
  // and which sessions run against each other. Drawn beside the question
  // rather than buried in its settings, because the cap and the clashes
  // are part of the process a reader needs to see. Both are computed
  // from the schedule, so neither can go stale when a time moves.
  const n2r = { id: "n2r", kind: "rule" as const, x: SIDE, y: n2.y, w: W, h: 62,
    text: `Up to ${MAX_SESSIONS} sessions · clashes flagged`,
    limit: {
      field: "sessions",
      max: MAX_SESSIONS,
      // Derived from the times, as PAIRS. Grouping them by day would
      // misinform: CL3 overlaps both Monday tours, but the tours run
      // back to back, so a "Monday" group would warn people off a
      // combination that is perfectly allowed.
      clashes: clashPairs().map((c) => ({ label: c.label, options: [...c.options] })),
    } };

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

  /*
   * All three affiliations, collected separately.
   *
   * A person can be a PhD student at a university, a clinician at a
   * hospital and a founder of a company at the same time, and the team
   * needs each of those counted in its own column — one box would lose
   * two of them. Which one is PRIMARY is answered above, by the
   * organisation-type question, so the note's "one primary institution"
   * is satisfied by naming it rather than by refusing to hear the rest.
   *
   * Each is a picker, never typing: that is what stopped University of
   * Toronto arriving spelled twenty different ways.
   */
  const n4a = { id: "n4a", kind: "question" as const, x: MAIN, y: at(94), w: W, h: 94,
    text: "Your affiliations",
    fields: [
      { key: "academic", type: "academic" as const,
        help: "Your university or research institute. Leave blank if none." },
      { key: "health", type: "health" as const,
        help: "Your hospital or health network. Leave blank if none." },
      { key: "company", type: "company" as const,
        help: "Your company, startup or venture. Leave blank if none." },
    ] };

  // The one demographic no list covers, asked only of the people it
  // applies to so nobody else meets an empty text box.
  const n4d = { id: "n4d", kind: "question" as const, x: SIDE, y: n4a.y, w: W, h: 62,
    text: "Name your organization",
    field: { key: "org_other", type: "text" as const, required: true,
      help: "As it should appear in reports." } };

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

  // Why the roster check earns its place: a confirmed trainee is ahead
  // of an unconfirmed one when the week is oversubscribed.
  const nPri = { id: "nPri", kind: "rule" as const, x: SIDE, y: n10.y, w: W, h: 62,
    text: "Confirmed trainees are considered first for places" };

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
    nodes: [n1, nT, nTinfo, nTv, nTroster, nTd, nTc, nTx, n6,
            n3, n2, n2r, n3b, n4a, n4d, n5, n5r, n7,
            n8, n9, n10, nPri, n11, n12, n13, n14, n15, n16],
    edges: [
      { id: "e1", from: "n1", to: "nT" },
      // Saying yes means proving it; saying no costs nothing and the
      // registration carries straight on to the sessions.
      { id: "eT1", from: "nT", to: "nTv", when: { field: "bhn_status", op: "any of", value: ELIGIBLE_STATUS.join(",") }, label: "in a programme" },
      // The other path runs THROUGH the note, because the note is what
      // that answer means: here is how to join a programme. Reading it
      // IS the step, and it is now the last one — the form ends there
      // rather than carrying on to the sessions.
      { id: "eTn", from: "nT", to: "nTinfo", when: { field: "bhn_status", op: "is not", value: ACCEPTED }, label: "not yet" },
      { id: "eT3", from: "nTv", to: "nTd" },
      { id: "eT4", from: "nTv", to: "nTroster", label: "checked against" },
      { id: "eT5", from: "nTd", to: "nTc", label: "found" },
      { id: "eT6", from: "nTd", to: "nTx", label: "not found" },
      { id: "eT7", from: "nTc", to: "n6" },
      { id: "eT8", from: "n6", to: "n3" },
      // Not being on the roster is not a rejection — it settles the
      // status and rejoins the same spine.
      { id: "eT9", from: "nTx", to: "n3" },
      { id: "e2", from: "n3", to: "n2" },
      { id: "e2r", from: "n2", to: "n2r", label: "limits" },
      { id: "e3b", from: "n2", to: "n3b" },
      // One institution question per demographic — the org type answered
      // above decides which one is asked. The unlabelled spine arrow is
      // what keeps the rest of the form visible before it is answered.
      { id: "e4a", from: "n3b", to: "n4a" },
      { id: "e4d", from: "n3b", to: "n4d", when: { field: "primary_org", op: "any of", value: "Government,Non-Profit,Other" }, label: "other" },
      { id: "e5a", from: "n4a", to: "n5" },
      { id: "e5d", from: "n4d", to: "n5" },
      { id: "e5r", from: "n5", to: "n5r", label: "flagged" },
      { id: "e6", from: "n5", to: "n7" },
      { id: "e8", from: "n7", to: "n8" },
      { id: "e9", from: "n8", to: "n9", label: "yes" },
      { id: "e10", from: "n8", to: "n10", label: "no" },
      { id: "e11", from: "n10", to: "n11" },
      { id: "e11p", from: "n10", to: "nPri", label: "priority" },
      { id: "e12", from: "n11", to: "n12", label: "no" },
      { id: "e13", from: "n11", to: "n13", label: "yes" },
      { id: "e14", from: "n13", to: "n14" },
      { id: "e15", from: "n14", to: "n16", when: { field: "confirmed", op: "is", value: "Yes" }, label: "confirmed" },
      { id: "e16", from: "n14", to: "n15", when: { field: "confirmed", op: "is not", value: "Yes" }, label: "no reply" },
      { id: "e17", from: "n15", to: "n9", label: "offer it on" },
    ],
  };
})();
