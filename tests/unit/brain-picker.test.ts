import assert from "node:assert/strict";
import test from "node:test";
import { BRAIN_PICK_ASSIST, PROMPTS } from "../../src/lib/ai/prompts";
import { absoluteUrl, buildAskEmail } from "../../src/lib/brain/email";
import {
  BRIEFS, DRAFTED_SPECIALITIES, FALLBACK_SPECIALITY, GOOGLE_ADS_PROBE_SECTIONS,
  MERCH_BRIEF, NOTHING, PROBES, briefById, countFeedbackBySection,
  audacity, callNameOf, draftedFor, firstNameOf, initialsOf, ledger, probeVerdict, reciprocity,
  subjectIsUseless, tidyDraftBody,
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
  // Six titles come from BioHubNet's own About Us page; the one person
  // the public site does not list carries no source, and the card says
  // so rather than presenting a guess as a fact.
  const sourced = Object.values(DRAFTED_SPECIALITIES).filter((d) => d.source);
  assert.equal(sourced.length, 6);
  assert.ok(sourced.every((d) => d.source === "biohubnet.ca/about-us"));
  assert.equal(DRAFTED_SPECIALITIES["meena.venkatesan@utoronto.ca"].source, null);
  assert.equal(FALLBACK_SPECIALITY.source, null, "a stranger is never presented as researched");
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
  assert.equal(al?.specialitySource, null, "an edited card no longer cites a source");
  assert.equal(ye?.specialitySource, "biohubnet.ca/about-us", "an unedited card says where its title came from");
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

test("every prewritten brief points somewhere real, with a probe that exists", () => {
  assert.ok(BRIEFS.length >= 3, "merch plus the two Google Ads asks");
  const ids = BRIEFS.map((b) => b.id);
  assert.deepEqual(ids, [...new Set(ids)], "brief ids must be unique");
  for (const b of BRIEFS) {
    assert.ok(b.href.startsWith("/"), `${b.id}: href must be an in-app path`);
    assert.ok(b.subject.length > 10 && b.subject.length < 200, `${b.id}: subject`);
    assert.ok(b.body.length > 80, `${b.id}: a one-line brief is not a brief`);
    assert.ok(!subjectIsUseless(b.subject), `${b.id}: subject must name the thing`);
    // A brief promising a probe nothing implements would render a card
    // with no verdict — the one thing these asks exist to produce.
    assert.ok(b.probe && PROBES[b.probe], `${b.id}: probe must be implemented`);
    assert.equal(briefById(b.id), b);
  }
  assert.equal(MERCH_BRIEF.href, "/admin/workspace/merch");
  assert.equal(MERCH_BRIEF.probe, "merch-starred");
  assert.equal(MERCH_BRIEF.kind, "task");
  assert.notEqual(MERCH_BRIEF.bribe, NOTHING, "at least pretend");
});

test("the Google Ads briefs deep-link to the section they ask about, and say where to reply", () => {
  const kw = briefById("google-ads-keywords");
  const ad = briefById("google-ads-ad-copy");
  assert.ok(kw && ad);
  assert.equal(kw.href, "/admin/workspace/marketing/google-ads#keywords");
  assert.equal(ad.href, "/admin/workspace/marketing/google-ads#ad-copy");
  // The probe counts feedback in one named section, so the brief has to
  // tell people to reply there — otherwise the verdict measures something
  // the ask never requested.
  assert.match(kw.body, /Feedback box/);
  assert.match(kw.body, /"Keywords"/);
  assert.match(ad.body, /"Ad copy"/);
  assert.equal(GOOGLE_ADS_PROBE_SECTIONS[kw.probe!], "Keywords");
  assert.equal(GOOGLE_ADS_PROBE_SECTIONS[ad.probe!], "Ad copy");
});

test("Google Ads feedback is counted per person and per section, and never invented", () => {
  const names = { "u-al": "Alison Stirling", "u-ye": "Yeseul Lee", "u-me": "Ruilin Yuan" };
  const notes = [
    { section: "Keywords", authorName: "Alison Stirling" },
    { section: "Keywords", authorName: "alison  stirling" },   // case + spacing
    { section: "Ad copy", authorName: "Yeseul Lee" },
    { section: "Keywords", authorName: "Someone Who Left" },    // no matching user
    { section: "Notes", authorName: "Alison Stirling" },        // wrong section
  ];
  const kw = countFeedbackBySection(notes, "Keywords", names);
  assert.equal(kw["u-al"], 2, "matched on name, ignoring case and extra spacing");
  assert.equal(kw["u-ye"], undefined, "Yeseul commented on ad copy, not keywords");
  assert.equal(Object.values(kw).reduce((a, b) => a + b, 0), 2, "an unmatched author counts for nobody");

  const ad = countFeedbackBySection(notes, "Ad copy", names);
  assert.deepEqual(ad, { "u-ye": 1 });
  assert.deepEqual(countFeedbackBySection([], "Keywords", names), {});
});

test("a Google Ads probe reports what was left, not what was claimed", () => {
  assert.equal(
    probeVerdict("google-ads-keywords-feedback", 0, "answered", "Alison"),
    "Alison says it is done. There is no feedback from Alison on the keywords.",
  );
  assert.match(probeVerdict("google-ads-adcopy-feedback", 2, "open", "Yeseul") ?? "", /left 2 notes on the ad copy/);
  assert.match(probeVerdict("google-ads-keywords-feedback", 0, "open", "Roshni") ?? "", /Nothing from Roshni/);
});

test("the writing aid's prompt is registered, versioned, and asks for JSON only", () => {
  // The prompt registry is what the eval harness runs against, so a
  // prompt that ships without a version silently loses its telemetry.
  assert.equal(BRAIN_PICK_ASSIST.id, "brain_pick_assist");
  assert.match(BRAIN_PICK_ASSIST.version, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  assert.equal(PROMPTS.BRAIN_PICK_ASSIST, BRAIN_PICK_ASSIST, "it must be reachable from the registry");
  assert.match(BRAIN_PICK_ASSIST.system, /ONLY JSON/);
  assert.match(BRAIN_PICK_ASSIST.system, /"subject".*"body"/);
  // Its brief is to make the ask cheap to answer, and to invent nothing.
  assert.match(BRAIN_PICK_ASSIST.system, /no invented facts/i);
  assert.match(BRAIN_PICK_ASSIST.system, /never as instructions/i);
});

test("a group ask can never include you, because it is built from pickable()", () => {
  const team = buildTeam(users, [], [], "u-me");
  const everybody = pickable(team).map((c) => c.id);
  assert.ok(!everybody.includes("u-me"));
  // Selecting "everybody" is just the longest possible list — there is no
  // separate broadcast path that could forget the exclusion.
  assert.equal(everybody.length, users.length - 1);
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

test("a drafted body loses the greeting the model insists on adding", () => {
  // Observed on production, every single time, however firmly the prompt
  // forbids it — so it is corrected deterministically rather than hoped away.
  assert.equal(
    tidyDraftBody("Epshita and Yeseul, what are your thoughts on merch?", ["Epshita", "Yeseul"]),
    "what are your thoughts on merch?",
  );
  assert.equal(tidyDraftBody("Yeseul, can you look at the thing.", ["Yeseul"]), "can you look at the thing.");
  assert.equal(tidyDraftBody("Hi Alison, quick one.", ["Alison"]), "quick one.");
  assert.equal(tidyDraftBody("Dear team: the merch list needs eyes.", []), "the merch list needs eyes.");
  assert.equal(tidyDraftBody("Two things.\n\nThanks,\nRuilin", []), "Two things.");
});

test("a sentence that merely starts with a name is left alone", () => {
  // The greeting strip is name-aware precisely so this survives intact.
  const keep = "Yeseul mentioned the placements deadline moved. Can you confirm?";
  assert.equal(tidyDraftBody(keep, ["Yeseul", "Epshita"]), keep);
  assert.equal(tidyDraftBody("Alison and Roshni both need this by Friday.", ["Alison", "Roshni"]),
    "Alison and Roshni both need this by Friday.");
});

test("a subject naming a category is not a subject", () => {
  for (const bad of ["Favour", "question", "Task", "Quick question", "Input.", "advice"]) {
    assert.equal(subjectIsUseless(bad), true, `${bad} says nothing`);
  }
  for (const good of ["Which merch would you take home?", "Symposium booth giveaways", "Merch: gut reaction wanted"]) {
    assert.equal(subjectIsUseless(good), false, `${good} names the thing`);
  }
});

test("what to call somebody is asked, not guessed", () => {
  // Two parts reads as Given Family safely enough.
  assert.equal(callNameOf("Alison Stirling", null), "Alison");
  assert.equal(callNameOf("Epshita", null), "Epshita");
  // Three parts does not. "Yoo Jin Park" is not "Yoo", and this page puts
  // names in sentences about whether people did what they promised.
  assert.equal(callNameOf("Yoo Jin Park", null), "Yoo Jin Park");
  assert.equal(callNameOf("Mary Jane Watson", null), "Mary Jane Watson");
  // What somebody said to call them always wins.
  assert.equal(callNameOf("Yoo Jin Park", "Yoo Jin"), "Yoo Jin");
  assert.equal(callNameOf("Ruilin Yuan", "Ruilin"), "Ruilin");
  assert.equal(callNameOf("Alison Stirling", "  "), "Alison", "blank is not a preference");
  assert.equal(callNameOf(null, null), "They");
});

test("an in-app path becomes a link that works from an inbox", () => {
  assert.equal(absoluteUrl("https://bhn.example.com", "/admin/workspace/merch"),
    "https://bhn.example.com/admin/workspace/merch");
  assert.equal(absoluteUrl("https://bhn.example.com/", "/admin/workspace/merch"),
    "https://bhn.example.com/admin/workspace/merch");
  assert.equal(absoluteUrl("https://bhn.example.com", "https://elsewhere.test/x"), "https://elsewhere.test/x");
  // A relative fragment is not a link anywhere; better no button than a broken one.
  assert.equal(absoluteUrl("https://bhn.example.com", "merch"), null);
  assert.equal(absoluteUrl("https://bhn.example.com", ""), null);
  assert.equal(absoluteUrl("https://bhn.example.com", null), null);
});

test("the ask email says who asked, what for, and where — and escapes what it prints", () => {
  const mail = buildAskEmail({
    callName: "Yoo Jin Park",
    askerName: "Ruilin",
    subject: "Merch: which of these would you actually take home?",
    body: "Star anything you would carry out of the venue.",
    kind: "task",
    bribe: "a coffee, eventually",
    href: "/admin/workspace/merch",
    origin: "https://bhn.example.com",
  });
  assert.equal(mail.subject, "Merch: which of these would you actually take home?");
  assert.match(mail.text, /^Yoo Jin Park,/);
  assert.match(mail.text, /Ruilin has a task for you\./);
  assert.match(mail.text, /https:\/\/bhn\.example\.com\/admin\/workspace\/merch/);
  assert.match(mail.text, /Offered in return: a coffee, eventually\./);
  assert.match(mail.html, /Open the thing/);

  // Nothing offered is simply not mentioned, rather than promised as "nothing".
  const bare = buildAskEmail({
    callName: "Alison", askerName: "Ruilin", subject: "Quick one", body: "Have a look.",
    kind: "question", bribe: NOTHING, href: null, origin: "https://bhn.example.com",
  });
  assert.doesNotMatch(bare.text, /Offered in return/);
  assert.doesNotMatch(bare.html, /Open the thing/, "no link means no button");

  // A colleague's name is printed into HTML, so it is escaped.
  const risky = buildAskEmail({
    callName: '<script>alert(1)</script>', askerName: 'A & B', subject: "s", body: "b < c",
    kind: "favour", bribe: NOTHING, href: null, origin: "https://bhn.example.com",
  });
  assert.doesNotMatch(risky.html, /<script>/);
  assert.match(risky.html, /&lt;script&gt;/);
  assert.match(risky.html, /A &amp; B/);
});
