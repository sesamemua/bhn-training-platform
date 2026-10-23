/* eslint-disable @typescript-eslint/no-explicit-any -- VM fixtures mock runtime Prisma shapes. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { buildTrainingEmailReview, trainingEmailReviewId, trainingEmailReviewLink } from "../../src/lib/training-week/email-review";
import { resolveTemplates } from "../../src/lib/allocation/email-templates";
import { SESSIONS, torontoToUtc } from "../../src/lib/training-week/schedule-2026";

const workshops = SESSIONS.map((s) => ({ slug: s.slug, title: s.title, startDateTime: torontoToUtc(s.day, s.start), endDateTime: torontoToUtc(s.day, s.end), locationName: s.venue.name }));

test("review contains both current reminders for all six workshops, real local times, locations and signature", () => {
  const result = buildTrainingEmailReview(workshops, resolveTemplates([]), "BioHubNet signature");
  assert.equal(result.emailCount, 12);
  assert.equal(result.workshopCount, 6);
  assert.deepEqual(result.issues, []);
  for (const workshop of workshops) {
    assert.equal(result.html.split(`id="email-${workshop.slug}-`).length - 1, 2);
    assert.ok(result.html.includes(workshop.locationName!.replace(/&/g, "&amp;")));
  }
  assert.match(result.html, /Monday 26 October/);
  assert.match(result.html, /09:00–14:00/);
  assert.match(result.html, /12:00–16:30/);
  assert.match(result.html, /09:30–14:00/);
  assert.equal(result.html.split("BioHubNet signature").length - 1, 12);
  assert.match(result.html, /https:\/\/example.invalid\/personal-check-in/);
  assert.doesNotMatch(result.html, /\/training-week\/pass\/|bhn-reviewer|\{\{/);
  assert.equal(buildTrainingEmailReview([...workshops].reverse(), resolveTemplates([]), "BioHubNet signature").html, result.html, "snapshot is deterministic");
});

test("saved wording is rendered and unsafe input escaped; omitted logistics are flagged", () => {
  const templates = resolveTemplates([{ id: "reminder_3day", subject: "Changed {{session}}", body: "Hello {{first_name}}\n\n<script>do not run</script>" }]);
  const result = buildTrainingEmailReview([{ ...workshops[0], title: "Tour <img src=x>", locationName: null }], templates, "Team");
  assert.match(result.html, /Changed Tour &lt;img src=x&gt;/);
  assert.match(result.html, /&lt;script&gt;/);
  assert.doesNotMatch(result.html, /<script>|<img src=x>/);
  assert.ok(result.issues.some((issue) => issue.includes("location is not set")));
  for (const field of ["session_time", "session_venue", "check_in_link"]) assert.ok(result.issues.some((issue) => issue.includes(`{{${field}}}`)));
  assert.match(trainingEmailReviewLink("event-1"), /^\/api\/workspace\/page-review\/training-week-emails-event-1\/launch$/);
});

function loadModule(file: string, mocks: Record<string, unknown>) {
  const require = createRequire(import.meta.url);
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports: Record<string, any> = {};
  new Function("require", "exports", code)((id: string) => mocks[id] ?? require(id), exports);
  return exports;
}

function fixture() {
  const state = { authorized: true, configured: true, override: "", concurrent: false, failArchive: false, inactive: false, signature: "Team signature" };
  let row: any = null;
  const versions = new Map<number, string>();
  const sends: any[] = [], audits: any[] = [];
  const team = [{ id: "one", name: "One", email: "one@example.com" }, { id: "two", name: "Two", email: "two@example.com" }];
  const db: any = {
    bhnEvent: { findUnique: async ({ where, select }: any) => {
      assert.deepEqual(Object.keys(select), ["workshops"]);
      assert.equal(select.workshops.where.isActive, true);
      assert.equal("bookings" in select.workshops.select, false);
      return where.id === "event-1" ? { workshops } : null;
    } },
    platformSetting: { findUnique: async () => ({ value: state.override }) },
    pageReview: {
      findUnique: async () => row && { ...row },
      upsert: async ({ create, update }: any) => { assert.deepEqual(update, {}); row ??= { ...create, round: 1, status: "open", comments: ["existing-comment"] }; return row; },
      updateMany: async ({ where, data }: any) => {
        if (state.concurrent || row.round !== where.round) return { count: 0 };
        row = { ...row, ...data, round: row.round + data.round.increment };
        return { count: 1 };
      },
    },
    pageReviewVersion: { upsert: async ({ create }: any) => { if (state.failArchive) throw new Error("Archive failed"); if (!versions.has(create.round)) versions.set(create.round, create.html); } },
    user: { findMany: async ({ where }: any) => {
      assert.equal(where.isActive, true);
      assert.deepEqual(where.role.in, ["instructor", "admin", "superadmin"]);
      return state.inactive ? [] : team.filter((who) => where.id.in.includes(who.id));
    } },
    auditLog: { create: async (input: any) => { audits.push(input); } },
    $transaction: async (operation: any) => {
      const previous = { ...row };
      try { return await operation(db); } catch (error) { row = previous; throw error; }
    },
  };
  const api = loadModule("src/app/(dashboard)/admin/workspace/training-admin/email-review-actions.ts", {
    "@/lib/auth": { requireRole: async (role: string) => { assert.equal(role, "admin"); return state.authorized ? { user: { id: "admin", name: "Admin", email: "admin@example.com" } } : null; } },
    "@/lib/prisma": { prisma: db },
    "@/lib/mail": { currentSignature: async () => state.signature, mailConfigured: () => state.configured, sendMail: async (mail: any) => { if (mail.to === "two@example.com") throw new Error("SMTP failed"); sends.push(mail); } },
    "@/lib/allocation/email-templates": { parseOverrides: (raw: string) => raw ? JSON.parse(raw) : [], resolveTemplates, TEMPLATES_KEY: "trainingWeek.emailTemplates" },
    "@/lib/newsletter/review-invites": { newsletterReviewTeam: async () => ({ groups: [{ userIds: team.map((who) => who.id), available: true }] }) },
    "@/lib/training-week/schedule-2026": { SESSIONS },
    "@/lib/training-week/email-review": { buildTrainingEmailReview, trainingEmailReviewId, trainingEmailReviewLink },
  });
  return { api, state, versions, sends, audits, row: () => row };
}

test("review creation and revisions require admin, reuse identity and preserve comments and history", async () => {
  const f = fixture();
  f.state.authorized = false;
  assert.equal((await f.api.loadTrainingEmailReview("event-1")).ok, false);
  assert.equal((await f.api.saveTrainingEmailReview({ eventId: "event-1" })).ok, false);
  assert.ok((await f.api.sendTrainingEmailReviewInvites({ eventId: "event-1", round: 1, userIds: ["one"] })).error);
  assert.equal(f.row(), null);
  f.state.authorized = true;
  assert.equal((await f.api.saveTrainingEmailReview({ eventId: "invalid/event" })).ok, false);
  assert.equal((await f.api.saveTrainingEmailReview({ eventId: "missing" })).ok, false);
  const opened = await f.api.saveTrainingEmailReview({ eventId: "event-1" });
  assert.equal(opened.bundle.review.round, 1);
  const original = { ...f.row() };
  await f.api.saveTrainingEmailReview({ eventId: "event-1", round: 1 });
  assert.equal(f.row().round, 1, "unchanged snapshots do not add revisions");
  f.state.override = JSON.stringify([{ id: "reminder_3day", subject: "Updated {{session}}", body: "{{session_time}} {{session_venue}} {{check_in_link}}" }]);
  assert.equal((await f.api.loadTrainingEmailReview("event-1")).bundle.stale, true);
  assert.match((await f.api.saveTrainingEmailReview({ eventId: "event-1", round: 2 })).error, /Another editor/);
  assert.match((await f.api.sendTrainingEmailReviewInvites({ eventId: "event-1", round: 1, userIds: ["one"] })).error, /emails changed/);
  const revised = await f.api.saveTrainingEmailReview({ eventId: "event-1", round: 1 });
  assert.equal(revised.bundle.review.id, opened.bundle.review.id);
  assert.equal(revised.bundle.review.round, 2);
  assert.equal(f.row().shareToken, original.shareToken);
  assert.deepEqual(f.row().comments, original.comments);
  assert.equal(f.versions.get(1), original.pastedHtml);
  f.state.signature = "New signature";
  f.state.concurrent = true;
  assert.match((await f.api.saveTrainingEmailReview({ eventId: "event-1", round: 2 })).error, /Another editor/);
  f.state.concurrent = false; f.state.failArchive = true;
  await assert.rejects(f.api.saveTrainingEmailReview({ eventId: "event-1", round: 2 }), /Archive failed/);
  assert.equal(f.row().round, 2, "archiving and advancement are atomic");
  f.row().status = "closed";
  assert.match((await f.api.saveTrainingEmailReview({ eventId: "event-1", round: 2 })).error, /closed/);
  assert.equal(f.sends.length, 0, "preparing or revising a review never sends email");
});

test("invitations reach only selected active colleagues, reject stale rounds and report partial delivery", async () => {
  const f = fixture();
  await f.api.saveTrainingEmailReview({ eventId: "event-1" });
  const input = { eventId: "event-1", round: 1, userIds: ["one"] };
  assert.ok((await f.api.sendTrainingEmailReviewInvites({ ...input, userIds: [] })).error);
  assert.ok((await f.api.sendTrainingEmailReviewInvites({ ...input, userIds: ["attendee"] })).error);
  assert.ok((await f.api.sendTrainingEmailReviewInvites({ ...input, round: 2 })).error);
  f.state.configured = false;
  assert.match((await f.api.sendTrainingEmailReviewInvites(input)).error, /not configured/);
  f.state.configured = true; f.state.inactive = true;
  assert.match((await f.api.sendTrainingEmailReviewInvites(input)).error, /unavailable/);
  f.state.inactive = false;
  const sent = await f.api.sendTrainingEmailReviewInvites({ ...input, userIds: ["one", "one"] });
  assert.deepEqual(sent.sent, ["one"]);
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].to, "one@example.com");
  assert.equal(f.sends[0].replyTo, "admin@example.com");
  assert.match(f.sends[0].text, /12 email previews cover 6 workshops/);
  assert.match(f.sends[0].text, /\/api\/workspace\/page-review\/training-week-emails-event-1\/launch/);
  assert.doesNotMatch(f.sends[0].text, /bhn-reviewer|shareToken|personal-check-in/);
  assert.equal(f.audits[0].data.action, "training_week.email_review.invite");
  const partial = await f.api.sendTrainingEmailReviewInvites({ ...input, userIds: ["one", "two"] });
  assert.deepEqual(partial.sent, ["one"]);
  assert.match(partial.error, /unsent colleagues/);
});

test("workshop email review never offers guest names or grants anonymous commenting", async () => {
  const review = { id: "training-week-emails-event-1", status: "open", title: "Email review" };
  let minted = false;
  const api = loadModule("src/app/api/public/page-review/[token]/join/route.ts", {
    "@/lib/prisma": { prisma: { pageReview: { findUnique: async () => review } } },
    "@/lib/page-review/viewer": { createAnonViewerToken: async () => { minted = true; } },
  });
  const response = await api.POST(new Request("https://example.test/join", { method: "POST", body: JSON.stringify({ name: "Visitor" }) }), { params: Promise.resolve({ token: "token" }) });
  assert.equal(response.status, 403);
  assert.equal(minted, false);
  let accountRequired = false;
  const overlay = loadModule("src/app/api/public/page-review/[token]/overlay.js/route.ts", {
    "@/lib/prisma": { prisma: { pageReview: { findUnique: async () => review } } },
    "@/lib/page-review/overlay-source": { overlaySource: (_endpoint: string, _title: string, required: boolean) => { accountRequired = required; return ""; } },
  });
  await overlay.GET(new Request("https://example.test/overlay"), { params: Promise.resolve({ token: "token" }) });
  assert.equal(accountRequired, true);
});
