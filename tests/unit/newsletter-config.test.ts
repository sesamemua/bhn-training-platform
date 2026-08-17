import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CONFIG,
  isApprover,
  leadRecipients,
  parseConfig,
} from "../../src/lib/newsletter/config";
import {
  composeReminder,
  monthLabel,
  longDate,
  wrapForManualSend,
} from "../../src/lib/newsletter/reminders";
import { planCycle } from "../../src/lib/newsletter/schedule";

const CYCLE = planCycle(2026, 8);
const CTX = { config: DEFAULT_CONFIG, cycle: CYCLE, workshopUrl: "https://x.test/nl" };

test("config parsing is total — junk degrades to defaults, never throws", () => {
  assert.deepEqual(parseConfig(null), DEFAULT_CONFIG);
  assert.deepEqual(parseConfig("nonsense"), DEFAULT_CONFIG);
  assert.deepEqual(parseConfig({}), DEFAULT_CONFIG);
  assert.deepEqual(parseConfig({ schedule: { sendWeekday: 99 } }).schedule.sendWeekday, 3);
  // Monday and Friday can never be configured as the send day.
  assert.equal(parseConfig({ schedule: { sendWeekday: 1 } }).schedule.sendWeekday, 3);
  assert.equal(parseConfig({ schedule: { sendWeekday: 5 } }).schedule.sendWeekday, 3);
  // Thursday is allowed and survives.
  assert.equal(parseConfig({ schedule: { sendWeekday: 4 } }).schedule.sendWeekday, 4);
});

test("bad recipients are dropped rather than mailed", () => {
  const c = parseConfig({
    leads: [
      { section: "engage", name: "Real", email: "real@utoronto.ca" },
      { section: "experience", name: "Broken", email: "not-an-email" },
      { section: "equip", name: "NoEmail" },
    ],
    cc: ["ok@utoronto.ca", "nope"],
  });
  assert.deepEqual(c.leads.map((l) => l.email), ["real@utoronto.ca"]);
  assert.deepEqual(c.cc, ["ok@utoronto.ca"]);
});

test("an empty lead list falls back to the defaults instead of mailing nobody", () => {
  assert.deepEqual(parseConfig({ leads: [] }).leads, DEFAULT_CONFIG.leads);
});

test("window lengths are clamped to something sane", () => {
  assert.equal(parseConfig({ schedule: { draftDays: 0 } }).schedule.draftDays, 2);
  assert.equal(parseConfig({ schedule: { draftDays: 999 } }).schedule.draftDays, 2);
  assert.equal(parseConfig({ schedule: { draftDays: 4 } }).schedule.draftDays, 4);
});

test("only the configured approver may approve", () => {
  assert.equal(isApprover(DEFAULT_CONFIG, DEFAULT_CONFIG.approver.email), true);
  assert.equal(isApprover(DEFAULT_CONFIG, DEFAULT_CONFIG.approver.email.toUpperCase()), true);
  assert.equal(isApprover(DEFAULT_CONFIG, "someone.else@utoronto.ca"), false);
  assert.equal(isApprover(DEFAULT_CONFIG, null), false);
  assert.equal(isApprover(DEFAULT_CONFIG, ""), false);
});

test("the three program leads are the draft-request audience, Yoo Jin is cc", () => {
  const to = leadRecipients(DEFAULT_CONFIG);
  assert.equal(to.length, 3);
  assert.ok(to.some((e) => e.startsWith("epshita")));
  assert.ok(to.some((e) => e.startsWith("yes.lee")));
  assert.ok(to.some((e) => e.startsWith("roshni")));
  assert.deepEqual(DEFAULT_CONFIG.cc, ["yoojin.park@utoronto.ca"]);
  assert.ok(!to.includes("yoojin.park@utoronto.ca"), "the cc must not also be a To");
});

test("draft request tells leads the deadline and goes to leads cc the coordinator's lead", () => {
  const m = composeReminder({ ...CTX, kind: "draft_request" });
  assert.deepEqual(m.to, leadRecipients(DEFAULT_CONFIG));
  assert.deepEqual(m.cc, DEFAULT_CONFIG.cc);
  assert.match(m.subject, /August 2026/);
  assert.match(m.text, /Friday, August 14/); // the draft deadline
  assert.match(m.text, /https:\/\/x\.test\/nl/);
});

test("approval goes only to the approver, send-day only to the coordinator", () => {
  const approval = composeReminder({ ...CTX, kind: "approval" });
  assert.deepEqual(approval.to, [DEFAULT_CONFIG.approver.email]);
  assert.deepEqual(approval.cc, []);

  const sendDay = composeReminder({ ...CTX, kind: "send_day" });
  assert.deepEqual(sendDay.to, [DEFAULT_CONFIG.coordinator.email]);
  assert.deepEqual(sendDay.cc, []);
});

test("manual mode redirects the whole message to the coordinator and nobody else", () => {
  const base = composeReminder({ ...CTX, kind: "draft_request" });
  const wrapped = wrapForManualSend(base, DEFAULT_CONFIG, "draft_request");

  assert.deepEqual(wrapped.to, [DEFAULT_CONFIG.coordinator.email]);
  assert.deepEqual(wrapped.cc, []);
  // No lead address may survive as an actual recipient.
  for (const lead of leadRecipients(DEFAULT_CONFIG)) {
    assert.ok(!wrapped.to.includes(lead), `${lead} must not be a recipient in manual mode`);
    assert.ok(!(wrapped.cc as string[]).includes(lead), `${lead} must not be cc'd in manual mode`);
    // …but must still be printed, so the human knows who to forward to.
    assert.ok(wrapped.text.includes(lead), `${lead} must be listed in the body`);
  }
  assert.match(wrapped.subject, /^\[Send this\]/);
  assert.match(wrapped.text, /ACTION NEEDED/);
});

test("every reminder kind composes without throwing and names the month", () => {
  for (const kind of ["draft_request", "draft_due", "approval", "send_day"] as const) {
    const m = composeReminder({ ...CTX, kind });
    assert.ok(m.subject.length > 0, `${kind} has no subject`);
    assert.ok(m.text.length > 0, `${kind} has no text part`);
    assert.ok(m.html.includes("<table"), `${kind} html is not table-based`);
    assert.ok(m.to.length > 0, `${kind} has no recipients`);
    assert.match(m.text, /August 2026|today/, `${kind} does not identify the issue`);
  }
});

test("reminder HTML escapes its interpolations", () => {
  const evil = {
    ...DEFAULT_CONFIG,
    coordinator: { name: '"><script>alert(1)</script>', email: "x@y.ca" },
  };
  const m = composeReminder({ ...CTX, config: evil, kind: "send_day" });
  assert.ok(!m.html.includes("<script>"), "raw script tag leaked into the HTML");
});

test("date helpers render Toronto-style labels without timezone drift", () => {
  assert.equal(monthLabel("2026-08-01"), "August 2026");
  assert.equal(longDate("2026-08-19"), "Wednesday, August 19");
  // A date at the very start of a month must not slip to the previous one.
  assert.equal(monthLabel("2026-01-01"), "January 2026");
  assert.equal(longDate("2026-01-01"), "Thursday, January 1");
});
