/**
 * September 2026 pass over the live Training Week registration form (v2):
 *   • the postal-code question moves to the end of the registration step;
 *   • the long help texts and the confirmation note are cut down;
 *   • "Not yet — I plan to register" opens the Symposium page on the click
 *     (openOnSelect, read by FormFillView).
 *
 * The stored document is the authority — coordinators edit it in the builder
 * — so this touches only the keys named below and leaves the rest alone.
 *
 * DRY RUN BY DEFAULT. `.env` points at production. --force writes, backing
 * the current row up to backups/forms/ first.
 *
 * Run: npx tsx scripts/simplify-training-week-questions.ts [--force]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { REGISTRATION_FORM_SLUG_V2, refuseFrozenForm } from "../src/lib/allocation/symposium-2026";
import { BuiltFormSchema } from "../src/lib/formbuilder/types";

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");
const SYMPOSIUM_URL = "https://luma.com/wh30nh1n";
const SYMPOSIUM_LINK = `[BioHubNet 2026 Annual Symposium · Luma](${SYMPOSIUM_URL})`;

type Field = Record<string, unknown> & { key?: string; label?: string; help?: string; stage?: string };
type Doc = { fields: Field[]; presentation?: Record<string, unknown>; [k: string]: unknown };

/** Per question: the shorter label / help, keyed by the field key. */
const COPY: Record<string, { label?: string; help?: string }> = {
  travel_over_2h: {
    help: "If yes, you may be eligible for travel assistance. We will email you the details.",
  },
  postcode: {
    label: "Postal code — first 3 characters",
    help: "For example M5V. Used only to estimate your travel distance.",
  },
  symposium_signup: {
    help: `The Symposium is on Thursday 29 October 2026 and needs its own registration: ${SYMPOSIUM_LINK}\nMost people come to both — the Symposium builds on Training Week.`,
  },
  symposium_link_note: {
    label: "The Symposium page is open in a new tab",
    help: `Register whenever you are ready. It is a separate form, and nothing here waits on it: ${SYMPOSIUM_LINK}`,
  },
  dietary: {
    label: "Dietary requirements for Training Week meals",
    help: "Select all that apply.",
  },
  dietary_other: {
    help: "What you cannot eat, and whether it is an allergy. The caterer is told; severe allergies are handled separately.",
  },
  confirmed: {
    help: "Asked by email about 7 days before your session, once your place is approved. Yes holds your seat; No passes it to the next person on the waitlist. No reply by the cut-off counts as No.",
  },
};

const CONFIRMATION_NOTE =
  "**We will email you with seat offers in the last week of September.** Places are limited, and every registration is read together rather than in the order it arrives — so you will hear from us either way. Nothing by early October? Reply to that email and we will chase it.";

/** Shorter hero facts, matched on their label. */
const FACTS: Record<string, string> = {
  "Who can register": "Training Week is open to HQPs accepted into ENGAGE, EXPERIENCE or EQUIP.",
  "Seat offers": "Choose and rank the sessions you want. We will email seat offers in the last week of September.",
  "Annual Symposium": `The Symposium on 29 October 2026 is a separate event with its own registration: ${SYMPOSIUM_LINK}`,
};

async function main() {
  console.log(FORCE ? "APPLYING.\n" : "DRY RUN — nothing is written. Add --force to apply.\n");

  const row = await prisma.eventForm.findUnique({ where: { slug: REGISTRATION_FORM_SLUG_V2 } });
  if (!row) throw new Error(`No form with slug ${REGISTRATION_FORM_SLUG_V2}`);
  if (FORCE) refuseFrozenForm(row.slug, "simplify-training-week-questions");

  const doc = JSON.parse(JSON.stringify(row.fields)) as Doc;
  const changes: string[] = [];
  const field = (key: string) => doc.fields.find((f) => f.key === key);

  for (const [key, copy] of Object.entries(COPY)) {
    const f = field(key);
    if (!f) { console.log(`  ! no field with key ${key} — skipped`); continue; }
    for (const [prop, text] of Object.entries(copy) as ["label" | "help", string][]) {
      if (f[prop] === text) continue;
      changes.push(`${key}.${prop}:\n    was: ${String(f[prop] ?? "")}\n    now: ${text}`);
      f[prop] = text;
    }
  }

  // Picking "Not yet" opens the Symposium page.
  const symp = field("symposium_signup");
  const later = (symp?.options as string[] | undefined)?.find((o) => /^not yet/i.test(o));
  if (symp && later) {
    const map = { [later]: SYMPOSIUM_URL };
    if (JSON.stringify(symp.openOnSelect) !== JSON.stringify(map)) {
      symp.openOnSelect = map;
      changes.push(`symposium_signup.openOnSelect: "${later}" → ${SYMPOSIUM_URL}`);
    }
  }

  // Postal code goes last among the registration questions.
  const code = field("postcode");
  if (code) {
    const rest = doc.fields.filter((f) => f !== code);
    const lastReg = rest.reduce((at, f, i) => (f.stage === code.stage ? i : at), -1);
    const next = [...rest.slice(0, lastReg + 1), code, ...rest.slice(lastReg + 1)];
    if (next.map((f) => f.key).join() !== doc.fields.map((f) => f.key).join()) {
      doc.fields = next;
      changes.push(`postcode moved to the end of the ${code.stage} step`);
    }
  }

  const look = doc.presentation;
  if (look) {
    if (look.confirmationNote !== CONFIRMATION_NOTE) {
      changes.push(`presentation.confirmationNote:\n    was: ${String(look.confirmationNote ?? "")}\n    now: ${CONFIRMATION_NOTE}`);
      look.confirmationNote = CONFIRMATION_NOTE;
    }
    for (const fact of (look.facts as { label?: string; text?: string }[] | undefined) ?? []) {
      const text = fact.label ? FACTS[fact.label] : undefined;
      if (!text || fact.text === text) continue;
      changes.push(`fact "${fact.label}":\n    was: ${fact.text}\n    now: ${text}`);
      fact.text = text;
    }
  }

  BuiltFormSchema.parse(doc);
  console.log(`Field order: ${doc.fields.map((f) => f.key).join(" → ")}\n`);
  if (changes.length === 0) { console.log("Nothing to change."); return; }
  console.log(`${changes.length} change(s):`);
  for (const c of changes) console.log(`  · ${c}`);

  if (!FORCE) { console.log("\nNothing written. Re-run with --force to apply."); return; }

  mkdirSync("backups/forms", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backup = `backups/forms/${stamp}-before-simplify-${row.slug}.json`;
  writeFileSync(backup, JSON.stringify(row, null, 2));
  console.log(`\nBacked up to ${backup}`);
  await prisma.eventForm.update({ where: { id: row.id }, data: { fields: doc as object } });
  console.log("Written.");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
