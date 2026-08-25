/**
 * The Industry Insights registration, as a built form.
 *
 * A different event from Training Week and a different shape: virtual,
 * one afternoon, and the choice is ONE company conversation in each of
 * three hours rather than a spread across a week. So the sessions are
 * three separate questions rather than one multi-select on a calendar —
 * "choose one of four each hour" is what the page promises, and three
 * radio groups make double-booking impossible instead of merely warned
 * about.
 *
 * No dietary question, no travel support, no photography terms: nobody
 * is in a room. What it does ask that Training Week does not is what
 * they want to ASK — forty of the sixty minutes is live Q&A, and a
 * registrant who has already written their question is a better
 * session than one put on the spot.
 */
import { INSTITUTIONS } from "@/lib/flowchart/institutions";
import {
  EVENT_SUBTITLE, EVENT_TITLE, HOURS, NOT_THIS_HOUR, optionsForHour, PER_SESSION,
  unconfirmedCount,
} from "@/lib/industry-insights/schedule-2026";
import { BuiltFormSchema, type BuiltForm } from "./types";

export const INDUSTRY_INSIGHTS_SLUG = "industry-insights-2026";

const NOT_LISTED = "My institution is not on the list";

/**
 * The 41. Taken from the same list the Training Week form uses, so a
 * new partner institution appears on both without anybody remembering
 * to add it twice.
 */
const PARTNERS = [...INSTITUTIONS.map((i) => i.name), NOT_LISTED];

export const ROLES = [
  "Master's student",
  "PhD student",
  "Postdoctoral fellow",
  "Research associate",
  "Laboratory technician",
];

export const INDUSTRY_INSIGHTS_FORM: BuiltForm = BuiltFormSchema.parse({
  version: 1,
  sources: [],
  fields: [
    {
      /*
       * The eligibility gate, and it is an institution rather than a
       * yes/no. Asking "are you at a partner institution?" invites a
       * yes from somebody who has not checked, and then the list has to
       * be checked by hand anyway.
       */
      id: "ii_inst", key: "institution",
      label: "Which institution are you at?",
      type: "choice", required: true, options: PARTNERS, showWhen: [],
      help: `Industry Insights is open to STEM highly qualified personnel at one of BioHubNet's ${INSTITUTIONS.length} partner institutions across Canada. Choose yours from the list.`,
    },
    {
      id: "ii_notlisted", key: "not_listed_note", stopsHere: true,
      label: "Industry Insights is only open to our partner institutions.",
      type: "note", required: false, options: [],
      showWhen: [{ field: "institution", op: "is", value: NOT_LISTED }],
      help: "This event is for HQP at one of BioHubNet's partner institutions, so we cannot take a registration from outside that list. If you think your institution should be on it — or you are there under a different name — email the BioHubNet team and they will check. The full list is at biohubnet.ca.",
    },
    {
      id: "ii_role", key: "role", label: "What is your role?",
      type: "choice", required: true, options: [...ROLES, "Other"],
      showWhen: [{ field: "institution", op: "is not", value: NOT_LISTED }],
      help: "The sessions are pitched at people who are about to look for a job in industry, so this tells the speakers who is in the room.",
    },
    {
      id: "ii_name", key: "full_name", label: "Your name",
      type: "short_text", required: true, options: [],
      showWhen: [{ field: "institution", op: "is not", value: NOT_LISTED }],
    },
    {
      id: "ii_email", key: "email", label: "Your email",
      type: "email", required: true, options: [],
      showWhen: [{ field: "institution", op: "is not", value: NOT_LISTED }],
      help: "Where the joining link goes. Use the address you will have open on the day.",
    },
    // One question per hour, built from the schedule so the form cannot
    // drift from the page it is advertised on.
    ...HOURS.map((h) => ({
      id: `ii_h${h.hour}`,
      key: `hour_${h.hour}`,
      label: `${h.label} — which conversation?`,
      type: "choice" as const,
      required: true,
      options: optionsForHour(h.hour),
      showWhen: [{ field: "institution", op: "is not" as const, value: NOT_LISTED }],
      help: `Four companies run at the same time, ${PER_SESSION} people in each, so you can be in one of them. Pick "${NOT_THIS_HOUR}" if you cannot make this hour — you are welcome to come to only one or two.`,
    })),
    {
      /*
       * Forty of the sixty minutes is live Q&A. A registrant who has
       * already written their question makes a better session than one
       * put on the spot, and it gives the speaker something to prepare
       * against.
       */
      id: "ii_q", key: "question_for_panel",
      label: "What would you most like to ask?",
      type: "long_text", required: false, options: [],
      showWhen: [{ field: "institution", op: "is not", value: NOT_LISTED }],
      help: "Optional, and it is the most useful box on this form. Forty minutes of each hour is live Q&A — a question sent ahead is one the speaker can come prepared for.",
    },
    {
      id: "ii_access", key: "accessibility",
      label: "Anything we should know to make this work for you?",
      type: "short_text", required: false, options: [],
      showWhen: [{ field: "institution", op: "is not", value: NOT_LISTED }],
      noneLabel: "N/A — nothing needed",
      help: "Captions, a screen reader, anything else. It is a video call, so we can usually arrange it if we know in advance.",
    },
  ],
  steps: [
    { id: "ii_start", kind: "start", label: "Registration opens", when: [], next: "ii_check" },
    {
      id: "ii_check", kind: "check", label: "At a partner institution?",
      when: [{ field: "institution", op: "is not", value: NOT_LISTED }],
      next: "ii_place", otherwise: "ii_out",
    },
    { id: "ii_out", kind: "end", label: "Not eligible — told which list applies", when: [] },
    {
      id: "ii_place", kind: "action", label: `Placed, ${PER_SESSION} to a conversation`, when: [], next: "ii_full",
      note: "First come, first served within each conversation.",
    },
    {
      id: "ii_full", kind: "check", label: "Their choice still has room?",
      when: [{ field: "hour_1", op: "answered" }],
      next: "ii_in", otherwise: "ii_moved",
    },
    { id: "ii_moved", kind: "action", label: "Offered another company that hour", when: [], next: "ii_in" },
    { id: "ii_in", kind: "end", label: "Joining link sent", when: [] },
  ],
});

/** Said on the form while the line-up is still being confirmed. */
export const stillTbaLine = () => {
  const n = unconfirmedCount();
  return n === 0
    ? null
    : `${n} of the ${EVENT_TITLE} conversations are still being confirmed. ${EVENT_SUBTITLE} runs whatever happens; pick the hour that suits you and we will tell you the company as soon as it is signed.`;
};
