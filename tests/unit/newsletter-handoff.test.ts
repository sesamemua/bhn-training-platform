import test from "node:test";
import assert from "node:assert/strict";
import { buildAiBrief, parseAiReturn, extractJson, type HandoffPiece } from "../../src/lib/newsletter/handoff";

/**
 * The round trip: the issue's raw submissions out to somebody else's
 * chat window, the layouts back. The parse is the half that matters —
 * it has to survive what a chat model actually returns, and it must
 * never silently drop a colleague's contribution.
 */

const PIECES: HandoffPiece[] = [
  { id: "p1", section: "engage", rawBody: "Round 4 matched 12 trainees with host labs.", authorName: "Yes Lee" },
  { id: "p2", section: "equip", rawBody: "VentureLift applications close 30 September.", sourceUrl: "https://x.test/apply" },
];

const good = JSON.stringify({
  pieces: [
    { id: "p1", layout: { headline: "Round 4 matched", body: ["Twelve trainees placed."] } },
    { id: "p2", layout: { headline: "VentureLift", body: ["Applications close 30 September."],
        glance: [{ label: "APPLY BY", value: "30 September", accent: true }] } },
  ],
});

/* ── Out ─────────────────────────────────────────────────────────── */

test("the brief carries every piece, with its id", () => {
  const b = buildAiBrief(PIECES, "September 2026");
  for (const p of PIECES) {
    assert.ok(b.includes(p.id), `${p.id} is not in the brief`);
    assert.ok(b.includes(p.rawBody), "a submission is missing from the brief");
  }
  assert.ok(b.includes("September 2026"));
});

test("the brief carries the schema, not a description of it", () => {
  const b = buildAiBrief(PIECES, "X");
  for (const key of ["headline", "body", "glance", "people", "links", "noteBadge", "ctaUrl"]) {
    assert.ok(b.includes(`"${key}"`), `${key} is not in the schema block`);
  }
  assert.match(b, /copied exactly/i, "it must insist the ids come back");
});

test("empty sections are left out rather than shown empty", () => {
  const b = buildAiBrief([PIECES[0]], "X");
  assert.ok(b.includes("SECTION: engage"));
  assert.ok(!b.includes("SECTION: equip"));
});

/* ── Finding the JSON in a chat reply ────────────────────────────── */

test("a fenced block", () => {
  assert.ok(extractJson('Sure!\n```json\n{"pieces":[]}\n```\nHope that helps')!.startsWith("{"));
});

test("prose either side of bare JSON", () => {
  assert.equal(extractJson('Here you go: {"a":1} — let me know!'), '{"a":1}');
});

test("nothing usable gives null, not a throw", () => {
  assert.equal(extractJson(""), null);
  assert.equal(extractJson("I could not do that."), null);
  assert.equal(extractJson("}{"), null);
});

/* ── Back ────────────────────────────────────────────────────────── */

test("a clean reply applies every piece", () => {
  const r = parseAiReturn(good, PIECES);
  assert.equal(r.ok, true);
  assert.equal(r.applied.length, 2);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.unknown, []);
  assert.deepEqual(r.problems, []);
  assert.equal(r.applied[1].layout.glance?.[0].accent, true);
});

test("it survives the fences and chatter a real reply arrives in", () => {
  const r = parseAiReturn("Happy to help!\n\n```json\n" + good + "\n```\n\nLet me know.", PIECES);
  assert.equal(r.applied.length, 2);
});

test("a top-level array is accepted too", () => {
  const r = parseAiReturn(JSON.stringify(JSON.parse(good).pieces), PIECES);
  assert.equal(r.applied.length, 2);
});

test("a piece the reply forgot is NAMED, not silently dropped", () => {
  // The whole point: a contribution must never vanish from an issue
  // because a model got bored two thirds of the way down.
  const partial = JSON.stringify({ pieces: [JSON.parse(good).pieces[0]] });
  const r = parseAiReturn(partial, PIECES);
  assert.equal(r.applied.length, 1);
  assert.deepEqual(r.missing, [{ id: "p2", section: "equip" }]);
  assert.equal(r.ok, true, "the nine that worked should still apply");
});

test("one malformed entry does not throw away the good ones", () => {
  const mixed = JSON.stringify({
    pieces: [
      JSON.parse(good).pieces[0],
      { id: "p2", layout: { body: ["no headline here"] } },
    ],
  });
  const r = parseAiReturn(mixed, PIECES);
  assert.equal(r.applied.length, 1);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /no headline/i);
  // And the editor is told which submission it was, not just an index.
  assert.match(r.problems[0], /VentureLift/);
});

test("an id from another issue is reported, not applied", () => {
  const stray = JSON.stringify({ pieces: [{ id: "nope", layout: { headline: "H", body: ["B"] } }] });
  const r = parseAiReturn(stray, PIECES);
  assert.deepEqual(r.unknown, ["nope"]);
  assert.equal(r.applied.length, 0);
  assert.equal(r.missing.length, 2);
});

test("the same piece twice takes the first and says so", () => {
  const dupe = JSON.stringify({
    pieces: [JSON.parse(good).pieces[0], { id: "p1", layout: { headline: "Second", body: ["x"] } }],
  });
  const r = parseAiReturn(dupe, PIECES);
  assert.equal(r.applied.length, 1);
  assert.equal(r.applied[0].layout.headline, "Round 4 matched");
  assert.match(r.problems.join(" "), /same piece/i);
});

test("a body that came back as a string rather than an array still works", () => {
  const s = JSON.stringify({ pieces: [{ id: "p1", layout: { headline: "H", body: "one para" } }] });
  assert.deepEqual(parseAiReturn(s, PIECES).applied[0].layout.body, ["one para"]);
});

test("half-filled rows are dropped, not stored as blanks", () => {
  const s = JSON.stringify({ pieces: [{ id: "p1", layout: { headline: "H", body: ["B"],
    glance: [{ label: "DATES" }, { label: "APPLY BY", value: "1 Oct" }],
    links: [{ label: "no url" }], people: [{ detail: "no name" }] } }] });
  const l = parseAiReturn(s, PIECES).applied[0].layout;
  assert.equal(l.glance?.length, 1);
  assert.equal(l.links, undefined, "an all-bad list should be absent, not empty");
  assert.equal(l.people, undefined);
});

test("junk in, a sentence out — never a crash", () => {
  for (const junk of ["", "   ", "nope", "{", '{"pieces":"not a list"}', "[1,2,3]"]) {
    const r = parseAiReturn(junk, PIECES);
    assert.equal(r.ok, false);
    assert.equal(r.applied.length, 0);
    assert.ok(r.problems.length > 0, `${JSON.stringify(junk)} produced no explanation`);
  }
});
