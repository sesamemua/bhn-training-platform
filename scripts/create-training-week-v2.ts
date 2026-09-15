/**
 * Create the v2 Training Week registration form from the live v1 row —
 * or, with --replace, rebuild the existing v2 in place.
 *
 * DRY RUN BY DEFAULT, in both modes. `.env` points at the production
 * database. Without --apply this reads, builds and prints. Nothing is
 * written.
 *
 * CREATE (the default). With --apply it inserts ONE EventForm row, and
 * only while the v2 slug is free. If v2 already exists it refuses: a
 * coordinator may have edited it in the builder since, and a script that
 * overwrites a hand-edited form has already destroyed somebody's
 * afternoon once.
 *
 * REPLACE (--replace). For a correction to v2 after it was created, while
 * nobody has registered on it. It builds v2 from the live v1 exactly as
 * create does, prints what would change ON v2 (current → rebuilt), and
 * with --apply updates ONLY v2's title, description and questions:
 *   - it refuses if v2 has ANY submission. An answer was given to the
 *     question as it was worded then, so from the first registration v2
 *     is frozen too and a correction is a v3;
 *   - it never opens or closes the form. `active` is not in the write;
 *   - the current v2 row goes to backups/forms/ before the write;
 *   - the write only lands if v2 is unchanged and still empty since it
 *     was read, so a builder save or a registration in between refuses
 *     instead of being overwritten.
 *
 * PRESENTATION (--presentation). For the page's look and the words around
 * the questions — heading, hero facts, buttons, header link, thank-you
 * note — on a v2 people may already have registered on. It prints v2's
 * presentation as stored → as built, and with --apply rewrites ONLY the
 * `presentation` key inside v2's stored document:
 *   - allowed with submissions, unlike --replace: the presentation changes
 *     no question, option or rule, so every answer still means what it
 *     meant when it was given;
 *   - every other byte of the document is written back as it was read,
 *     questions included, even where they differ from this build (a
 *     coordinator's builder edit stays); title, description and `active`
 *     are not in the write;
 *   - the v2 row goes to backups/forms/ first, and the write only lands if
 *     v2 is unchanged since it was read.
 *
 * v1 IS NEVER WRITTEN. There is no update against it anywhere in this
 * file. On every run it is fingerprinted before and after — if v1
 * changed while this ran, for whatever reason, it says so loudly and
 * exits non-zero. Create also backs it up first.
 *
 * Run: npx tsx scripts/create-training-week-v2.ts [--replace | --presentation] [--apply]
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { Prisma, PrismaClient, type EventForm } from "@prisma/client";
import {
  REGISTRATION_FORM_SLUG, REGISTRATION_FORM_SLUG_V2, refuseFrozenForm,
} from "../src/lib/allocation/symposium-2026";
import { buildTrainingWeekV2, canon, v2Problems, type TrainingWeekV2 } from "../src/lib/formbuilder/training-week-v2";
import {
  parseForm, type BuiltForm, type Condition, type FormField, type Presentation, type WorkflowStep,
} from "../src/lib/formbuilder/types";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const REPLACE = process.argv.includes("--replace");
const PRESENTATION = process.argv.includes("--presentation");
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

/**
 * Everything about v1 a person could notice changing.
 *
 * updatedAt is in it deliberately: an update that wrote back identical
 * JSON still bumps it, and "something wrote to v1" is the thing to catch,
 * whether or not the words moved.
 */
const fingerprint = (row: Pick<EventForm, "title" | "description" | "fields" | "active" | "updatedAt">) =>
  createHash("sha256")
    .update(canon({
      title: row.title, description: row.description, fields: row.fields,
      active: row.active, updatedAt: row.updatedAt.toISOString(),
    }))
    .digest("hex");

const readV1 = () => prisma.eventForm.findUnique({ where: { slug: REGISTRATION_FORM_SLUG } });

/* ── the readable summary ───────────────────────────────────────────── */

const text = (s: string | undefined | null) => (s === undefined || s === null ? "—" : `"${s.replace(/\n/g, " ¶ ")}"`);
/** Any value, said once: strings as text, everything else as key-order-free JSON. */
const show = (v: unknown) => (v === undefined ? "—" : typeof v === "string" ? text(v) : canon(v));
const rule = (c: Condition) => `${c.field} ${c.op}${c.value !== undefined ? ` "${c.value}"` : ""}`;
const rules = (cs: Condition[]) => (cs.length ? cs.map(rule).join("  AND  ") : "always");

function pair(lines: string[], name: string, before: string, after: string) {
  if (before === after) return;
  lines.push(`    ${name.padEnd(13)} ${before}`);
  lines.push(`    ${"".padEnd(13)} → ${after}`);
}

/** A presentation value as a person reads it: a fact as label: text, a button or link as label → href. */
function showLook(v: unknown): string {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (typeof o.label === "string" && typeof o.text === "string") return `${o.label}: ${text(o.text)}`;
    if (typeof o.label === "string" && typeof o.href === "string") return `${o.label} → ${o.href}`;
  }
  return show(v);
}

/**
 * The presentation, key by key, before → after. Returns the keys that did
 * not move, so a caller can say so rather than leave the reader guessing
 * whether a missing line means "same" or "forgotten".
 */
function lookLines(out: string[], before: Presentation | undefined, after: Presentation | undefined): string[] {
  const a = (before ?? {}) as Record<string, unknown>;
  const b = (after ?? {}) as Record<string, unknown>;
  const same: string[] = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const start = out.length;
    if (Array.isArray(a[k]) || Array.isArray(b[k])) {
      // One line per paragraph, fact or button, so a one-word change is
      // one pair to read rather than the whole array twice.
      const as = (a[k] ?? []) as unknown[];
      const bs = (b[k] ?? []) as unknown[];
      for (let i = 0; i < Math.max(as.length, bs.length); i++) pair(out, `${k}[${i}]`, showLook(as[i]), showLook(bs[i]));
    } else {
      pair(out, k, showLook(a[k]), showLook(b[k]));
    }
    if (out.length === start) same.push(k);
  }
  return same;
}

/** The document minus its presentation: everything an answer was given to. */
const questionsOf = (doc: BuiltForm) => {
  const { presentation: _look, ...rest } = doc;
  return rest;
};

/**
 * Question keys worded below. Anything else a question carries (a cap,
 * stopsHere, …) is still compared, as JSON — a diff that only lists the
 * properties somebody thought of is how a change ships unannounced.
 */
const WORDED = new Set([
  "id", "key", "type", "stage", "label", "help", "required", "options", "showWhen",
  "exclusiveOption", "slots", "cannotCombine",
]);

function describeQuestion(n: number, a: FormField, b: FormField): string[] {
  const lines: string[] = [];
  pair(lines, "id", a.id, b.id);
  pair(lines, "type", a.type, b.type);
  pair(lines, "stage", a.stage, b.stage);
  pair(lines, "label", text(a.label), text(b.label));
  pair(lines, "help", text(a.help), text(b.help));
  pair(lines, "required", String(a.required), String(b.required));
  pair(lines, "options", a.options.map((o) => `"${o}"`).join(" | ") || "—", b.options.map((o) => `"${o}"`).join(" | ") || "—");
  pair(lines, "shown when", rules(a.showWhen), rules(b.showWhen));
  pair(lines, "exclusive", text(a.exclusiveOption), text(b.exclusiveOption));
  const slot = (s: FormField["slots"][number]) =>
    `${s.day} ${s.start}–${s.end}${s.capacity !== undefined ? ` · up to ${s.capacity}` : ""} · "${s.option}"`;
  for (let i = 0; i < Math.max(a.slots.length, b.slots.length); i++) {
    pair(lines, `slot ${i + 1}`, a.slots[i] ? slot(a.slots[i]) : "—", b.slots[i] ? slot(b.slots[i]) : "—");
  }
  const clashA = a.cannotCombine ?? [];
  const clashB = b.cannotCombine ?? [];
  for (let i = 0; i < Math.max(clashA.length, clashB.length); i++) {
    pair(lines, "can't combine", clashA[i] ? text(clashA[i].reason) : "—", clashB[i] ? text(clashB[i].reason) : "—");
    pair(lines, "  its options", show(clashA[i]?.options), show(clashB[i]?.options));
  }
  const rest = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => !WORDED.has(k)));
  for (const k of rest) {
    pair(lines, k, show((a as Record<string, unknown>)[k]), show((b as Record<string, unknown>)[k]));
  }
  const head = `  Q${n} ${b.key} (${b.type}${b.required ? ", required" : ""}${b.stage === "confirmation" ? ", confirmation stage" : ""})`;
  return lines.length ? [head, ...lines] : [`${head} — unchanged`];
}

function summary(v1: EventForm, v1Doc: BuiltForm, v2: TrainingWeekV2): string[] {
  const out: string[] = [];
  out.push("The form:");
  pair(out, "slug", REGISTRATION_FORM_SLUG, v2.slug);
  pair(out, "title", text(v1.title), text(v2.title));
  pair(out, "description", text(v1.description), text(v2.description));
  pair(out, "active", String(v1.active), "true");
  pair(out, "submit note", text(v1Doc.submitNote), text(v2.doc.submitNote));
  pair(out, "presentation", "— (renders as every other form)", JSON.stringify(v2.doc.presentation));

  out.push("", "Question by question (v1 → v2):");
  v2.doc.fields.forEach((f, i) => {
    const was = v1Doc.fields.find((x) => x.key === f.key);
    if (!was) throw new Error(`v2 question ${f.key} has no v1 counterpart — the build should have refused.`);
    out.push(...describeQuestion(i + 1, was, f));
  });

  const moved = v2.doc.steps.filter((s) => {
    const was = v1Doc.steps.find((x) => x.id === s.id);
    return !was || canon(was.when) !== canon(s.when);
  });
  out.push("", `Workflow: ${v2.doc.steps.length} steps, same ids and routes as v1; ${moved.length} rule${moved.length === 1 ? "" : "s"} renamed.`);
  for (const s of moved) {
    const was = v1Doc.steps.find((x) => x.id === s.id)!;
    pair(out, s.id, rules(was.when), rules(s.when));
  }
  return out;
}

/**
 * What --replace would change on v2: the row as it is now → the rebuild.
 *
 * Measured against v2 as stored, not against v1. The v1 → v2 story was
 * told when v2 was created; the question now is what a registrant on v2
 * would see move.
 */
function replaceSummary(now: EventForm, nowDoc: BuiltForm, v2: TrainingWeekV2): string[] {
  const out: string[] = [];
  const next = v2.doc;
  out.push("The form (v2 now → rebuilt):");
  pair(out, "title", text(now.title), text(v2.title));
  pair(out, "description", text(now.description), text(v2.description));
  pair(out, "submit note", text(nowDoc.submitNote), text(next.submitNote));
  lookLines(out, nowDoc.presentation, next.presentation);
  pair(out, "sources", show(nowDoc.sources), show(next.sources));
  out.push(`    ${"active".padEnd(13)} ${now.active} — kept; --replace never opens or closes a form`);

  out.push("", "Question by question (v2 now → rebuilt):");
  const order = (d: BuiltForm) => d.fields.map((f) => f.key).join(", ");
  pair(out, "order", order(nowDoc), order(next));
  next.fields.forEach((f, i) => {
    const was = nowDoc.fields.find((x) => x.key === f.key);
    out.push(...(was ? describeQuestion(i + 1, was, f) : [`  Q${i + 1} ${f.key} (${f.type}) — ADDED`]));
  });
  for (const f of nowDoc.fields) {
    if (!next.fields.some((x) => x.key === f.key)) out.push(`  ${f.key} (${f.type}) — REMOVED`);
  }

  const stepLines: string[] = [];
  const describeStep = (a: WorkflowStep, b: WorkflowStep) => {
    const lines: string[] = [];
    pair(lines, "kind", a.kind, b.kind);
    pair(lines, "label", text(a.label), text(b.label));
    pair(lines, "when", rules(a.when), rules(b.when));
    pair(lines, "next", show(a.next), show(b.next));
    pair(lines, "otherwise", show(a.otherwise), show(b.otherwise));
    pair(lines, "note", text(a.note), text(b.note));
    return lines;
  };
  for (const s of next.steps) {
    const was = nowDoc.steps.find((x) => x.id === s.id);
    if (!was) { stepLines.push(`  step ${s.id} — ADDED`); continue; }
    const lines = describeStep(was, s);
    if (lines.length) stepLines.push(`  step ${s.id}`, ...lines);
  }
  for (const s of nowDoc.steps) {
    if (!next.steps.some((x) => x.id === s.id)) stepLines.push(`  step ${s.id} — REMOVED`);
  }
  out.push("", `Workflow: ${next.steps.length} steps${stepLines.length ? ":" : " — unchanged."}`, ...stepLines);
  return out;
}

/* ── create ─────────────────────────────────────────────────────────── */

async function create(v1: EventForm, v1Doc: BuiltForm, v2: TrainingWeekV2) {
  for (const line of summary(v1, v1Doc, v2)) console.log(line);
  console.log(`\nChecks: ${v2Problems(v1Doc, v2.doc).length} problems (schema, parse round trip, keys, rules, sessions → Workshops).`);

  const existing = await prisma.eventForm.findUnique({
    where: { slug: REGISTRATION_FORM_SLUG_V2 },
    select: { id: true, fields: true, updatedAt: true, active: true, _count: { select: { submissions: true } } },
  });
  if (existing) {
    const same = canon(parseForm(existing.fields)) === canon(v2.doc);
    const said =
      `v2 (${REGISTRATION_FORM_SLUG_V2}) already exists — id ${existing.id}, ` +
      `updated ${existing.updatedAt.toISOString()}, ${existing.active ? "active" : "retired"}, ` +
      `${existing._count.submissions} submission${existing._count.submissions === 1 ? "" : "s"}; ` +
      `${same ? "its document matches this build" : "its document DIFFERS from this build (edited since, or the build changed)"}.`;
    if (APPLY) throw new Error(`Refusing to create: ${said} It is never overwritten by create — see --replace.`);
    console.log(`\n${said}\n--apply would refuse. To rebuild it in place while it has no registrations: --replace.`);
    return;
  }

  if (!APPLY) {
    console.log(`\nWould create EventForm ${REGISTRATION_FORM_SLUG_V2} (active), public at /apply/${REGISTRATION_FORM_SLUG_V2}.`);
    console.log("Re-run with --apply to create it.");
    return;
  }

  mkdirSync("backups/forms", { recursive: true });
  const file = `backups/forms/${stamp()}-before-create-v2-${REGISTRATION_FORM_SLUG}.json`;
  writeFileSync(file, JSON.stringify(v1, null, 2));
  console.log(`\nBacked up v1 → ${file}`);

  let id: string;
  try {
    // create, never upsert: an upsert is an overwrite with better manners.
    ({ id } = await prisma.eventForm.create({
      data: {
        slug: v2.slug, title: v2.title, description: v2.description, active: true,
        fields: v2.doc as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    }));
  } catch (err) {
    // The slug was free a moment ago. Somebody else got there first.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error(`Refusing: ${REGISTRATION_FORM_SLUG_V2} was created by something else while this ran. Nothing written.`);
    }
    throw err;
  }

  // Read back through the same parser the public page uses. JSONB
  // reorders keys, so compared canonically; anything dropped on read
  // would show up here rather than as a question missing on the page.
  const created = await prisma.eventForm.findUniqueOrThrow({ where: { id } });
  if (canon(parseForm(created.fields)) !== canon(v2.doc)) {
    throw new Error(
      `v2 WAS CREATED (id ${id}) but does not read back as built. It is live — open it under ` +
      `Training Week → Registration Form and check it, or retire it, before sharing the link.`,
    );
  }
  console.log(`Created ${REGISTRATION_FORM_SLUG_V2} (id ${id}), active, at /apply/${REGISTRATION_FORM_SLUG_V2}.`);
}

/* ── replace ────────────────────────────────────────────────────────── */

async function replace(v1Doc: BuiltForm, v2: TrainingWeekV2) {
  console.log(`Checks: ${v2Problems(v1Doc, v2.doc).length} problems (schema, parse round trip, keys, rules, sessions → Workshops).`);

  const found = await prisma.eventForm.findUnique({
    where: { slug: REGISTRATION_FORM_SLUG_V2 },
    include: { _count: { select: { submissions: true } } },
  });
  if (!found) {
    throw new Error(`Nothing to replace: ${REGISTRATION_FORM_SLUG_V2} does not exist. Run without --replace to create it.`);
  }
  const { _count, ...now } = found;
  const taken = _count.submissions;
  console.log(
    `\nv2 ${REGISTRATION_FORM_SLUG_V2}: id ${now.id}, updated ${now.updatedAt.toISOString()}, ` +
    `${now.active ? "active" : "closed"}, ${taken} submission${taken === 1 ? "" : "s"}.\n`,
  );

  const nowDoc = parseForm(now.fields);
  if (canon(nowDoc) === canon(v2.doc) && now.title === v2.title && now.description === v2.description) {
    console.log("v2 already matches this build — nothing to replace.");
    return;
  }
  for (const line of replaceSummary(now, nowDoc, v2)) console.log(line);

  // After the diff, so a refused run still shows what it would have done.
  if (taken > 0) {
    const lookOnly = canon(questionsOf(nowDoc)) === canon(questionsOf(v2.doc))
      && now.title === v2.title && now.description === v2.description;
    throw new Error(
      `\nRefusing to replace: ${REGISTRATION_FORM_SLUG_V2} has ${taken} submission${taken === 1 ? "" : "s"}. ` +
      `Those people answered the questions as they are worded now, so v2 is frozen too — make a new version instead.` +
      (lookOnly ? "\nOnly its presentation differs, though — --presentation updates that and leaves the questions alone." : ""),
    );
  }
  if (!APPLY) {
    console.log(
      `\nWould update ONLY the title, description and questions of ${REGISTRATION_FORM_SLUG_V2} (id ${now.id}); ` +
      `active stays ${now.active}.`,
    );
    console.log("Re-run with --replace --apply to write it.");
    return;
  }

  // Before any write, the backup included. v2 is not frozen today; the
  // day it is, this refuses rather than trusting the count above.
  refuseFrozenForm(now.slug, "create-training-week-v2 --replace");

  mkdirSync("backups/forms", { recursive: true });
  const file = `backups/forms/${stamp()}-before-replace-${REGISTRATION_FORM_SLUG_V2}.json`;
  writeFileSync(file, JSON.stringify(found, null, 2));
  console.log(`\nBacked up v2 → ${file}`);

  /*
   * One conditional statement rather than read-then-update: it lands only
   * if v2 is exactly the row read above (a builder save bumps updatedAt)
   * and still has no submission. A registration committing in the same
   * instant can still slip past a single statement, so the read-back
   * below counts again.
   */
  const { count } = await prisma.eventForm.updateMany({
    where: { id: now.id, updatedAt: now.updatedAt, submissions: { none: {} } },
    data: {
      title: v2.title,
      description: v2.description,
      fields: v2.doc as unknown as Prisma.InputJsonValue,
    },
  });
  if (count !== 1) {
    throw new Error(
      `Refusing: v2 was edited or received a registration while this ran. Nothing written. ` +
      `Re-run the dry run to see it as it is now.`,
    );
  }

  const after = await prisma.eventForm.findUniqueOrThrow({
    where: { id: now.id },
    include: { _count: { select: { submissions: true } } },
  });
  const wrong: string[] = [];
  if (canon(parseForm(after.fields)) !== canon(v2.doc)) wrong.push("its questions do not read back as built");
  if (after.title !== v2.title || after.description !== v2.description) wrong.push("its title or description did not take");
  if (after.active !== now.active) wrong.push(`its active flag moved (${now.active} → ${after.active})`);
  if (after._count.submissions > 0) {
    wrong.push(`${after._count.submissions} registration(s) arrived during the replace — they answered the OLD wording, which is in the backup`);
  }
  if (wrong.length) {
    throw new Error(`v2 WAS UPDATED (id ${now.id}) but ${wrong.join("; ")}. Compare it with ${file}.`);
  }
  console.log(`Replaced ${REGISTRATION_FORM_SLUG_V2} (id ${now.id}): title, description and questions; active kept ${after.active}.`);
}

/* ── presentation ───────────────────────────────────────────────────── */

/** The stored JSON minus its presentation key, as stored — keys parseForm ignores included. */
const withoutLook = (raw: Prisma.JsonObject) => {
  const { presentation: _look, ...rest } = raw;
  return rest;
};

const isObject = (v: Prisma.JsonValue): v is Prisma.JsonObject =>
  v !== null && typeof v === "object" && !Array.isArray(v);

async function presentation(v1Doc: BuiltForm, v2: TrainingWeekV2) {
  console.log(`Checks: ${v2Problems(v1Doc, v2.doc).length} problems (schema, parse round trip, keys, rules, sessions → Workshops).`);

  const found = await prisma.eventForm.findUnique({
    where: { slug: REGISTRATION_FORM_SLUG_V2 },
    include: { _count: { select: { submissions: true } } },
  });
  if (!found) {
    throw new Error(`Nothing to update: ${REGISTRATION_FORM_SLUG_V2} does not exist. Run without flags to create it.`);
  }
  const { _count, ...now } = found;
  const taken = _count.submissions;
  console.log(
    `\nv2 ${REGISTRATION_FORM_SLUG_V2}: id ${now.id}, updated ${now.updatedAt.toISOString()}, ` +
    `${now.active ? "active" : "closed"}, ${taken} submission${taken === 1 ? "" : "s"} ` +
    `(allowed — the presentation changes no question, option or rule).\n`,
  );

  // Rewriting one key needs a document to rewrite it in. A row that is not
  // a JSON object is not something to guess about on production.
  if (!isObject(now.fields)) throw new Error(`Refusing: v2's stored document is not a JSON object. Nothing written.`);
  const raw = now.fields;
  const nowDoc = parseForm(raw);
  const next = v2.doc.presentation;
  if (!next) throw new Error("The build has no presentation — nothing to write.");

  if (raw.presentation !== undefined && !nowDoc.presentation) {
    // parseForm drops an invalid presentation whole, so the page is in the
    // default look today, and the "now" column below reads as empty.
    console.log("Note: v2's stored presentation does not parse — the page currently renders in the default look.\n");
  }
  if (canon(questionsOf(nowDoc)) !== canon(questionsOf(v2.doc))) {
    console.log(
      "Note: v2's questions differ from this build (edited in the builder since, or the build changed). " +
      "--presentation leaves them exactly as stored.\n",
    );
  }

  console.log("Presentation (v2 now → this build):");
  const lines: string[] = [];
  const same = lookLines(lines, nowDoc.presentation, next);
  if (!lines.length) {
    console.log("  v2's presentation already matches this build — nothing to update.");
    return;
  }
  for (const line of lines) console.log(line);
  if (same.length) console.log(`  unchanged: ${same.join(", ")}`);

  /*
   * The stored object with the one key swapped, so a key parseForm does
   * not know about survives too. Proved before the write: read the way the
   * page reads it, it must be the current document with the new look and
   * nothing else moved.
   */
  const nextRaw: Prisma.JsonObject = { ...raw, presentation: next as unknown as Prisma.JsonObject };
  if (canon(parseForm(nextRaw)) !== canon({ ...nowDoc, presentation: next })) {
    throw new Error("Refusing: with the new presentation, v2 would not read back as its current questions plus that look. Nothing written.");
  }

  if (!APPLY) {
    console.log(
      `\nWould update ONLY the presentation inside ${REGISTRATION_FORM_SLUG_V2}'s document (id ${now.id}). ` +
      `Title, description, questions, workflow, submit note and active (${now.active}) stay as stored; ` +
      `its ${taken} registration${taken === 1 ? "" : "s"} are not touched.`,
    );
    console.log("Re-run with --presentation --apply to write it.");
    return;
  }

  refuseFrozenForm(now.slug, "create-training-week-v2 --presentation");

  mkdirSync("backups/forms", { recursive: true });
  const file = `backups/forms/${stamp()}-before-presentation-${REGISTRATION_FORM_SLUG_V2}.json`;
  writeFileSync(file, JSON.stringify(found, null, 2));
  console.log(`\nBacked up v2 → ${file}`);

  // Lands only if v2 is the row read above: a builder save bumps updatedAt.
  // No submissions condition — registrations are exactly what this mode allows.
  const { count } = await prisma.eventForm.updateMany({
    where: { id: now.id, updatedAt: now.updatedAt },
    data: { fields: nextRaw },
  });
  if (count !== 1) {
    throw new Error(
      "Refusing: v2 was edited while this ran. Nothing written. Re-run the dry run to see it as it is now.",
    );
  }

  const after = await prisma.eventForm.findUniqueOrThrow({ where: { id: now.id } });
  const afterDoc = parseForm(after.fields);
  const wrong: string[] = [];
  if (canon(afterDoc.presentation ?? {}) !== canon(next)) wrong.push("its presentation does not read back as built");
  if (canon(questionsOf(afterDoc)) !== canon(questionsOf(nowDoc))) wrong.push("its questions, workflow or submit note read differently");
  if (!isObject(after.fields) || canon(withoutLook(after.fields)) !== canon(withoutLook(raw))) {
    wrong.push("its stored document changed outside the presentation");
  }
  if (after.title !== now.title || after.description !== now.description) wrong.push("its title or description moved");
  if (after.active !== now.active) wrong.push(`its active flag moved (${now.active} → ${after.active})`);
  if (wrong.length) {
    throw new Error(`v2 WAS UPDATED (id ${now.id}) but ${wrong.join("; ")}. Compare it with ${file}.`);
  }
  console.log(`Updated the presentation of ${REGISTRATION_FORM_SLUG_V2} (id ${now.id}); questions, title, description and active untouched.`);
}

/* ── run ────────────────────────────────────────────────────────────── */

async function main() {
  // Two different writes with two different safety rules; guessing which
  // one was meant is not a thing to do against production.
  if (REPLACE && PRESENTATION) throw new Error("--replace and --presentation are different writes — pick one.");
  const [doing, todo] = PRESENTATION
    ? ["updating v2's presentation only", "update v2's presentation"]
    : REPLACE ? ["replacing v2 in place", "replace v2"] : ["creating v2", "create v2"];
  console.log(APPLY ? `APPLYING — ${doing}.\n` : `DRY RUN — nothing will be written. Add --apply to ${todo}.\n`);

  const v1 = await readV1();
  if (!v1) throw new Error(`No form with slug ${REGISTRATION_FORM_SLUG} — v2 is built from it.`);
  const before = fingerprint(v1);
  console.log(`v1 ${REGISTRATION_FORM_SLUG}: id ${v1.id}, updated ${v1.updatedAt.toISOString()}, fingerprint ${before.slice(0, 16)}…\n`);

  let failure: unknown = null;
  try {
    const v1Doc = parseForm(v1.fields);
    // Throws if the live v1 has drifted from what the build accounts for,
    // or if the result fails any of its own checks. Nothing is written
    // before this line, so a refusal here costs nothing.
    const v2 = buildTrainingWeekV2(v1);
    if (PRESENTATION) await presentation(v1Doc, v2);
    else if (REPLACE) await replace(v1Doc, v2);
    else await create(v1, v1Doc, v2);
  } catch (err) {
    failure = err;
  }

  // Always, success or not: the one outcome this script must never
  // cause is a changed v1, so it is the last thing checked.
  const again = await readV1();
  const after = again ? fingerprint(again) : "(v1 is gone)";
  if (after !== before) {
    console.error(
      "\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n" +
      `!! v1 (${REGISTRATION_FORM_SLUG}) CHANGED while this script ran.\n` +
      `!! before ${before}\n!! after  ${after}\n` +
      "!! This script does not write v1 — something else did. Compare it with the backup.\n" +
      "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
    );
    throw new Error("v1 changed during the run.");
  }
  console.log(`\nv1 unchanged: fingerprint ${after.slice(0, 16)}… before and after.`);
  if (failure) throw failure;
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    return prisma.$disconnect().then(() => process.exit(1));
  });
