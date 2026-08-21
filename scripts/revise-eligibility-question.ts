/**
 * The second round of question changes on the live registration form.
 *
 *   1. Question 1 stops being yes/no. Three different people were
 *      answering No — an accepted trainee, somebody with an account but
 *      no programme, and somebody who had never heard of us — and the
 *      form told all three the same thing.
 *   2. EQUIP applicants count, funded or not. Applying is the
 *      qualification; gating on an award would shut out the people
 *      Training Week is for.
 *   3. Two different notes for the two answers that have a step to take
 *      first, because the step is not the same step.
 *   4. A question about the Symposium, which is a separate registration.
 *   5. "N/A" as an answer on dietary requirements, so a blank stops
 *      meaning either "none" or "not filled in yet".
 *   6. Photography consent stops being a question and becomes a
 *      condition of submitting.
 *
 * SURGICAL and DRY RUN BY DEFAULT. `.env` is production. --force writes,
 * and a copy of the current form is saved to backups/forms/ first.
 *
 * Run: npx tsx scripts/revise-eligibility-question.ts [--force]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { REGISTRATION_FORM_SLUG } from "../src/lib/allocation/symposium-2026";
import {
  BHN_STATUS_OPTIONS, ELIGIBLE_STATUS, HAS_ACCOUNT, NO_ACCOUNT, TRAINING_WEEK_FORM,
} from "../src/lib/formbuilder/training-week";

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");

interface Condition { field: string; op: string; value?: string }
type Field = Record<string, unknown> & { key?: string; type?: string; label?: string; showWhen?: Condition[] };

const changes: string[] = [];
const skipped: string[] = [];

/** Copy one question's wording across from the code definition. */
const fromCode = (key: string) => {
  const f = TRAINING_WEEK_FORM.fields.find((x) => x.key === key);
  if (!f) throw new Error(`No ${key} in the code definition`);
  return JSON.parse(JSON.stringify(f)) as Field;
};

async function main() {
  console.log(FORCE ? "APPLYING.\n" : "DRY RUN — nothing will be written. Add --force to apply.\n");

  const row = await prisma.eventForm.findUnique({ where: { slug: REGISTRATION_FORM_SLUG } });
  if (!row) throw new Error(`No form with slug ${REGISTRATION_FORM_SLUG}`);
  const doc = row.fields as { fields: Field[]; steps?: Record<string, unknown>[]; submitNote?: string };
  const at = (key: string) => doc.fields.findIndex((f) => f.key === key);

  /* 1 ── question one ─────────────────────────────────────────────── */
  const q1 = at("trainee") >= 0 ? doc.fields[at("trainee")] : null;
  if (!q1) {
    skipped.push('there is no "trainee" question to rewrite');
  } else {
    q1.key = "bhn_status";
    q1.type = "choice";
    q1.label = "Where do you stand with BioHubNet?";
    q1.options = BHN_STATUS_OPTIONS;
    q1.help = fromCode("bhn_status").help;
    changes.push("question 1 is now a four-way status, EQUIP applicants included");

    // Every rule that tested the old yes/no has to move with it, or it
    // quietly stops matching and the questions behind it never show.
    const eligible: Condition = { field: "bhn_status", op: "any of", value: ELIGIBLE_STATUS.join(",") };
    let rewired = 0;
    for (const f of doc.fields) {
      if (!f.showWhen) continue;
      f.showWhen = f.showWhen.map((c) => {
        if (c.field !== "trainee") return c;
        rewired += 1;
        return c.value === "Yes" ? eligible : { ...c, field: "bhn_status" };
      });
    }
    for (const st of doc.steps ?? []) {
      const when = (st as { when?: Condition[] }).when ?? [];
      (st as { when?: Condition[] }).when = when.map((c) =>
        c.field === "trainee" ? (rewired++, eligible) : c);
    }
    if (rewired) changes.push(`re-pointed ${rewired} rule${rewired === 1 ? "" : "s"} from "trainee" to "bhn_status"`);

    /* 3 ── one note per situation ─────────────────────────────────── */
    const old = at("not_trainee_note");
    if (old >= 0) { doc.fields.splice(old, 1); changes.push("replaced the single No note"); }
    if (at("need_programme_note") < 0 && at("need_account_note") < 0) {
      doc.fields.splice(at("bhn_status") + 1, 0, fromCode("need_programme_note"), fromCode("need_account_note"));
      changes.push("added a note for “account but no programme” and one for “no account”");
    }
  }

  /* 4 ── the Symposium ────────────────────────────────────────────── */
  if (at("symposium_signup") >= 0) {
    skipped.push("the Symposium question is already there");
  } else {
    const after = at("sessions");
    doc.fields.splice(after >= 0 ? after + 1 : doc.fields.length, 0, fromCode("symposium_signup"));
    changes.push("added the Symposium sign-up question");
  }

  /* 5 ── N/A on the open-text questions ───────────────────────────── */
  for (const [key, none] of [["dietary", "N/A — no requirements"], ["question", "N/A — none"]] as const) {
    const i = at(key);
    if (i < 0) continue;
    if (doc.fields[i].noneLabel) continue;
    doc.fields[i].noneLabel = none;
    changes.push(`${doc.fields[i].label}: added a “${none}” option`);
  }

  /* 6 ── consent becomes a condition of submitting ────────────────── */
  const consent = at("media_consent");
  if (consent < 0 && doc.submitNote) {
    skipped.push("photography consent is already the submit terms");
  } else {
    doc.submitNote = TRAINING_WEEK_FORM.submitNote;
    if (consent >= 0) {
      doc.fields.splice(consent, 1);
      changes.push("photography consent is no longer a question — it is now the terms beside Submit");
    } else {
      changes.push("added the photography terms beside Submit");
    }
    // A workflow step reading a question nobody is asked can never pass.
    for (const st of doc.steps ?? []) {
      const when = (st as { when?: Condition[] }).when ?? [];
      (st as { when?: Condition[] }).when = when.map((c) =>
        c.field === "media_consent" ? { field: "bhn_status", op: "answered" } : c);
    }
  }

  console.log(changes.length ? "Changes:" : "Nothing to change.");
  for (const c of changes) console.log(`  • ${c}`);
  if (skipped.length) {
    console.log("\nLeft alone:");
    for (const s of skipped) console.log(`  • ${s}`);
  }

  if (!FORCE || changes.length === 0) {
    if (!FORCE && changes.length) console.log("\nRe-run with --force to apply.");
    return;
  }

  mkdirSync("backups/forms", { recursive: true });
  const file = `backups/forms/${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}-before-eligibility-revision.json`;
  writeFileSync(file, JSON.stringify(row, null, 2));
  console.log(`\nBacked up the current form to ${file}`);

  await prisma.eventForm.update({ where: { id: row.id }, data: { fields: doc as object } });
  console.log("Applied.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); return prisma.$disconnect().then(() => process.exit(1)); });
