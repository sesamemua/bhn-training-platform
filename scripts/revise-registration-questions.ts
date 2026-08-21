/**
 * Four changes to the live Training Week registration form.
 *
 *   1. Answering "No" to the trainee question now says where to go to
 *      learn about the programmes, instead of moving silently on.
 *   2. The trainee email question says out loud that it is checked
 *      against the trainee list, which is what the workflow does.
 *   3. "Where would you travel from? POSTAL CODE" becomes a question
 *      people can answer without guessing what it is for: is your
 *      travel more than two hours — and only then, the postal code.
 *   4. The newsletter question gains "I am already subscribed", because
 *      the honest answer for an existing subscriber was neither Yes
 *      (which implies signing up again) nor No.
 *
 * SURGICAL and DRY RUN BY DEFAULT. The live form carries the
 * coordinator's own edits — questions deleted, labels rewritten — so
 * this touches only the four things named above and refuses anything it
 * does not recognise. `.env` points at production. Add --force to write;
 * a copy of the current form is saved to backups/forms/ first.
 *
 * Run: npx tsx scripts/revise-registration-questions.ts [--force]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { REGISTRATION_FORM_SLUG } from "../src/lib/allocation/symposium-2026";

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");

interface Condition { field: string; op: string; value?: string }
type Field = Record<string, unknown> & {
  key?: string; type?: string; label?: string; showWhen?: Condition[];
};

const changes: string[] = [];
const skipped: string[] = [];

async function main() {
  console.log(FORCE ? "APPLYING.\n" : "DRY RUN — nothing will be written. Add --force to apply.\n");

  const row = await prisma.eventForm.findUnique({ where: { slug: REGISTRATION_FORM_SLUG } });
  if (!row) throw new Error(`No form with slug ${REGISTRATION_FORM_SLUG}`);

  const doc = row.fields as { fields: Field[]; steps?: Record<string, unknown>[] };
  const at = (key: string) => doc.fields.findIndex((f) => f.key === key);
  const get = (key: string) => doc.fields[at(key)];

  /* 1 ── "No" gets an answer, not silence ─────────────────────────── */
  if (at("trainee") < 0) {
    skipped.push('there is no "trainee" question to hang the guidance off');
  } else if (at("not_trainee_note") >= 0) {
    skipped.push("the guidance note is already there");
  } else {
    // A note rather than help text on the next question: it is a reply
    // to what they just said, and a footnote under a different question
    // is not a reply.
    doc.fields.splice(at("trainee") + 1, 0, {
      id: "f_notrainee",
      key: "not_trainee_note",
      type: "note",
      label: "You can still register — and there is a way in.",
      help:
        "Training Week is open to HQP from our 41 partner institutions, so please carry on. " +
        "Current BioHubNet trainees are considered first, and becoming one is what changes that: " +
        "to learn about ENGAGE, EXPERIENCE and EQUIP, visit biohubnet.ca.",
      required: false,
      options: [],
      slots: [],
      stage: "registration",
      showWhen: [{ field: "trainee", op: "is", value: "No" }],
    });
    changes.push('added the "if No" note pointing at biohubnet.ca');
  }

  /* 2 ── say what happens to the email ────────────────────────────── */
  const email = get("trainee_email");
  if (!email) {
    skipped.push('there is no "trainee_email" question');
  } else {
    email.help =
      "Your institutional email, or the secondary email registered with us. " +
      "We check it against the BioHubNet trainee list to confirm your status — " +
      "it is used for nothing else on this form. If we cannot find it, your " +
      "registration still goes through; it just is not counted as a trainee one.";
    changes.push("trainee_email: says the email is checked against the trainee list");
  }

  /* 3 ── a question people can answer ─────────────────────────────── */
  const travelAt = at("travel_origin");
  if (travelAt < 0) {
    skipped.push('there is no "travel_origin" question to replace');
  } else {
    const old = doc.fields[travelAt];
    // The gating is INHERITED, not decided here. Who sees a question is
    // a policy call; this script was asked to change what it asks.
    const showWhen: Condition[] = old.showWhen ?? [];
    doc.fields.splice(travelAt, 1, {
      id: "f_travel2h",
      key: "travel_over_2h",
      type: "yesno",
      label: "Is your travel time to Toronto more than 2 hours?",
      help:
        "Door to door, one way. If it is, you may qualify for travel assistance — " +
        "we will write to you separately about what is available and what we need from you.",
      required: false,
      options: [],
      slots: [],
      stage: "registration",
      showWhen,
    }, {
      id: "f_postcode",
      key: "postcode",
      type: "short_text",
      label: "Your postal code",
      help: "So we can work out the distance. Nothing else is done with it.",
      required: false,
      options: [],
      slots: [],
      stage: "registration",
      // Asked only of the people it is relevant to. Asking everybody for
      // a postcode to answer a question most of them said no to is how a
      // form gets long for no reason.
      showWhen: [...showWhen, { field: "travel_over_2h", op: "is", value: "Yes" }],
    });
    changes.push(`replaced "${old.label}" with the 2-hour question + postal code`);
  }

  /* 4 ── the third honest answer ──────────────────────────────────── */
  const news = get("newsletter_optin");
  if (!news) {
    skipped.push('there is no "newsletter_optin" question');
  } else {
    news.type = "choice";
    news.options = ["Yes, sign me up", "No thanks", "I am already subscribed"];
    news.help = "Once a month. You can unsubscribe from any issue.";
    changes.push("newsletter: added “I am already subscribed”");
  }

  /* ── report, then maybe write ───────────────────────────────────── */
  console.log(changes.length ? "Changes:" : "Nothing to change.");
  for (const c of changes) console.log(`  • ${c}`);
  if (skipped.length) {
    console.log("\nLeft alone:");
    for (const s of skipped) console.log(`  • ${s}`);
  }

  if (!FORCE) { console.log("\nRe-run with --force to apply."); return; }
  if (changes.length === 0) return;

  mkdirSync("backups/forms", { recursive: true });
  const file = `backups/forms/${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}-before-question-revision.json`;
  writeFileSync(file, JSON.stringify(row, null, 2));
  console.log(`\nBacked up the current form to ${file}`);

  await prisma.eventForm.update({ where: { id: row.id }, data: { fields: doc as object } });
  console.log("Applied.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); return prisma.$disconnect().then(() => process.exit(1)); });
