/**
 * The Training Week registration, as a built form.
 *
 * Ported from the flow chart, which used to double as the form's
 * definition. The chart keeps its copy as a drawing of the process; this
 * is the thing people actually fill in, and from here the two change
 * independently.
 *
 * The composite question types the chart had — "contact", "academic",
 * "company" — are spelled out here as ordinary questions, because a
 * builder that can only be used by someone who knows about a bespoke
 * "contact" widget is not a builder.
 */
import { INSTITUTIONS } from "@/lib/flowchart/institutions";
import { MAX_SESSIONS, SESSION_OPTIONS, SESSION_SLOTS } from "@/lib/training-week/schedule-2026";
import { BuiltFormSchema, type BuiltForm } from "./types";

const OTHER = "Other — not listed";

const academic = [...INSTITUTIONS.filter((i) => i.sector === "academic").map((i) => i.name), OTHER];
const health = [...INSTITUTIONS.filter((i) => i.sector === "health").map((i) => i.name), OTHER];

/**
 * How long before a session the confirmation email goes out.
 *
 * The same number the Admin dashboard measures "confirmed by cut-off"
 * against, so the two cannot drift apart — a deadline the process uses
 * and a deadline the reporting uses have to be one number.
 */
export const CONFIRM_DAYS_BEFORE = 7;

/**
 * The four answers to "where do you stand with BioHubNet".
 *
 * NOT a yes/no. Yes/no had three different people answering No — an
 * accepted trainee who did not think of themselves as one, somebody with
 * an account but no programme, and somebody who had never heard of the
 * platform — and it told all three the same thing. They need different
 * things: the first can register, the other two have a step to take
 * first, and it is not the same step.
 *
 * NO COMMAS IN THESE STRINGS. The `any of` operator splits its value on
 * commas, so a comma inside an option silently breaks every rule that
 * tests for it.
 */
export const ACCEPTED = "Yes — accepted into ENGAGE or EXPERIENCE";
/*
 * EQUIP is deliberately different. Applying is the qualification, not
 * winning: Training Week exists to build the people who are trying, and
 * gating it on an award would shut out exactly the applicants it is for.
 */
export const EQUIP_APPLIED = "Yes — applied to EQUIP (an award is not required)";
export const HAS_ACCOUNT = "I have a BioHubNet account but I am not in a programme";
export const NO_ACCOUNT = "I do not have a BioHubNet account yet";

export const BHN_STATUS_OPTIONS = [ACCEPTED, EQUIP_APPLIED, HAS_ACCOUNT, NO_ACCOUNT];

/** The two answers that mean "carry on and pick your sessions". */
export const ELIGIBLE_STATUS = [ACCEPTED, EQUIP_APPLIED];

/** A condition matching the eligible answers, for showWhen and for steps. */
export const whenEligible = { field: "bhn_status", op: "any of" as const, value: ELIGIBLE_STATUS.join(",") };

/*
 * The 2026 sessions, derived rather than typed out again.
 *
 * They used to be a second hand-written copy of the coordinators'
 * planning grid, and it drifted: the Monday tours were recorded as
 * concurrent when the plan runs them back to back. One list now, in
 * lib/training-week/schedule-2026.
 */
export const SESSIONS_2026 = SESSION_OPTIONS;

/*
 * Parsed through the schema at import rather than asserted as the
 * output type. Two reasons: the literals below can leave out anything
 * with a default (slots, options) instead of repeating `slots: []`
 * twenty-two times, and a field that breaks a limit fails LOUDLY here,
 * at module load, rather than being silently dropped by parseForm at
 * runtime — which is exactly how the consent question disappeared once.
 */
export const TRAINING_WEEK_FORM: BuiltForm = BuiltFormSchema.parse({
  version: 1,
  sources: [],
  /*
   * Photography, as a condition of registering rather than a question.
   *
   * It was a question with one box you had to tick, which is a checkbox
   * pretending to be a choice: there was no way to answer No that the
   * form would accept. Saying it plainly next to the button is more
   * honest and one question shorter. Anybody who is not comfortable is
   * told who to talk to, which the question also did.
   */
  submitNote:
    "By submitting this registration you agree to be photographed and filmed at Training Week, and to BioHubNet using those pictures and recordings to promote its programmes. There will be a photographer and a video crew at the sessions. Pictures and footage that include you may appear on the BioHubNet website, on its social media, in newsletters, in reports to funders, and in printed material — they can be seen by anyone and may stay online indefinitely. You are giving this permission free of charge. If you would rather not be filmed, contact the coordinator before you register and they will talk it through with you.",
  fields: [
    {
      id: "f_trainee", key: "bhn_status", label: "Where do you stand with BioHubNet?",
      type: "choice", required: true, options: BHN_STATUS_OPTIONS, showWhen: [],
      help: "Training Week is for people already in a BioHubNet programme. Having an account is not the same as being in one. If you have applied to EQUIP you count, whether or not the application was funded — applying is the qualification, not winning.",
    },
    {
      /*
       * Two answers, two different next steps, so two notes.
       *
       * One note covering both would have to say "sign up, or if you
       * already have, apply", which makes every reader work out which
       * half is theirs — in the one place the form exists to tell them
       * what to do.
       */
      id: "f_needprog", key: "need_programme_note", stopsHere: true,
      label: "One step first: join a programme.",
      type: "note", required: false, options: [],
      showWhen: [{ field: "bhn_status", op: "is", value: HAS_ACCOUNT }],
      help: "You have an account, which is the hard part done. Training Week places go to people in ENGAGE, EXPERIENCE or EQUIP, so apply to whichever fits — an EQUIP application counts from the moment you submit it, funded or not. Read about all three at biohubnet.ca, then come back to this form.",
    },
    {
      id: "f_needacct", key: "need_account_note", stopsHere: true,
      label: "Two steps first: an account, then a programme.",
      type: "note", required: false, options: [],
      showWhen: [{ field: "bhn_status", op: "is", value: NO_ACCOUNT }],
      help: "Create a BioHubNet account, then apply to ENGAGE, EXPERIENCE or EQUIP — Training Week places go to people in one of the three. An EQUIP application counts from the moment you submit it, whether or not it is funded. Start at biohubnet.ca, then come back to this form.",
    },
    {
      id: "f_tname", key: "trainee_name", label: "The name we know you by",
      type: "short_text", required: true, options: [],
      showWhen: [whenEligible],
      help: "Your name as it appears on your BioHubNet record. Give that one even if you go by something else now.",
    },
    {
      id: "f_temail", key: "trainee_email", label: "The email registered with BioHubNet",
      type: "email", required: true, options: [],
      showWhen: [whenEligible],
      help: "Your institutional email, or the secondary email registered with us. We check it against the BioHubNet trainee list to confirm your status — it is used for nothing else on this form. If we cannot find it, your registration still goes through; it just is not counted as a trainee one.",
    },
    {
      id: "f_prog", key: "bhn_programs", label: "Which programmes are you in?",
      type: "multi", required: false, options: ["ENGAGE", "EXPERIENCE", "EQUIP"],
      showWhen: [whenEligible],
    },
    {
      /*
       * "Where would you travel from?" asked for a fact and left the
       * registrant to guess what it was for. This asks the question the
       * decision actually turns on, and says what a Yes might get you.
       */
      id: "f_travel2h", key: "travel_over_2h",
      label: "Is your travel time to Toronto more than 2 hours?",
      type: "yesno", required: false, options: [],
      showWhen: [whenEligible],
      help: "Door to door, one way. If it is, you may qualify for travel assistance — we will write to you separately about what is available and what we need from you.",
    },
    {
      // Asked only of the people it is relevant to. Asking everybody
      // for a postcode to settle a question most of them answered no
      // to is how a form gets long for no reason.
      id: "f_postcode", key: "postcode", label: "Your postal code",
      type: "short_text", required: false, options: [],
      showWhen: [whenEligible, { field: "travel_over_2h", op: "is", value: "Yes" }],
      help: "So we can work out the distance. Nothing else is done with it.",
    },
    { id: "f_first", key: "first_name", label: "First name", type: "short_text", required: true, options: [], showWhen: [whenEligible] },
    { id: "f_last", key: "last_name", label: "Last name", type: "short_text", required: true, options: [], showWhen: [whenEligible] },
    {
      id: "f_email", key: "email", label: "Email", type: "email", required: true, options: [], showWhen: [whenEligible],
      help: "How the coordinator will reach you about Training Week.",
    },
    { id: "f_phone", key: "phone", label: "Phone", type: "phone", required: false, options: [], showWhen: [whenEligible], help: "Optional." },
    { id: "f_li", key: "linkedin", label: "LinkedIn", type: "short_text", required: false, options: [], showWhen: [whenEligible], help: "Optional." },
    {
      /*
       * Drawn as a week, not a list.
       *
       * The week has real overlaps — CL3 runs across both Monday
       * tours, and the two Tuesday workshops start at the same hour.
       * In a column of tick-boxes that is invisible, so people pick
       * both, one gets approved and the other becomes a disappointment
       * the form could have shown them at the time. You may still tick
       * both — a second choice is worth expressing — but the clash is
       * drawn and the consequence is stated.
       *
       * The Monday tours are NOT one of those overlaps: they run back
       * to back, and the form used to claim otherwise.
       */
      id: "f_sessions", key: "sessions", label: "Choose your sessions",
      type: "multi", required: true, options: SESSIONS_2026, showWhen: [whenEligible],
      approveFromClash: 1,
      slots: SESSION_SLOTS,
      help: `Pick the ones you want to attend — up to ${MAX_SESSIONS}. Sessions drawn side by side in the calendar run at the same time: you may choose both, but only one of a clashing pair can be approved. The two Monday company tours run back to back, so you can do both.`,
    },
    {
      /*
       * The Symposium is a different event with its own registration,
       * and the note that started this work asked for the two to stop
       * being run together. Asking is not the same as merging them: a
       * Training Week week that ends the day before the Symposium is
       * worth a sentence, and a "not this time" is useful to know.
       */
      id: "f_symp", key: "symposium_signup",
      label: "Have you signed up for the 2026 Annual Symposium?",
      type: "choice", required: false, showWhen: [whenEligible],
      options: [
        "Yes — already signed up",
        "Not yet — I plan to",
        "No — I am not attending the Symposium",
      ],
      help: "It runs on Thursday 29 October, the day after Training Week, and it is a separate registration. Most people get more out of the week by doing both.",
    },
    {
      id: "f_pos", key: "primary_position", label: "Primary position",
      type: "choice", required: true, showWhen: [whenEligible],
      help: "Students pick a student option even if they also work with a company. Industry Professional means a member of a private company, not a student.",
      options: [
        "Undergraduate Student", "Master's Student", "PhD Student", "Postdoctoral Fellow",
        "Laboratory Technician / Research Associate", "Faculty Member / Research Staff",
        "Administrative Staff", "Industry Professional", "Entrepreneur / Founder", "Other",
      ],
    },
    {
      id: "f_org", key: "primary_org", label: "Primary organization of engagement",
      type: "choice", required: true, showWhen: [whenEligible],
      help: "Where you mainly work or study. Academia covers faculty, staff and students.",
      options: [
        "Academic Institution", "Industry / Private Sector", "Startup", "Government",
        "Healthcare / Hospital", "Non-Profit", "Entrepreneurial Venture", "Other",
      ],
    },
    {
      id: "f_acad", key: "academic", label: "Academic institution",
      type: "choice", required: false, options: academic, showWhen: [whenEligible],
      help: "Your university or research institute. Leave blank if none.",
    },
    {
      id: "f_health", key: "health", label: "Hospital or health network",
      type: "choice", required: false, options: health, showWhen: [whenEligible],
      help: "Leave blank if none.",
    },
    {
      id: "f_company", key: "company", label: "Company, startup or venture",
      type: "short_text", required: false, options: [], showWhen: [whenEligible],
      help: "Leave blank if none. No list can cover these, so type it as it should appear in reports.",
    },
    {
      id: "f_orgother", key: "org_other", label: "Name your organization",
      type: "short_text", required: true, options: [],
      // Gated explicitly as well as transitively. It can only show once
      // primary_org is answered, and only eligible people are asked
      // that — but "safe because of another field's rule" is an
      // invariant nothing checks, and one missed gate is one question an
      // ineligible person is asked.
      showWhen: [whenEligible, { field: "primary_org", op: "any of", value: "Government,Non-Profit,Other" }],
      help: "As it should appear in reports.",
    },
    {
      id: "f_exp", key: "expertise", label: "Your areas of work",
      type: "multi", required: true, showWhen: [whenEligible],
      options: ["R & D", "QA/QC", "Manufacturing", "Clinical Operations", "Regulatory Affairs",
        "Medical Affairs", "Business Development", "Other"],
    },
    {
      id: "f_diet", key: "dietary", label: "Dietary requirements",
      type: "short_text", required: false, options: [], showWhen: [whenEligible],
      // Blank is ambiguous — it could mean none, or it could mean you
      // had not got to it. Whoever is ordering lunch needs the
      // difference.
      noneLabel: "N/A — no requirements",
      help: "Requirements or allergies, or tick N/A.",
    },
    {
      /*
       * Three answers, because there are three.
       *
       * Yes/No made an existing subscriber pick between implying they
       * want signing up again and implying they do not want it at all.
       */
      id: "f_news", key: "newsletter_optin", label: "Send me the BioHubNet newsletter",
      type: "choice", required: false, showWhen: [whenEligible],
      options: ["Yes, sign me up", "No thanks", "I am already subscribed"],
      help: "Once a month. You can unsubscribe from any issue.",
    },
    {
      /*
       * Stage "confirmation": NOT on the registration form.
       *
       * It goes out by email once a place has been approved, about a
       * week before the session. Asking it on the day somebody signs up
       * gets an answer about a seat they have not been given yet. It
       * lives in the same document so the answer has somewhere to go and
       * the workflow has something to read.
       */
      id: "f_conf", key: "confirmed", label: "Can you still make it?",
      type: "yesno", required: true, options: [], showWhen: [],
      stage: "confirmation",
      help: `Asked by email once your place is approved, about ${CONFIRM_DAYS_BEFORE} days before the session. Yes holds your seat. No releases it to the next person on the waitlist — which is the kind thing to do if you already know you cannot come. No reply by the cut-off is treated as No.`,
    },
  ],
  steps: [
    { id: "w_start", kind: "start", label: "Registration opens", when: [], next: "w_trainee" },
    {
      id: "w_trainee", kind: "check", label: "In a programme, or applied to EQUIP?",
      when: [whenEligible],
      next: "w_roster", otherwise: "w_full",
    },
    { id: "w_roster", kind: "action", label: "Checked against the trainee roster", when: [], next: "w_full",
      note: "A match sets the confirmed-trainee status. Not being found does not stop the registration." },
    {
      id: "w_full", kind: "check", label: "Any chosen session full?",
      when: [{ field: "sessions", op: "answered" }],
      next: "w_elig", otherwise: "w_wait",
    },
    { id: "w_wait", kind: "action", label: "Added to the waitlist", when: [], next: "w_elig" },
    { id: "w_elig", kind: "action", label: "Checked against the eligibility sheet", when: [], next: "w_eligible" },
    {
      /*
       * Tests the SAME condition as w_trainee, deliberately.
       *
       * It briefly tested "bhn_status answered" — which, on a required
       * question, is true for all four answers. That made this check
       * unfailable and "Declined, with a reason" an end nothing could
       * reach: a chart drawing a decision the process never takes.
       */
      id: "w_eligible", kind: "check", label: "In a programme?",
      when: [whenEligible],
      next: "w_seat", otherwise: "w_declined",
    },
    { id: "w_declined", kind: "end", label: "Declined, with a reason", when: [] },
    { id: "w_seat", kind: "action", label: "Place approved, info pack emailed", when: [], next: "w_hold",
      note: "The seat is held from here. Nothing is asked of the registrant yet." },
    { id: "w_hold", kind: "action", label: `Held until ${CONFIRM_DAYS_BEFORE} days before the session`, when: [], next: "w_ask",
      note: "A quiet period. Approval is not attendance, and asking on the day someone is approved gets an answer about a session weeks away." },
    { id: "w_ask", kind: "action", label: "Coordinator sends the confirmation email, in one batch", when: [], next: "w_stillcoming",
      note: "One send to everyone approved for that session, from Admin → Email. Each person is asked to confirm or say they cannot make it." },
    {
      id: "w_stillcoming", kind: "check", label: "Said they can still make it?",
      when: [{ field: "confirmed", op: "is", value: "Yes" }],
      next: "w_attends", otherwise: "w_released",
    },
    { id: "w_attends", kind: "end", label: "Attends", when: [] },
    { id: "w_released", kind: "end", label: "Seat released to the waitlist", when: [] },
  ],
});
