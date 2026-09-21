/**
 * Add a required "Full name" question to the live Training Week
 * registration form (v2), just before the trainee email.
 *
 * The form never asked for a name, so coordinators could only see
 * registrants by email — and the roster's "name" column turned out to be
 * the institution. Same visibility rule as the email question.
 *
 * DRY RUN BY DEFAULT. `.env` points at production. --force writes, after
 * backing the row up to backups/forms/. Idempotent: does nothing if a
 * full_name question is already there.
 *
 * Run: npx tsx scripts/add-registration-full-name.ts [--force]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { REGISTRATION_FORM_SLUG_V2, refuseFrozenForm } from "../src/lib/allocation/symposium-2026";
import { BuiltFormSchema } from "../src/lib/formbuilder/types";

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");
type Field = Record<string, unknown> & { key?: string; showWhen?: unknown[] };

async function main() {
  console.log(FORCE ? "APPLYING.\n" : "DRY RUN — nothing is written. Add --force to apply.\n");
  const row = await prisma.eventForm.findUnique({ where: { slug: REGISTRATION_FORM_SLUG_V2 } });
  if (!row) throw new Error(`No form with slug ${REGISTRATION_FORM_SLUG_V2}`);
  if (FORCE) refuseFrozenForm(row.slug, "add-registration-full-name");

  const doc = JSON.parse(JSON.stringify(row.fields)) as { fields: Field[] };
  if (doc.fields.some((f) => f.key === "full_name")) { console.log("Already has a Full name question — nothing to do."); return; }
  const at = doc.fields.findIndex((f) => f.key === "trainee_email");
  if (at < 0) throw new Error("No trainee_email question to place it beside.");

  const field: Field = {
    id: "f_fullname",
    key: "full_name",
    type: "short_text",
    label: "Full name",
    help: "First and last name, as you would like it on your name badge.",
    slots: [],
    stage: "registration",
    options: [],
    required: true,
    showWhen: JSON.parse(JSON.stringify(doc.fields[at].showWhen ?? [])),
  };
  doc.fields.splice(at, 0, field);
  BuiltFormSchema.parse(doc);
  console.log("Order:", doc.fields.map((f) => f.key).join(" → "));

  if (!FORCE) { console.log("\nNothing written. Re-run with --force to apply."); return; }
  mkdirSync("backups/forms", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backup = `backups/forms/${stamp}-before-full-name-${row.slug}.json`;
  writeFileSync(backup, JSON.stringify(row, null, 2));
  // Only if nobody saved the form since we read it.
  const r = await prisma.eventForm.updateMany({ where: { id: row.id, updatedAt: row.updatedAt }, data: { fields: doc as object } });
  if (r.count !== 1) throw new Error("The form changed while this ran — nothing written; run it again.");
  console.log(`\nBacked up to ${backup}\nWritten.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
