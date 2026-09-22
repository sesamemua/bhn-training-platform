import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildTrainingWeekV2, canon, LUMA_LABEL, LUMA_LINK, LUMA_URL, V1_CHAMELEON, V2_ACCEPTED,
  V2_BHN_STATUS_OPTIONS, V2_CHAMELEON, V2_DIET_OPTIONS, V2_DIET_OTHER, V2_EQUIP_APPLIED, V2_HAS_ACCOUNT,
  V2_NO_ACCOUNT, V2_NO_DIET, V2_SEAT_OFFER_TIMELINE, V2_SYMPOSIUM_OPTIONS, V2_SYMPOSIUM_PLANNING, v2Problems,
} from "../../src/lib/formbuilder/training-week-v2";
import { versionLabel, versionRoot } from "../../src/lib/formbuilder/versions";
import { BuiltFormSchema, parseForm, PresentationSchema, type BuiltForm } from "../../src/lib/formbuilder/types";
import { problems, visibleFields, walk, type Answers } from "../../src/lib/formbuilder/logic";
import { checkSubmission, emailFrom, rankedSessions } from "../../src/lib/formbuilder/submit";
import { hasRichLink, parseRich, plainRich } from "../../src/lib/formbuilder/rich-text";
import { optionLabel, sessionForOption } from "../../src/lib/training-week/schedule-2026";
import {
  FROZEN_FORM_SLUGS, REGISTRATION_FORM_SLUG, REGISTRATION_FORM_SLUG_V2, REGISTRATION_FORM_SLUGS,
  REGISTRATION_FORM_WHERE, refuseFrozenForm,
} from "../../src/lib/allocation/symposium-2026";

/**
 * v2 of the Training Week registration, built from the LIVE v1 snapshot.
 *
 * Built from the fixture rather than from TRAINING_WEEK_FORM because the
 * script builds from the live row, and the code copy has drifted from it.
 * The exact strings below are the coordinators' — a test that paraphrased
 * them would pass against wording nobody signed off.
 */

const FIXTURE = resolve("tests/unit/fixtures/training-week-v1-live.json");
type V1Json = { slug: string; title: string; description: string; fields: unknown };
const load = (): V1Json => JSON.parse(readFileSync(FIXTURE, "utf8")) as V1Json;

const fixture = load();
const v1 = parseForm(fixture.fields);
const built = buildTrainingWeekV2(fixture);
const v2 = built.doc;

const q = (doc: BuiltForm, key: string) => {
  const f = doc.fields.find((x) => x.key === key);
  assert.ok(f, `no question "${key}"`);
  return f;
};

const V1_STATUS = q(v1, "bhn_status").options;
const sessionsOf = (doc: BuiltForm) => q(doc, "sessions").options;

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === "object") {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
};

/* ── the build itself ────────────────────────────────────────────── */

test("the fixture is the v1 form it claims to be", () => {
  assert.equal(fixture.slug, REGISTRATION_FORM_SLUG);
  assert.equal(v1.fields.length, (fixture.fields as { fields: unknown[] }).fields.length, "a v1 question failed to parse");
});

test("v2 is a new slug, and the readers pool every version", () => {
  assert.equal(built.slug, REGISTRATION_FORM_SLUG_V2);
  assert.equal(built.slug, "training-week-registration-2026-v2");
  assert.notEqual(built.slug, REGISTRATION_FORM_SLUG);
  assert.deepEqual([...REGISTRATION_FORM_SLUGS], [REGISTRATION_FORM_SLUG, REGISTRATION_FORM_SLUG_V2]);

  // What loadSubmissions and the Registration Form page do: the wide
  // Prisma where, then versionRoot. A v3 made with Duplicate pools and is
  // labelled as itself; a look-alike slug does not sneak in.
  const inWhere = (slug: string) => REGISTRATION_FORM_WHERE.OR.some((c) =>
    typeof c.slug === "string" ? c.slug === slug : slug.startsWith(c.slug.startsWith));
  const candidates = [
    REGISTRATION_FORM_SLUG, REGISTRATION_FORM_SLUG_V2, `${REGISTRATION_FORM_SLUG}-v3`,
    `${REGISTRATION_FORM_SLUG}-v2026`, "training-week-registration-2025", "training-week-registration-2026-copy",
  ];
  const pooled = candidates.filter(inWhere).filter((s) => versionRoot(s) === REGISTRATION_FORM_SLUG);
  assert.deepEqual(pooled, [REGISTRATION_FORM_SLUG, REGISTRATION_FORM_SLUG_V2, `${REGISTRATION_FORM_SLUG}-v3`]);
  assert.deepEqual(pooled.map(versionLabel), ["v1", "v2", "v3"]);
});

test("v1 is frozen to every form-writing script; v2 is not", () => {
  assert.ok(FROZEN_FORM_SLUGS.has(REGISTRATION_FORM_SLUG));
  assert.ok(!FROZEN_FORM_SLUGS.has(REGISTRATION_FORM_SLUG_V2));
  assert.throws(() => refuseFrozenForm(REGISTRATION_FORM_SLUG, "some-script"), /frozen/);
  assert.doesNotThrow(() => refuseFrozenForm(REGISTRATION_FORM_SLUG_V2, "some-script"));
});

test("building v2 does not touch the v1 document it reads", () => {
  // The input is the live v1. A build that edited it in place would be
  // one careless save away from rewriting the frozen form.
  const input = load();
  const before = JSON.stringify(input);
  buildTrainingWeekV2(deepFreeze(input));
  assert.equal(JSON.stringify(input), before);
});

test("it is deterministic", () => {
  assert.equal(canon(buildTrainingWeekV2(load())), canon(built));
});

test("the schema accepts it, and it survives parseForm unchanged", () => {
  // parseForm DROPS what it cannot validate. Presentation and slot
  // capacity are both new keys, which is exactly how submitNote was lost once.
  assert.doesNotThrow(() => BuiltFormSchema.parse(v2));
  const reread = parseForm(JSON.parse(JSON.stringify(v2)));
  assert.equal(canon(reread), canon(v2));
  assert.ok(reread.presentation, "presentation lost on read");
  assert.equal(q(reread, "sessions").slots.filter((s) => s.capacity === 30).length, 2, "capacity lost on read");
});

test("it passes its own checks", () => {
  assert.deepEqual(v2Problems(v1, v2), []);
});

test("the builder finds nothing new wrong with it", () => {
  assert.deepEqual(problems(v2), problems(v1));
});

test("every key, id, type and stage is v1's, in v1's order", () => {
  const shape = (d: BuiltForm) => d.fields.map((f) => ({ id: f.id, key: f.key, type: f.type, stage: f.stage, stopsHere: f.stopsHere }));
  assert.deepEqual(shape(v2), shape(v1));
  // The two keys machinery depends on, named: the eligibility gate reads
  // trainee_email, and seats are made from the multi question with slots.
  assert.equal(q(v2, "trainee_email").type, "email");
  assert.equal(q(v2, "sessions").type, "multi");
  assert.equal(q(v2, "confirmed").stage, "confirmation");
});

test("the workflow is v1's, with only its rule values renamed", () => {
  const strip = (d: BuiltForm) => d.steps.map((s) => ({ ...s, when: s.when.map((c) => ({ field: c.field, op: c.op })) }));
  assert.deepEqual(strip(v2), strip(v1));
});

test("title and description", () => {
  assert.equal(built.title, "BioHubNet Training Week 2026");
  assert.ok(!built.description.includes("\n"), "the description is the meta line, one line");
  assert.ok(!/\[|\*\*/.test(built.description), "no markup in the meta description");
  assert.match(built.description, /26–28 October 2026/);
});

/* ── the checklist, item by item ─────────────────────────────────── */

test("C1: the site theme", () => {
  assert.equal(v2.presentation?.theme, "site");
  assert.equal(v2.presentation?.richText, true);
});

test("C2: the refusal sits by the email question", () => {
  assert.equal(v2.presentation?.gateInline, true);
  assert.equal(q(v2, "trainee_email").key, "trainee_email");
});

/**
 * The team's intro as they signed it off, before the hero took it apart.
 * Kept here as the record: the layout may move a sentence, never reword one.
 */
const TEAM_INTRO = [
  "Training Week events are only open to HQPs accepted into ENGAGE, EXPERIENCE, or EQUIP programs.",
  "Please select and rank the sessions you would like to attend. The BioHubNet team will email you with seat offers during the last week of September.",
  "The Annual Symposium on 29 October 2026 is a separate event. To register, visit the Symposium registration site: [BioHubNet 2026 Annual Symposium · Luma](https://luma.com/wh30nh1n)",
  "Questions marked * are required.",
];
/** "luma.com/…" has a dot too, so a sentence ends at a dot followed by a space and a capital. */
const sentences = (paragraph: string) => paragraph.split(/(?<=\.)\s+(?=[A-Z])/);

const fact = (label: string) => {
  const f = v2.presentation?.facts?.find((x) => x.label === label);
  assert.ok(f, `no fact "${label}"`);
  return f;
};

test("C3: the header", () => {
  const p = v2.presentation!;
  assert.equal(p.heading, "BioHubNet Training Week");
  assert.equal(p.subheading, "26–28 October 2026 | Toronto");
  // The hero says it now; an intro as well would say it twice.
  assert.ok(!("intro" in p), "the intro key is back");
  assert.ok(!("intro" in parseForm(JSON.parse(JSON.stringify(v2))).presentation!), "an intro appears on read");
});

test("C3: every sentence of the team's intro is in the hero or above the questions, verbatim", () => {
  const p = v2.presentation!;
  const said = [...(p.facts ?? []).map((f) => f.text), p.formIntro ?? ""];
  const all = TEAM_INTRO.flatMap(sentences);
  assert.equal(all.length, 6, "the sentence split has drifted");
  for (const s of all) assert.ok(said.some((t) => t.includes(s)), `not said verbatim anywhere: "${s}"`);

  // Each paragraph whole, under the label saying what it answers.
  assert.deepEqual(p.facts, [
    { label: "Who can register", text: TEAM_INTRO[0] },
    { label: "Seat offers", text: TEAM_INTRO[1] },
    { label: "Annual Symposium", text: TEAM_INTRO[2] },
  ]);
  assert.equal(p.formIntro, TEAM_INTRO[3]);
  // Nothing added that the team did not write, bar the labels.
  assert.equal(said.join("\n"), TEAM_INTRO.join("\n"));
});

test("C3: Luma is a labelled link in the Symposium fact, and the second button", () => {
  const p = v2.presentation!;
  // A link that reads as the event, not as an address.
  const links = parseRich(fact("Annual Symposium").text).flat().filter((piece) => "href" in piece);
  assert.deepEqual(links, [{ text: LUMA_LABEL, href: LUMA_URL }]);
  for (const label of ["Who can register", "Seat offers"]) assert.ok(!hasRichLink(fact(label).text), label);

  assert.deepEqual(p.actions, [
    { label: "Start registration", href: "#registration" },
    { label: "Symposium registration", href: LUMA_URL },
  ]);
});

test("C3: the buttons and the header link go somewhere the schema allows", () => {
  const p = v2.presentation!;
  for (const a of p.actions ?? []) assert.match(a.href, /^(#[A-Za-z][\w-]*|https:\/\/\S+)$/, a.label);
  assert.deepEqual(p.homeLink, { label: "2026 Symposium", href: "https://biohubnet.ca/2026-annual-symposium/" });
  assert.ok(PresentationSchema.safeParse(p).success);
  // And the schema is the guard, not the test: a script link is refused.
  assert.ok(!PresentationSchema.safeParse({ ...p, actions: [{ label: "x", href: "javascript:alert(1)" }] }).success);
  assert.ok(!PresentationSchema.safeParse({ ...p, homeLink: { label: "x", href: "http://biohubnet.ca/" } }).success);
});

test("C3: the thank-you screen keeps the intro's timeline", () => {
  const note = v2.presentation?.confirmationNote;
  assert.ok(note, "v2 would fall back to the default two-to-three-weeks paragraph");
  assert.equal(
    note,
    "**The BioHubNet team will email you with seat offers during the last week of September.** Places are limited and every registration is reviewed together rather than as it arrives. We will write to you either way — whether or not we can offer you a place. If you have not heard from us by early October, reply to the email and we will chase it.",
  );
  // The same sentence the hero promises, so the two screens cannot drift.
  assert.ok(fact("Seat offers").text.endsWith(V2_SEAT_OFFER_TIMELINE));
  assert.deepEqual(parseRich(note)[0][0], { text: V2_SEAT_OFFER_TIMELINE, bold: true });
  assert.equal(parseRich(note).length, 1);
  assert.ok(!/two to three weeks|three weeks/i.test(plainRich(note)), "the old turnaround survives");
  assert.ok(note.length <= 1000);
  // v1 has no presentation, so it keeps the default paragraph.
  assert.equal(v1.presentation, undefined);
});

test("C4: the email question", () => {
  const f = q(v2, "trainee_email");
  assert.equal(f.label, "Email registered with BioHubNet");
  assert.equal(f.required, true);
  assert.equal(f.help, "Please enter your institutional email address, or secondary email address registered with BioHubNet for verification.");
});

test("C5: the note for an account without a program", () => {
  const f = q(v2, "need_programme_note");
  assert.equal(f.label, "Step 1: Join a BioHubNet program");
  assert.equal(
    f.help,
    "Training Week is open to participants accepted into ENGAGE, EXPERIENCE, or EQUIP. For information about the programs and the eligibility requirements, please visit biohubnet.ca. Return to this form once you are accepted into a program.",
  );
  assert.equal(f.stopsHere, true);
  assert.deepEqual(f.showWhen, [{ field: "bhn_status", op: "is", value: V2_HAS_ACCOUNT }]);
  assert.ok(hasRichLink(f.help!), "biohubnet.ca is still a link");
});

test("C6: the note for no account", () => {
  const f = q(v2, "need_account_note");
  assert.equal(f.label, "Step 1: Create an account and apply");
  assert.equal(
    f.help,
    "Create a BioHubNet training platform account, then proceed to apply to either ENGAGE or EXPERIENCE. Both programs are administered through the training platform, so create an account on the training platform before submitting your application.\n" +
    "For information about the programs and their eligibility requirements, please visit biohubnet.ca. Return to this form once you are accepted into a program.",
  );
  assert.equal(parseRich(f.help!).length, 2);
  assert.ok(!/programme/i.test(f.help!), "the platform's copy says program");
  assert.equal(f.stopsHere, true);
  assert.deepEqual(f.showWhen, [{ field: "bhn_status", op: "is", value: V2_NO_ACCOUNT }]);
});

test("C7: travel time", () => {
  const f = q(v2, "travel_over_2h");
  assert.equal(f.type, "yesno");
  assert.equal(f.label, "Is your one-way, door-to-door travel time to downtown Toronto > 2 hours?");
  assert.equal(f.help, "If yes, you may be eligible for travel assistance. We will contact you with details about the assistance available.");
});

test("C8: Communication Chameleon runs until 16:30, everywhere", () => {
  const f = q(v2, "sessions");
  assert.equal(f.options[3], V2_CHAMELEON);
  assert.equal(V2_CHAMELEON, "Tue 27 Oct · 13:00–16:30 · Communication Chameleon");
  assert.deepEqual(f.slots[3], { option: V2_CHAMELEON, day: "2026-10-27", start: "13:00", end: "16:30", capacity: 30 });
  assert.ok(!JSON.stringify(v2).includes("13:00–16:00"), "the 16:00 string survives somewhere");
  // Same Workshop either way — v1 keeps producing Chameleon seats.
  assert.equal(sessionForOption(V2_CHAMELEON)?.slug, "communication-chameleon-2026");
  assert.equal(sessionForOption(V1_CHAMELEON)?.slug, "communication-chameleon-2026");
  // Every session is the schedule's current string for whatever v1
  // offered in that place — five of the six moved with October's grid,
  // and the build takes the new string from the schedule rather than
  // from a table that would go stale on the next change.
  assert.deepEqual(f.options, sessionsOf(v1).map((o) => optionLabel(sessionForOption(o)!)));
});

test("C9: the status question", () => {
  const f = q(v2, "bhn_status");
  assert.equal(f.label, "What is your current BioHubNet program status?");
  assert.equal(f.required, true);
  assert.equal(
    f.help,
    "Training Week is open to participants who are already in a BioHubNet program. Please note: Creating a BioHubNet training platform account alone does not constitute program participation.\n" +
    "Submitting an EQUIP application qualifies you for Training Week.",
  );
  assert.deepEqual(f.options, [
    "I have been accepted into the ENGAGE or EXPERIENCE program",
    "I have previously submitted an EQUIP application",
    "I have created a BioHubNet training platform account but have not been accepted into a program",
    "I have not participated in a BioHubNet program",
  ]);
  for (const o of f.options) assert.ok(o.length <= 120, `over the option cap: "${o}"`);
  assert.deepEqual(f.options, V2_BHN_STATUS_OPTIONS);
  // The doc's stray sentence is guidance, not somebody's stored status.
  for (const o of f.options) assert.ok(!o.includes("Submitting"), `stray sentence in option "${o}"`);
});

test("C10: up to 30 on the two Tuesday workshops, and nowhere else", () => {
  const capacity = Object.fromEntries(q(v2, "sessions").slots.map((s) => [sessionForOption(s.option)!.slug, s.capacity]));
  assert.deepEqual(capacity, {
    "ccrm-tour-lunch-learn-2026": undefined,
    "catalent-tour-lunch-learn-2026": undefined,
    "cl3-workshop-2026": undefined,
    "communication-chameleon-2026": 30,
    "negotiation-skills-2026": 30,
    "innovation-showcase-2026": undefined,
  });
  // v1 says nothing about capacity, and still does not.
  assert.ok(q(v1, "sessions").slots.every((s) => s.capacity === undefined));
});

test("C11: the Symposium question, required, pointing at Luma", () => {
  const f = q(v2, "symposium_signup");
  assert.equal(f.label, "Have you registered for the 2026 Annual Symposium?");
  assert.equal(f.required, true);
  assert.equal(
    f.help,
    "Please note that the Annual Symposium requires a separate registration: [BioHubNet 2026 Annual Symposium · Luma](https://luma.com/wh30nh1n)\n" +
    "The Symposium takes place on Thursday, 29 October 2026. We encourage participants to attend both, as the Symposium provides an opportunity to build on and further your Training Week experience.",
  );
  assert.deepEqual(f.options, ["Yes — I have already registered", "Not yet — I plan to register", "No — I do not plan to attend"]);
  assert.deepEqual(f.options, V2_SYMPOSIUM_OPTIONS);

  const note = q(v2, "symposium_link_note");
  assert.deepEqual(note.showWhen, [{ field: "symposium_signup", op: "is", value: V2_SYMPOSIUM_PLANNING }]);
  assert.ok(note.help!.includes(LUMA_LINK), "the follow-up points at Luma");
  assert.ok(!note.help!.includes("biohubnet.ca"), "the follow-up still points at the event page");
  assert.ok(hasRichLink(note.help!));
});

test("C12: choose and rank, in two paragraphs", () => {
  const f = q(v2, "sessions");
  assert.equal(f.label, "Choose and Rank Your Sessions");
  assert.equal(f.required, true);
  assert.equal(
    f.help,
    "Select as many sessions as you wish and rank them in order of preference. Sessions will be allocated based on your stated order of preference, subject to availability.\n" +
    "Please note: Sessions displayed side by side in the calendar take place at the same time. You may select both sessions if you would be willing to attend either; however, you can only be approved for one.",
  );
  assert.equal(parseRich(f.help!).length, 2);
  // v1's third paragraph and its rule told people to choose between the
  // Monday tours, which October's grid does not have: one tour, host to
  // be confirmed, and CCRM moved to Tuesday. A sentence about where two
  // sessions are cannot be rewritten by a build, so it goes.
  assert.deepEqual(f.cannotCombine, []);
  assert.ok(!JSON.stringify(v2).includes("Catalent"), "a tour the week no longer runs");
  assert.equal(f.maxChoices, undefined, "a cap has come back");
});

test("C13, C14, C15, C19: the lines that go, and the tracker", () => {
  const p = v2.presentation!;
  assert.equal(p.hideCalendarHint, true, "C13");
  assert.equal(p.hideRankNote, true, "C14");
  assert.equal(p.progress, "bar", "C15");
  assert.equal(p.hideWaitingHint, true, "C19");
});

test("C16: dietary", () => {
  const f = q(v2, "dietary");
  assert.equal(f.label, "Dietary Requirements for Training Week Meals");
  assert.equal(f.help, "Please select all that apply:");
  assert.deepEqual(f.options, [
    "No dietary requirements", "Vegan", "Halal", "Kosher", "Gluten-free", "Dairy-free", "Other — please describe",
  ]);
  assert.deepEqual(f.options, V2_DIET_OPTIONS);
  assert.equal(f.exclusiveOption, V2_NO_DIET);
  const other = q(v2, "dietary_other");
  assert.deepEqual(other.showWhen[1], { field: "dietary", op: "contains", value: V2_DIET_OTHER });
});

test("C17: the photography note", () => {
  assert.equal(
    v2.submitNote,
    "**PLEASE NOTE:** Photography, audio and video recording may occur throughout this event. Therefore, by attending Training Week events, you hereby authorize the University of Toronto to take your photograph, video and/or record your voice and grant the university all rights to these sounds, still or moving images in any medium for educational, promotional, marketing, advertising or other such purposes that support the mission of the university.",
  );
  assert.deepEqual(parseRich(v2.submitNote!)[0][0], { text: "PLEASE NOTE:", bold: true });
  assert.ok(!plainRich(v2.submitNote!).includes("**"));
  assert.ok(!v2.submitNote!.includes("Annual Symposium"), "still the v1 consent sentence");
});

test("C18: the postal code hint", () => {
  const f = q(v2, "postcode");
  assert.equal(f.label, "First 3 characters of your postal code");
  assert.equal(f.help, "Enter the first 3 characters of your postal code (e.g., M5V). This will be used to estimate travel distance.");
});

/* ── invariants ──────────────────────────────────────────────────── */

test("no v1-only answer survives anywhere in v2", () => {
  const text = JSON.stringify(v2);
  for (const old of [
    ...V1_STATUS,
    "Yes — already signed up", "No — I am not attending the Symposium",
    "Vegetarian", "Gluten-free / coeliac", "Dairy-free / lactose intolerant", "Nut allergy", "Shellfish allergy",
    "Something else — I will describe it", V1_CHAMELEON,
  ]) {
    assert.ok(!text.includes(old), `"${old}" is still in v2`);
  }
  // The event page is where the header points back to, and only there:
  // a question sending people to it instead of Luma is the v1 leftover.
  const eventPage = "biohubnet.ca/2026-annual-symposium";
  assert.ok(!JSON.stringify(v2.fields).includes(eventPage), "a question still points at the event page");
  assert.equal(text.split(eventPage).length - 1, 1);
  assert.ok(v2.presentation!.homeLink!.href.includes(eventPage));
  // "Not yet — I plan to" is a prefix of its replacement, so it may only
  // appear as that replacement.
  assert.equal(text.split("Not yet — I plan to").length, text.split(V2_SYMPOSIUM_PLANNING).length);
});

test("every rule names an answer its question offers", () => {
  const offered = (key: string) => {
    const f = q(v2, key);
    return f.type === "yesno" ? ["Yes", "No"] : f.options;
  };
  const rules = [...v2.fields.flatMap((f) => f.showWhen), ...v2.steps.flatMap((s) => s.when)];
  let checked = 0;
  for (const c of rules) {
    if (!["is", "is not", "any of", "contains"].includes(c.op)) continue;
    for (const part of c.value!.split(",")) {
      assert.ok(offered(c.field).includes(part), `${c.field} ${c.op} "${part}" is not an answer`);
      checked += 1;
    }
  }
  // 11 `any of` × 2, 2 `is` on status, travel, symposium, dietary, confirmed.
  assert.equal(checked, 28);
});

test("no answer a rule can read has a comma", () => {
  for (const key of ["bhn_status", "symposium_signup", "dietary", "sessions"]) {
    for (const o of q(v2, key).options) assert.ok(!o.includes(","), `"${o}"`);
  }
});

test("the six sessions reach the same six Workshops, in order", () => {
  const slugs = (d: BuiltForm) => sessionsOf(d).map((o) => sessionForOption(o)?.slug);
  assert.deepEqual(slugs(v2), slugs(v1));
  assert.deepEqual(slugs(v2), [
    "ccrm-tour-lunch-learn-2026", "catalent-tour-lunch-learn-2026", "cl3-workshop-2026",
    "communication-chameleon-2026", "negotiation-skills-2026", "innovation-showcase-2026",
  ]);
});

test("the checks catch a rule left pointing at an old answer", () => {
  const broken = structuredClone(v2);
  q(broken, "need_programme_note").showWhen[0].value = V1_STATUS[2];
  const found = v2Problems(v1, broken);
  assert.ok(found.some((p) => p.includes("does not offer")), found.join("\n"));
  assert.ok(found.some((p) => p.includes("is still in it")), found.join("\n"));
});

test("the checks catch a slot drawn at the old time", () => {
  const broken = structuredClone(v2);
  q(broken, "sessions").slots[3].end = "16:00";
  assert.ok(v2Problems(v1, broken).some((p) => p.includes("the schedule says")));
});

test("a v1 that has changed since is refused, not guessed at", () => {
  const drifted = load();
  const status = (drifted.fields as { fields: { key: string; options: string[] }[] }).fields.find((f) => f.key === "bhn_status")!;
  status.options.push("I am a coordinator");
  assert.throws(() => buildTrainingWeekV2(drifted), /does not account for/);
});

/* ── it still runs the same way ──────────────────────────────────── */

const pairs = V2_BHN_STATUS_OPTIONS.map((s, i) => [V1_STATUS[i], s] as const);

test("each status walks the same workflow on both versions", () => {
  for (const [old, now] of pairs) {
    const a = walk(v1, { bhn_status: old, sessions: [sessionsOf(v1)[0]], confirmed: "Yes" }).map((r) => r.step.id);
    const b = walk(v2, { bhn_status: now, sessions: [sessionsOf(v2)[0]], confirmed: "Yes" }).map((r) => r.step.id);
    assert.deepEqual(b, a, `"${now}" routes differently from "${old}"`);
  }
});

test("eligible statuses reach a seat; the other two are declined", () => {
  for (const status of [V2_ACCEPTED, V2_EQUIP_APPLIED]) {
    const path = walk(v2, { bhn_status: status, sessions: [V2_CHAMELEON], confirmed: "Yes" }).map((r) => r.step.id);
    assert.ok(path.includes("w_roster") && path.includes("w_seat"), `${status}: ${path.join(" → ")}`);
    assert.equal(path.at(-1), "w_attends");
  }
  for (const status of [V2_HAS_ACCOUNT, V2_NO_ACCOUNT]) {
    const path = walk(v2, { bhn_status: status }).map((r) => r.step.id);
    assert.equal(path.at(-1), "w_declined", `${status}: ${path.join(" → ")}`);
    assert.ok(!path.includes("w_roster"));
  }
});

test("each status shows the same questions on both versions", () => {
  const v1Symp = q(v1, "symposium_signup").options;
  const v1Diet = q(v1, "dietary").options;
  for (const [old, now] of pairs) {
    const keys = (doc: BuiltForm, answers: Answers) => visibleFields(doc, answers).map((f) => f.key);
    const a = keys(v1, { bhn_status: old, travel_over_2h: "Yes", symposium_signup: v1Symp[1], dietary: [v1Diet.at(-1)!] });
    const b = keys(v2, { bhn_status: now, travel_over_2h: "Yes", symposium_signup: V2_SYMPOSIUM_PLANNING, dietary: [V2_DIET_OTHER] });
    assert.deepEqual(b, a, `"${now}" shows different questions from "${old}"`);
  }
});

test("the stop notes and the follow-ups open on exactly their answers", () => {
  const keys = (answers: Answers) => visibleFields(v2, answers).map((f) => f.key);
  assert.deepEqual(keys({ bhn_status: V2_HAS_ACCOUNT }), ["bhn_status", "need_programme_note"]);
  assert.deepEqual(keys({ bhn_status: V2_NO_ACCOUNT }), ["bhn_status", "need_account_note"]);
  const accepted = keys({ bhn_status: V2_ACCEPTED });
  for (const k of ["trainee_email", "travel_over_2h", "sessions", "symposium_signup", "dietary"]) assert.ok(accepted.includes(k), k);
  for (const k of ["postcode", "symposium_link_note", "dietary_other"]) assert.ok(!accepted.includes(k), k);

  assert.ok(keys({ bhn_status: V2_ACCEPTED, travel_over_2h: "Yes" }).includes("postcode"));
  assert.ok(keys({ bhn_status: V2_ACCEPTED, symposium_signup: V2_SYMPOSIUM_PLANNING }).includes("symposium_link_note"));
  assert.ok(!keys({ bhn_status: V2_ACCEPTED, symposium_signup: V2_SYMPOSIUM_OPTIONS[0] }).includes("symposium_link_note"));
  assert.ok(keys({ bhn_status: V2_ACCEPTED, dietary: ["Vegan", V2_DIET_OTHER] }).includes("dietary_other"));
  assert.ok(!keys({ bhn_status: V2_ACCEPTED, dietary: ["Vegan"] }).includes("dietary_other"));
});

test("a complete v2 registration passes the server check and makes the right seats", () => {
  const answers: Answers = {
    bhn_status: V2_ACCEPTED,
    trainee_email: "Someone@UToronto.ca",
    travel_over_2h: "Yes",
    postcode: "M5V",
    sessions: [V2_CHAMELEON, sessionsOf(v2)[0]],
    symposium_signup: V2_SYMPOSIUM_PLANNING,
    dietary: ["Vegan", V2_DIET_OTHER],
    dietary_other: "Severe nut allergy",
    newsletter_optin: "No thanks",
  };
  const verdict = checkSubmission(v2, answers);
  assert.deepEqual(verdict.problems, []);
  assert.equal(emailFrom(v2, verdict.clean), "someone@utoronto.ca");
  const ranked = rankedSessions(v2, verdict.clean);
  assert.deepEqual(ranked, [V2_CHAMELEON, sessionsOf(v2)[0]]);
  assert.deepEqual(ranked.map((o) => sessionForOption(o)?.slug), ["communication-chameleon-2026", "ccrm-tour-lunch-learn-2026"]);

  // Symposium is required on v2 (it was not on v1).
  const { symposium_signup: _, ...without } = answers;
  assert.ok(checkSubmission(v2, without).problems.some((p) => p.includes("Have you registered for the 2026 Annual Symposium?")));
});

test("a row must be read against the form it came in on", () => {
  // Why the registrant sheet keeps one document per form: read through
  // the other version, a v1 Chameleon pick silently disappears.
  const v1Answers: Answers = { bhn_status: V1_STATUS[0], sessions: [V1_CHAMELEON] };
  assert.deepEqual(rankedSessions(v1, v1Answers), [V1_CHAMELEON]);
  assert.deepEqual(rankedSessions(v2, v1Answers), []);
  assert.equal(sessionForOption(rankedSessions(v1, v1Answers)[0])?.slug, "communication-chameleon-2026");
});
