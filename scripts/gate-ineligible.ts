/**
 * Stop the form at question one for people who are not in a programme.
 *
 * The coordinator's decision: an account with no programme, or no
 * account, is told how to join one and the form ends there. It used to
 * show them the note and then the whole rest of the form, ending in
 * "Complete — every required question has an answer", which is the form
 * telling somebody two different things on one screen.
 *
 * Every registration question except question one and the two notes goes
 * behind the eligible condition, and the notes are marked as ending the
 * form.
 *
 * DRY RUN BY DEFAULT. `.env` is production. --force writes; a copy of
 * the current form goes to backups/forms/ first.
 *
 * Run: npx tsx scripts/gate-ineligible.ts [--force]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { REGISTRATION_FORM_SLUG } from "../src/lib/allocation/symposium-2026";
import { ELIGIBLE_STATUS } from "../src/lib/formbuilder/training-week";

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");

interface Condition { field: string; op: string; value?: string }
type Field = Record<string, unknown> & {
  key?: string; type?: string; label?: string; stage?: string;
  showWhen?: Condition[]; stopsHere?: boolean;
};

/** Question one and its two replies stay open to everybody. */
const ALWAYS = new Set(["bhn_status", "need_programme_note", "need_account_note"]);

async function main() {
  console.log(FORCE ? "APPLYING.\n" : "DRY RUN — nothing will be written. Add --force to apply.\n");

  const row = await prisma.eventForm.findUnique({ where: { slug: REGISTRATION_FORM_SLUG } });
  if (!row) throw new Error(`No form with slug ${REGISTRATION_FORM_SLUG}`);
  const doc = row.fields as { fields: Field[]; steps?: Record<string, unknown>[] };

  const eligible: Condition = { field: "bhn_status", op: "any of", value: ELIGIBLE_STATUS.join(",") };
  const has = (f: Field) => (f.showWhen ?? []).some((c) => c.field === "bhn_status" && c.op === "any of");

  const gated: string[] = [];
  const stopped: string[] = [];
  const left: string[] = [];

  for (const f of doc.fields) {
    if (!f.key) continue;
    // Confirmation-stage questions are a different form, sent by email
    // weeks later to somebody who already has a place.
    if ((f.stage ?? "registration") !== "registration") { left.push(`${f.key} (confirmation stage)`); continue; }
    if (ALWAYS.has(f.key)) {
      if (f.type === "note" && !f.stopsHere) { f.stopsHere = true; stopped.push(f.key); }
      continue;
    }
    if (has(f)) { left.push(`${f.key} (already gated)`); continue; }
    f.showWhen = [eligible, ...(f.showWhen ?? [])];
    gated.push(f.key);
  }

  /*
   * The workflow decides too, and it was left testing "bhn_status
   * answered" — true of all four options, so the eligibility check
   * could not fail and every status walked through to "Attends". The
   * questions and the workflow have to agree on who is eligible or the
   * chart is a drawing of a process nobody is running.
   */
  const steps: string[] = [];
  for (const st of doc.steps ?? []) {
    const s2 = st as { id?: string; when?: Condition[] };
    if (!s2.when?.some((c) => c.field === "bhn_status" && c.op === "answered")) continue;
    s2.when = [eligible];
    steps.push(s2.id ?? "?");
  }
  if (steps.length) console.log(`Workflow steps re-pointed at the eligible answers: ${steps.join(", ")}`);

  if (gated.length) console.log(`Behind eligibility (${gated.length}): ${gated.join(", ")}`);
  if (stopped.length) console.log(`Now ends the form: ${stopped.join(", ")}`);
  if (left.length) console.log(`Left alone: ${left.join(", ")}`);
  if (gated.length + stopped.length + steps.length === 0) { console.log("Nothing to change."); return; }

  if (!FORCE) { console.log("\nRe-run with --force to apply."); return; }

  mkdirSync("backups/forms", { recursive: true });
  const file = `backups/forms/${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}-before-gating.json`;
  writeFileSync(file, JSON.stringify(row, null, 2));
  console.log(`\nBacked up to ${file}`);
  await prisma.eventForm.update({ where: { id: row.id }, data: { fields: doc as object } });
  console.log("Applied.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); return prisma.$disconnect().then(() => process.exit(1)); });
