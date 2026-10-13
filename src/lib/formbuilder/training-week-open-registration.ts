import { REGISTRATION_FORM_SLUG_V2 } from "@/lib/allocation/symposium-2026";
import { BuiltFormSchema, type BuiltForm, type Condition } from "./types";
import { V2_ACCEPTED, V2_EQUIP_APPLIED, V2_HAS_ACCOUNT, V2_NO_ACCOUNT } from "./training-week-v2";

export const OPEN_TRAINING_WEEK_COPY = "Training Week events are free and open to STEM graduate students, postdoctoral fellows, research associates and technicians. Seats are prioritized for participants who have been accepted into a BioHubNet program (ENGAGE, EXPERIENCE) or applied for an EQUIP award.";
export const OPEN_TRAINING_WEEK_OPTIONS = [V2_ACCEPTED, V2_EQUIP_APPLIED, V2_NO_ACCOUNT];

/** Apply the October policy to the current stored form without rebuilding coordinator edits. */
export function openTrainingWeekRegistration(slug: string, raw: unknown): BuiltForm {
  if (slug !== REGISTRATION_FORM_SLUG_V2) throw new Error("Only the current Training Week v2 form may be revised.");
  BuiltFormSchema.parse(raw);
  const doc = structuredClone(raw) as BuiltForm;
  const status = doc.fields.find((f) => f.key === "bhn_status");
  if (!status || !OPEN_TRAINING_WEEK_OPTIONS.every((o) => status.options.includes(o))
    || status.options.some((o) => ![...OPEN_TRAINING_WEEK_OPTIONS, V2_HAS_ACCOUNT].includes(o))) {
    throw new Error("Unrecognized program-status question; review the live form before updating it.");
  }
  const openCondition = (c: Condition): Condition => {
    if (c.field !== "bhn_status") return c;
    const values = c.value?.split(",") ?? [];
    if (c.op !== "any of" || ![V2_ACCEPTED, V2_EQUIP_APPLIED].every((o) => values.includes(o))
      || values.some((o) => !OPEN_TRAINING_WEEK_OPTIONS.includes(o))) {
      throw new Error("Unexpected program-status condition; refusing to widen an unrelated rule.");
    }
    return { ...c, value: OPEN_TRAINING_WEEK_OPTIONS.join(",") };
  };
  status.help = OPEN_TRAINING_WEEK_COPY;
  status.options = [...OPEN_TRAINING_WEEK_OPTIONS];
  doc.fields = doc.fields.filter((f) => !["need_programme_note", "need_account_note"].includes(f.key))
    .map((f) => ({ ...f, showWhen: f.showWhen.map(openCondition) }));
  const email = doc.fields.find((f) => f.key === "trainee_email");
  if (!email || !doc.fields.some((f) => f.key === "sessions")) throw new Error("Missing email or session question.");
  email.label = "Email address";
  email.help = "Please enter your institutional email address, or the email address registered with BioHubNet if you have one.";
  // The roster branch still identifies priority applicants; it is not a registration gate.
  doc.steps = doc.steps.map((s) => s.id === "w_eligible"
    ? { ...s, label: "Registration open to this participant?", when: s.when.map(openCondition) } : s);
  if (doc.presentation?.facts) {
    doc.presentation.facts = doc.presentation.facts.map((f) => f.label === "Who can register" ? { ...f, text: OPEN_TRAINING_WEEK_COPY } : f);
  }
  if (JSON.stringify(doc).includes(V2_HAS_ACCOUNT)) throw new Error("An account-only rule remains in the form.");
  BuiltFormSchema.parse(doc);
  return doc;
}
