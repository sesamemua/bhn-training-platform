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
  fields: [
    {
      id: "f_trainee", key: "trainee", label: "Are you a current BioHubNet trainee?",
      type: "yesno", required: true, options: [], showWhen: [],
      help: "A current trainee has been accepted into ENGAGE, EXPERIENCE or EQUIP. Having an account on the BioHubNet training platform is not the same thing — if you registered but were not accepted into a programme, answer No. Current trainees get priority consideration for Training Week places.",
    },
    {
      id: "f_tname", key: "trainee_name", label: "The name we know you by",
      type: "short_text", required: true, options: [],
      showWhen: [{ field: "trainee", op: "is", value: "Yes" }],
      help: "Your name as it appears on your BioHubNet record. Give that one even if you go by something else now.",
    },
    {
      id: "f_temail", key: "trainee_email", label: "The email registered with BioHubNet",
      type: "email", required: true, options: [],
      showWhen: [{ field: "trainee", op: "is", value: "Yes" }],
      help: "Your institutional email, or the secondary email registered with us. It is checked against the trainee roster and used for nothing else on this form.",
    },
    {
      id: "f_prog", key: "bhn_programs", label: "Which programmes are you in?",
      type: "multi", required: false, options: ["ENGAGE", "EXPERIENCE", "EQUIP"],
      showWhen: [{ field: "trainee", op: "is", value: "Yes" }],
    },
    {
      id: "f_travel", key: "travel_origin", label: "Where would you travel from?",
      type: "short_text", required: false, options: [],
      showWhen: [{ field: "trainee", op: "is", value: "Yes" }],
      help: "City or town, if you need travel support. Subject to approval.",
    },
    { id: "f_first", key: "first_name", label: "First name", type: "short_text", required: true, options: [], showWhen: [] },
    { id: "f_last", key: "last_name", label: "Last name", type: "short_text", required: true, options: [], showWhen: [] },
    {
      id: "f_email", key: "email", label: "Email", type: "email", required: true, options: [], showWhen: [],
      help: "How the coordinator will reach you about Training Week.",
    },
    { id: "f_phone", key: "phone", label: "Phone", type: "phone", required: false, options: [], showWhen: [], help: "Optional." },
    { id: "f_li", key: "linkedin", label: "LinkedIn", type: "short_text", required: false, options: [], showWhen: [], help: "Optional." },
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
      type: "multi", required: true, options: SESSIONS_2026, showWhen: [],
      approveFromClash: 1,
      slots: SESSION_SLOTS,
      help: `Pick the ones you want to attend — up to ${MAX_SESSIONS}. Sessions drawn side by side in the calendar run at the same time: you may choose both, but only one of a clashing pair can be approved. The two Monday company tours run back to back, so you can do both.`,
    },
    {
      id: "f_pos", key: "primary_position", label: "Primary position",
      type: "choice", required: true, showWhen: [],
      help: "Students pick a student option even if they also work with a company. Industry Professional means a member of a private company, not a student.",
      options: [
        "Undergraduate Student", "Master's Student", "PhD Student", "Postdoctoral Fellow",
        "Laboratory Technician / Research Associate", "Faculty Member / Research Staff",
        "Administrative Staff", "Industry Professional", "Entrepreneur / Founder", "Other",
      ],
    },
    {
      id: "f_org", key: "primary_org", label: "Primary organization of engagement",
      type: "choice", required: true, showWhen: [],
      help: "Where you mainly work or study. Academia covers faculty, staff and students.",
      options: [
        "Academic Institution", "Industry / Private Sector", "Startup", "Government",
        "Healthcare / Hospital", "Non-Profit", "Entrepreneurial Venture", "Other",
      ],
    },
    {
      id: "f_acad", key: "academic", label: "Academic institution",
      type: "choice", required: false, options: academic, showWhen: [],
      help: "Your university or research institute. Leave blank if none.",
    },
    {
      id: "f_health", key: "health", label: "Hospital or health network",
      type: "choice", required: false, options: health, showWhen: [],
      help: "Leave blank if none.",
    },
    {
      id: "f_company", key: "company", label: "Company, startup or venture",
      type: "short_text", required: false, options: [], showWhen: [],
      help: "Leave blank if none. No list can cover these, so type it as it should appear in reports.",
    },
    {
      id: "f_orgother", key: "org_other", label: "Name your organization",
      type: "short_text", required: true, options: [],
      showWhen: [{ field: "primary_org", op: "any of", value: "Government,Non-Profit,Other" }],
      help: "As it should appear in reports.",
    },
    {
      id: "f_exp", key: "expertise", label: "Your areas of work",
      type: "multi", required: true, showWhen: [],
      options: ["R & D", "QA/QC", "Manufacturing", "Clinical Operations", "Regulatory Affairs",
        "Medical Affairs", "Business Development", "Other"],
    },
    {
      id: "f_diet", key: "dietary", label: "Dietary requirements",
      type: "short_text", required: false, options: [], showWhen: [],
      help: "Requirements or allergies. Blank if none.",
    },
    { id: "f_news", key: "newsletter_optin", label: "Send me the BioHubNet newsletter", type: "yesno", required: false, options: [], showWhen: [] },
    {
      /*
       * One box, and ticking it IS the agreement.
       *
       * A Yes/No pair invites a No that the form then has to refuse,
       * which is a worse conversation than saying up front that
       * agreeing is part of registering. The wording is written to be
       * understood rather than to be legally impressive: what will be
       * recorded, where it can end up, how long it lasts, and what to
       * do if you are not comfortable.
       */
      id: "f_media", key: "media_consent",
      label: "I agree to be photographed and filmed at Training Week, and to BioHubNet using those pictures and recordings to promote its programmes.",
      type: "consent", required: true, options: [], showWhen: [],
      help: "What this means in practice: there will be a photographer and a video crew at the sessions. Pictures and footage that include you may appear on the BioHubNet website, on its social media, in newsletters, in reports to funders, and in printed material. They can be seen by anyone and may stay online indefinitely. You are giving this permission free of charge. Ticking the box is required to register — if you would rather not be filmed, please contact the coordinator before you register and they will talk it through with you.",
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
      id: "w_trainee", kind: "check", label: "Says they are a current trainee?",
      when: [{ field: "trainee", op: "is", value: "Yes" }],
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
      id: "w_eligible", kind: "check", label: "Eligible?",
      when: [{ field: "media_consent", op: "is", value: "Yes" }],
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
