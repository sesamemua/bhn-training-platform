/**
 * The Training Week registration flow, as a starting chart.
 *
 * Seeded rather than drawn from scratch so the first thing anyone opens is
 * the real process — including the parts that are still undecided, which
 * are marked as notes so they read as open questions rather than as
 * settled steps.
 */
import type { ChartDoc } from "./types";

const COL = { a: 40, b: 300, c: 560, d: 820, e: 1080, f: 1340 };
const row = (n: number) => 40 + n * 110;

export const TRAINING_WEEK_FLOW: ChartDoc = {
  nodes: [
    { id: "n1",  kind: "start",    x: COL.a, y: row(0), w: 190, h: 52, text: "Registration opens", actor: "Coordinator" },
    { id: "n2",  kind: "step",     x: COL.a, y: row(1), w: 190, h: 66, text: "Picks up to 3 sessions", actor: "Registrant" },
    { id: "n3",  kind: "question", x: COL.a, y: row(2), w: 190, h: 66, text: "Your details",
      field: { key: "contact", type: "contact", required: true, help: "Name, email and a phone number we can reach you on." } },
    { id: "n3b", kind: "question", x: COL.b, y: row(2), w: 190, h: 66, text: "Are you a BioHubNet trainee?",
      field: { key: "trainee", type: "yesno", required: true } },
    // Affiliations are repeatable on purpose: someone can be a PhD student,
    // a clinician and a founder at once, and a single box loses two of them.
    // Three separate questions, because one person can answer all three:
    // a PhD student who is also a clinician and runs a spin-out.
    { id: "n3c", kind: "question", x: COL.c, y: row(2), w: 190, h: 78, text: "Academic institution",
      field: { key: "academic", type: "academic", help: "Leave blank if none." } },
    { id: "n3d", kind: "question", x: COL.d, y: row(2), w: 190, h: 78, text: "Hospital or health network",
      field: { key: "health", type: "health", help: "Leave blank if none." } },
    { id: "n3e", kind: "question", x: COL.d, y: row(3), w: 190, h: 78, text: "Company",
      field: { key: "company", type: "company", help: "Leave blank if none." } },
    // ── carried over from the 2025 Symposium Luma form ──────────────
    { id: "q_cat",  kind: "question", x: COL.e, y: row(0), w: 190, h: 66, text: "Which best describes you?",
      field: { key: "category", type: "choice", required: true,
        options: ["Industry", "Academia", "Government", "Other"] } },
    { id: "q_role", kind: "question", x: COL.f, y: row(0), w: 190, h: 66, text: "Position title",
      field: { key: "position_title", type: "text", required: true } },
    { id: "q_li",   kind: "question", x: COL.e, y: row(1), w: 190, h: 66, text: "LinkedIn profile",
      field: { key: "linkedin", type: "text", help: "Optional." } },
    { id: "q_exp",  kind: "question", x: COL.f, y: row(1), w: 190, h: 78, text: "Area of expertise or interest",
      field: { key: "expertise", type: "multi", required: true,
        options: ["R & D", "QA/QC", "Manufacturing", "Clinical Operations", "Regulatory Affairs",
                  "Medical Affairs", "Business Development", "Other"] } },
    { id: "q_stat", kind: "question", x: COL.e, y: row(2), w: 190, h: 78, text: "Current status",
      field: { key: "trainee_status", type: "choice", help: "Trainees only.",
        options: ["Master's Student", "PhD Student", "Post-doctoral Fellow",
                  "Research Associate", "Laboratory Technician", "Other"] } },
    { id: "q_prog", kind: "question", x: COL.f, y: row(2), w: 190, h: 78, text: "BioHubNet programs you are in",
      field: { key: "bhn_programs", type: "multi", help: "Trainees only.",
        options: ["ENGAGE", "EXPERIENCE", "EQUIP"] } },
    { id: "q_trav", kind: "question", x: COL.e, y: row(3), w: 190, h: 78, text: "Travel origin, if you need support",
      field: { key: "travel_origin", type: "text",
        help: "Trainees only, subject to approval — city/town you would travel from." } },
    { id: "q_diet", kind: "question", x: COL.f, y: row(3), w: 190, h: 66, text: "Dietary requirements or allergies",
      field: { key: "dietary", type: "text", help: "Leave blank if none." } },
    { id: "q_news", kind: "question", x: COL.e, y: row(4), w: 190, h: 66, text: "Join the BioHubNet newsletter",
      field: { key: "newsletter_optin", type: "yesno" } },
    { id: "q_photo", kind: "question", x: COL.f, y: row(4), w: 190, h: 78, text: "Photo and video consent",
      field: { key: "media_consent", type: "yesno", required: true,
        help: "BioHubNet may capture photographs and video and use them for promotional purposes." } },

    { id: "n4",  kind: "decision", x: COL.a, y: row(3), w: 190, h: 78, text: "Session full?" },
    { id: "n5",  kind: "step",     x: COL.b, y: row(3), w: 190, h: 66, text: "Added to waitlist", actor: "System" },

    { id: "n6",  kind: "decision", x: COL.a, y: row(4) + 20, w: 190, h: 78, text: "BHN trainee?" },
    { id: "n7",  kind: "step",     x: COL.b, y: row(4) + 20, w: 190, h: 66, text: "Held for eligibility review", actor: "System" },
    { id: "n8",  kind: "step",     x: COL.c, y: row(4) + 20, w: 190, h: 78, text: "Checked against the eligibility sheet", actor: "Program lead" },
    { id: "n9",  kind: "decision", x: COL.d, y: row(4) + 20, w: 190, h: 78, text: "Eligible?" },
    { id: "n10", kind: "end",      x: COL.d, y: row(6) + 20, w: 190, h: 52, text: "Declined, with a reason" },

    { id: "n11", kind: "step",     x: COL.a, y: row(6) + 10, w: 190, h: 66, text: "Seat confirmed", actor: "System" },
    { id: "n12", kind: "step",     x: COL.a, y: row(7) + 10, w: 190, h: 66, text: "Info pack emailed", actor: "System" },
    { id: "n13", kind: "step",     x: COL.b, y: row(7) + 10, w: 190, h: 66, text: "Reminder before the day", actor: "System" },

    // Holding a seat is not the same as turning up. Registrants confirm
    // before the day; an unconfirmed seat goes back to the waitlist rather
    // than to an empty chair.
    { id: "n17", kind: "step",     x: COL.c, y: row(7) + 10, w: 190, h: 66, text: "Asked to confirm attendance", actor: "System" },
    { id: "n18", kind: "question", x: COL.d, y: row(7) + 10, w: 190, h: 78, text: "Can you still attend?",
      field: { key: "confirmed", type: "yesno", required: true, help: "Confirm by the cut-off or the seat is released." } },
    { id: "n19", kind: "decision", x: COL.d, y: row(8) + 20, w: 190, h: 78, text: "Confirmed in time?" },
    { id: "n20", kind: "step",     x: COL.b, y: row(8) + 20, w: 190, h: 66, text: "Seat released", actor: "System" },
    { id: "n14", kind: "end",      x: COL.c, y: row(9) + 20, w: 190, h: 52, text: "Attends" },

    { id: "n15", kind: "step",     x: COL.c, y: row(1), w: 190, h: 78, text: "Modify or cancel via emailed code", actor: "Registrant" },
    { id: "n16", kind: "step",     x: COL.d, y: row(1), w: 190, h: 78, text: "Freed seat offered to waitlist", actor: "System" },

    { id: "q1",  kind: "note",     x: COL.b, y: row(0), w: 210, h: 62, text: "Undecided: auto-approve BHN trainees, or review everyone?" },
    { id: "q2",  kind: "note",     x: COL.d, y: row(0), w: 210, h: 62, text: "Undecided: waitlist promotes itself, or an organiser confirms?" },
  ],
  edges: [
    { id: "e1",  from: "n1",  to: "n2" },
    { id: "e2",  from: "n2",  to: "n3" },
    { id: "e2b", from: "n3",  to: "n3b" },
    // Everyone answers the three affiliation questions — the 41 eligible
    // institutions ARE the eligibility check, so gating them behind
    // "not a trainee" hid the list from most registrants.
    { id: "e2c", from: "n3b", to: "n3c" },
    { id: "e2d", from: "n3c", to: "n3d" },
    { id: "e2e", from: "n3d", to: "n3e" },
    { id: "e3b", from: "n3e", to: "q_cat" },
    { id: "eq1", from: "q_cat",  to: "q_role" },
    { id: "eq2", from: "q_role", to: "q_li" },
    { id: "eq3", from: "q_li",   to: "q_exp" },
    { id: "eq4", from: "q_exp",  to: "q_stat" },
    { id: "eq5", from: "q_stat", to: "q_prog" },
    { id: "eq6", from: "q_prog", to: "q_trav" },
    { id: "eq7", from: "q_trav", to: "q_diet" },
    { id: "eq8", from: "q_diet", to: "q_news" },
    { id: "eq9", from: "q_news", to: "q_photo" },
    { id: "eq10", from: "q_photo", to: "n4" },
    { id: "e4",  from: "n4",  to: "n5",  label: "yes" },
    { id: "e5",  from: "n4",  to: "n6",  label: "no" },
    { id: "e6",  from: "n6",  to: "n11", label: "yes" },
    { id: "e7",  from: "n6",  to: "n7",  label: "no" },
    { id: "e8",  from: "n7",  to: "n8" },
    { id: "e9",  from: "n8",  to: "n9" },
    { id: "e10", from: "n9",  to: "n11", label: "yes" },
    { id: "e11", from: "n9",  to: "n10", label: "no" },
    { id: "e12", from: "n11", to: "n12" },
    { id: "e13", from: "n12", to: "n13" },
    { id: "e14", from: "n13", to: "n17" },
    { id: "e17", from: "n17", to: "n18" },
    { id: "e18", from: "n18", to: "n19" },
    { id: "e19", from: "n19", to: "n14", when: { field: "confirmed", op: "is", value: "Yes" }, label: "confirmed" },
    { id: "e20", from: "n19", to: "n20", when: { field: "confirmed", op: "is not", value: "Yes" }, label: "no reply" },
    { id: "e21", from: "n20", to: "n16", label: "offer it on" },
    { id: "e15", from: "n15", to: "n16", label: "cancels" },
    { id: "e16", from: "n16", to: "n5",  label: "next in line" },
  ],
};
