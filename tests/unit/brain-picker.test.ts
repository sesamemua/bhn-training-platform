import assert from "node:assert/strict";
import test from "node:test";
import {
  DRAFTED_SPECIALITIES, FALLBACK_SPECIALITY, MERCH_BRIEF, NOTHING, PROBES,
  audacity, draftedFor, firstNameOf, initialsOf, ledger, probeVerdict, reciprocity,
} from "../../src/lib/brain/picker";
import {
  askerTotals, buildTeam, outstanding, pickable, waitingOnYou,
  type PickRow, type ProfileRow, type UserRow,
} from "../../src/lib/brain/team";

const users: UserRow[] = [
  { id: "u-me", name: "Ruilin Yuan", email: "ruilin.yuan@utoronto.ca", role: "superadmin" },
  { id: "u-al", name: "Alison Stirling", email: "a.stirling@utoronto.ca", role: "superadmin" },
  { id: "u-ye", name: "Yeseul Lee", email: "yes.lee@utoronto.ca", role: "superadmin" },
];

const pick = (over: Partial<PickRow> & { id: string; askedById: string; askedOfId: string }): PickRow => ({
  subject: "s", body: "b", href: null, kind: "question", status: "open",
  probe: null, bribe: NOTHING, answer: null, answeredAt: null, createdAt: new Date("2026-09-01T12:00:00Z"),
  ...over,
});

test("asking costs you; being asked earns it back", () => {
  const quiet = audacity({ sent: 0, promised: 0, delivered: 0, received: 0 });
  assert.equal(quiet.score, 0);
  assert.equal(quiet.label, "Reasonable");
  assert.match(quiet.verdict, /have not picked anybody/i);

  const busy = audacity({ sent: 6, promised: 6, delivered: 0, received: 0 });
  const busyButAsked = audacity({ sent: 6, promised: 6, delivered: 0, received: 5 });
  assert.ok(busy.score > busyButAsked.score, "a brain that gets picked earns credit back");

  // Nothing can ever record a delivery, so the worst case is reachable.
  const worst = audacity({ sent: 20, promised: 20, delivered: 0, received: 0 });
  assert.equal(worst.score, 100);
  assert.equal(worst.label, "You are the reason this page exists");
});

test("the score is bounded and never negative, however saintly you are", () => {
  const saint = audacity({ sent: 0, promised: 0, delivered: 40, received: 90 });
  assert.equal(saint.score, 0);
  assert.ok(saint.score >= 0 && saint.score <= 100);
});

test("the ledger counts what you promised, not what you paid", () => {
  assert.match(ledger({ sent: 0, promised: 0, delivered: 0, received: 0 }), /Nothing promised/);
  assert.match(ledger({ sent: 3, promised: 0, delivered: 0, received: 0 }), /Nothing offered in return/);
  const owed = ledger({ sent: 3, promised: 3, delivered: 0, received: 0 });
  assert.match(owed, /3 brains picked/);
  assert.match(owed, /0 delivered/);
  assert.match(owed, /3 outstanding/);
});

test("reciprocity names who is really being imposed on", () => {
  assert.match(reciprocity({ sent: 5, promised: 0, delivered: 0, received: 0 }), /zero times/);
  assert.match(reciprocity({ sent: 1, promised: 0, delivered: 0, received: 9 }), /victim/);
  assert.match(reciprocity({ sent: 0, promised: 0, delivered: 0, received: 0 }), /quiet equilibrium/);
});

test("a probe reports what somebody did, not what they said", () => {
  // The line the whole feature exists for.
  assert.equal(
    probeVerdict("merch-starred", 0, "answered", "Yeseul"),
    "Yeseul says it is done. Yeseul has starred nothing.",
  );
  assert.match(probeVerdict("merch-starred", 3, "open", "Alison") ?? "", /starred 3 items.*Genuinely helped/);
  assert.match(probeVerdict("merch-starred", 1, "open", "Alison") ?? "", /starred 1 item\./);
  // No probe, or one nothing implements, makes no claim at all.
  assert.equal(probeVerdict(null, 0, "open", "Alison"), null);
  assert.equal(probeVerdict("not-a-probe", 0, "open", "Alison"), null);
  assert.ok(PROBES["merch-starred"], "the merch probe must exist for the first task");
});

test("every drafted speciality belongs to somebody, and strangers get the fallback", () => {
  for (const email of Object.keys(DRAFTED_SPECIALITIES)) {
    assert.equal(email, email.toLowerCase(), "keys are matched lowercase");
    assert.ok(DRAFTED_SPECIALITIES[email].speciality.length > 10);
  }
  assert.equal(draftedFor("SOMEBODY.ELSE@utoronto.ca").speciality, FALLBACK_SPECIALITY.speciality);
  assert.equal(draftedFor("  A.Stirling@utoronto.ca  ").speciality, DRAFTED_SPECIALITIES["a.stirling@utoronto.ca"].speciality);
});

test("a card falls back to a guess and says so once somebody writes a real one", () => {
  const profiles: ProfileRow[] = [{ userId: "u-al", speciality: "Actually written by a person", rate: "$0" }];
  const team = buildTeam(users, profiles, [], "u-me");
  const al = team.find((c) => c.id === "u-al");
  const ye = team.find((c) => c.id === "u-ye");
  assert.equal(al?.speciality, "Actually written by a person");
  assert.equal(al?.specialityIsGuess, false);
  assert.equal(ye?.specialityIsGuess, true, "no row means the line is still a guess");
  assert.equal(ye?.speciality, DRAFTED_SPECIALITIES["yes.lee@utoronto.ca"].speciality);
});

test("you come first on your own page, and cannot pick your own brain", () => {
  const team = buildTeam(users, [], [], "u-me");
  assert.equal(team[0].id, "u-me");
  assert.equal(team[0].isYou, true);
  assert.deepEqual(pickable(team).map((c) => c.id), ["u-al", "u-ye"]);
  assert.equal(pickable(team).length, users.length - 1);
});

test("counts on a card are yours alone, not the team's total", () => {
  const picks: PickRow[] = [
    pick({ id: "p1", askedById: "u-me", askedOfId: "u-al", status: "answered" }),
    pick({ id: "p2", askedById: "u-me", askedOfId: "u-al" }),
    // Somebody else asking Alison must not show up on your card.
    pick({ id: "p3", askedById: "u-ye", askedOfId: "u-al" }),
  ];
  const al = buildTeam(users, [], picks, "u-me").find((c) => c.id === "u-al");
  assert.equal(al?.pickedByYou, 2);
  assert.equal(al?.answeredForYou, 1);
  assert.equal(al?.openFromYou, 1);
});

test("your totals separate what you asked from what was asked of you", () => {
  const picks: PickRow[] = [
    pick({ id: "p1", askedById: "u-me", askedOfId: "u-al", bribe: "a coffee" }),
    pick({ id: "p2", askedById: "u-me", askedOfId: "u-ye" }),
    pick({ id: "p3", askedById: "u-al", askedOfId: "u-me" }),
  ];
  const totals = askerTotals(picks, "u-me", NOTHING);
  assert.equal(totals.sent, 2);
  assert.equal(totals.promised, 1, "only the one with an offer counts");
  assert.equal(totals.delivered, 0, "nothing here can record a delivery");
  assert.equal(totals.received, 1);
});

test("outstanding is yours-and-open; waiting-on-you is theirs-and-open", () => {
  const picks: PickRow[] = [
    pick({ id: "old", askedById: "u-me", askedOfId: "u-al", createdAt: new Date("2026-09-01T00:00:00Z") }),
    pick({ id: "new", askedById: "u-me", askedOfId: "u-ye", createdAt: new Date("2026-09-08T00:00:00Z") }),
    pick({ id: "done", askedById: "u-me", askedOfId: "u-ye", status: "answered" }),
    pick({ id: "mine", askedById: "u-al", askedOfId: "u-me" }),
  ];
  assert.deepEqual(outstanding(picks, "u-me").map((p) => p.id), ["new", "old"], "newest first");
  assert.deepEqual(waitingOnYou(picks, "u-me").map((p) => p.id), ["mine"]);
});

test("the first task is wired to the merch board and to a probe that exists", () => {
  assert.equal(MERCH_BRIEF.href, "/admin/workspace/merch");
  assert.equal(MERCH_BRIEF.probe, "merch-starred");
  assert.ok(PROBES[MERCH_BRIEF.probe], "the brief's probe must be implemented");
  assert.equal(MERCH_BRIEF.kind, "task");
  assert.notEqual(MERCH_BRIEF.bribe, NOTHING, "at least pretend");
});

test("initials and first names survive missing data", () => {
  assert.equal(initialsOf("Yoo Jin Park"), "YP");
  assert.equal(initialsOf("Epshita"), "EP");
  assert.equal(initialsOf(null, "roshni.christo@utoronto.ca"), "R");
  assert.equal(initialsOf("", ""), "?");
  assert.equal(firstNameOf("Meenakshi Venkatesan"), "Meenakshi");
  assert.equal(firstNameOf(null), "They");
  assert.equal(firstNameOf("   "), "They");
});
