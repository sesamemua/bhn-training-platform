import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { NewsletterPageReview } from "../../src/components/workspace/NewsletterPageReview";
import { WorkshopIcon } from "../../src/components/training-week/WorkshopIcon";

function loadModule(path: string, mocks: Record<string, unknown>) {
  const require = createRequire(import.meta.url);
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports: Record<string, any> = {};
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? require(id), exports);
  return exports;
}

test("review invitations are authenticated, staff-only, deduplicated and report partial delivery", async () => {
  let authorized = true, configured = true, issueExists = true, reviewStatus = "open", invalidTeam = false;
  const calls: any[] = [], audits: any[] = [];
  const team = [{ id: "one", name: "Colleague One", email: "one@example.com" }, { id: "two", name: "Colleague Two", email: "two@example.com" }];
  const api = loadModule("src/lib/newsletter/review-invites.ts", {
    "@/lib/auth": { requireRole: async (role: string) => { assert.equal(role, "instructor"); return authorized ? { user: { id: "editor", name: "Editor", email: "editor@example.com" } } : null; } },
    "@/lib/mail": { mailConfigured: () => configured, sendMail: async (mail: any) => { if (mail.to === "two@example.com") throw new Error("SMTP unavailable"); calls.push(mail); } },
    "@/lib/prisma": { prisma: {
      newsletterIssue: { findUnique: async () => issueExists ? { title: "October Newsletter" } : null },
      pageReview: { findUnique: async ({ where }: any) => { assert.equal(where.id, "newsletter-october"); return reviewStatus ? { status: reviewStatus } : null; } },
      user: { findMany: async ({ where, select }: any) => {
        assert.equal(where.isActive, true);
        assert.deepEqual(where.role.in, ["instructor", "admin", "superadmin"]);
        assert.deepEqual(select, { id: true, name: true, email: true });
        return invalidTeam ? [] : team.filter((who) => !where.id || where.id.in.includes(who.id));
      } },
      auditLog: { create: async (row: any) => { audits.push(row); } },
    } },
  });
  authorized = false;
  assert.equal((await api.newsletterReviewTeam()).error, "Forbidden");
  assert.equal((await api.sendNewsletterReviewInvites({ issueId: "october", userIds: ["one"] })).error, "Forbidden");
  authorized = true;
  assert.equal((await api.newsletterReviewTeam()).colleagues.length, 2);
  for (const userIds of [[], Array(21).fill("one"), [""], "one"]) {
    assert.match((await api.sendNewsletterReviewInvites({ issueId: "october", userIds })).error, /Choose up to/);
  }
  issueExists = false;
  assert.match((await api.sendNewsletterReviewInvites({ issueId: "october", userIds: ["one"] })).error, /Start this issue/);
  issueExists = true; reviewStatus = "";
  assert.match((await api.sendNewsletterReviewInvites({ issueId: "october", userIds: ["one"] })).error, /Start this issue/);
  reviewStatus = "closed";
  assert.match((await api.sendNewsletterReviewInvites({ issueId: "october", userIds: ["one"] })).error, /closed/);
  reviewStatus = "open"; invalidTeam = true;
  assert.match((await api.sendNewsletterReviewInvites({ issueId: "october", userIds: ["outsider"] })).error, /active colleagues/);
  invalidTeam = false; configured = false;
  assert.match((await api.sendNewsletterReviewInvites({ issueId: "october", userIds: ["one"] })).error, /not configured/);
  assert.equal(calls.length, 0);
  configured = true;
  const success = await api.sendNewsletterReviewInvites({ issueId: "october", userIds: ["one", "one"] });
  assert.deepEqual(success.sent, ["one"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].to, "one@example.com");
  assert.equal(calls[0].replyTo, "editor@example.com");
  assert.match(calls[0].text, /\/newsletter\/review\?issue=october/);
  assert.doesNotMatch(calls[0].text, /bhn-reviewer|shareToken/);
  assert.equal(audits[0].data.action, "newsletter.review.invite");
  const partial = await api.sendNewsletterReviewInvites({ issueId: "october", userIds: ["one", "two"] });
  assert.deepEqual(partial.sent, ["one"]);
  assert.match(partial.error, /unsent recipients/);
});

test("past issues exclude current and future drafts but keep sent issues, without creating data", async () => {
  let authorized = true, currentSent = false;
  let query: any;
  const Page = loadModule("src/app/(dashboard)/admin/workspace/marketing/newsletter/past/page.tsx", {
    "next/link": { __esModule: true, default: ({ children, ...props }: any) => createElement("a", props, children) },
    "next/navigation": { redirect: () => { throw new Error("login"); } },
    "@/lib/auth": { requireRole: async () => authorized ? { user: { role: "admin" } } : null, deniedRedirect: async () => "/login" },
    "@/lib/newsletter/currentIssue": { currentCycle: async () => ({ issueId: "current", month: "2026-10-01" }) },
    "@/components/ui/PageHero": { PageHero: ({ title }: any) => createElement("h1", null, title) },
    "@/components/workspace/NewsletterNav": { NewsletterNav: () => null },
    "@/lib/prisma": { prisma: {
      newsletterCycle: { findMany: async () => [{ issueId: "future" }] },
      newsletterIssue: {
        findFirst: async ({ where }: any) => { assert.equal(where.status.not, "sent"); return currentSent ? null : { id: "current" }; },
        findMany: async (args: any) => { query = args; return [{ id: "september", title: "September newsletter", dateline: "September 2026", status: "sent", updatedAt: new Date("2026-09-29T12:00:00Z"), _count: { pieces: 4 } }]; },
      },
    } },
  }).default;
  const html = renderToStaticMarkup(await Page());
  assert.deepEqual(query.where.id.notIn, ["current", "future"]);
  assert.match(html, /September newsletter/);
  assert.match(html, /review\?issue=september/);
  assert.match(html, /4 contributions/);
  assert.match(html, /sent/);
  currentSent = true;
  await Page();
  assert.deepEqual(query.where.id.notIn, ["future"], "a sent current cycle belongs in Past issues too");
  authorized = false;
  await assert.rejects(Page(), /login/);
});

test("newsletter has an issue-specific sharing control and chameleon is no longer generic bubbles", () => {
  const html = renderToStaticMarkup(createElement(NewsletterPageReview, {
    issueId: "october", html: "", initialReview: { id: "newsletter-october", status: "open", round: 1 }, canEdit: false,
  }));
  assert.match(html, /Send review link/);
  const icon = renderToStaticMarkup(createElement(WorkshopIcon, { slug: "communication-chameleon-2026" }));
  assert.match(icon, /lucide-talking-chameleon/);
  assert.doesNotMatch(icon, /lucide-messages-square/);
});

test("shared issue links retain their issue and sign-off after login, without resolving or creating a current issue", async () => {
  let authorized = true, found = true, returnTo = "";
  const Page = loadModule("src/app/(dashboard)/admin/workspace/marketing/newsletter/review/page.tsx", {
    "next/navigation": { redirect: () => { throw new Error("login"); }, notFound: () => { throw new Error("not found"); } },
    "@/lib/auth": { requireRole: async () => authorized ? { user: { role: "admin" } } : null, deniedRedirect: async (path: string) => { returnTo = path; return "/login"; } },
    "@/lib/newsletter/currentIssue": { resolveCurrentIssue: async () => { throw new Error("must not create an issue"); } },
    "@/lib/newsletter/config": { getNewsletterConfig: async () => ({ approver: { name: "Approver" } }), isApprover: () => false },
    "@/lib/newsletter/render": { renderIssue: () => { throw new Error("sent issues must use their saved HTML"); } },
    "@/components/ui/PageHero": { PageHero: ({ description }: any) => createElement("h1", null, description) },
    "@/components/workspace/NewsletterNav": { NewsletterNav: () => null },
    "@/components/workspace/NewsletterPageReview": { NewsletterPageReview: ({ issueId, html }: any) => createElement("div", null, issueId, html) },
    "@/components/workspace/NewsletterReviewClient": { SignOff: ({ signOff }: any) => createElement("p", null, signOff.cycleId) },
    "@/components/workspace/PastedNewsletterReview": { PastedNewsletterReview: () => null },
    "@/lib/prisma": { prisma: {
      codeReview: { findFirst: async () => null },
      newsletterIssue: { findUnique: async ({ where }: any) => { assert.equal(where.id, "september"); return found ? { id: "september", title: "September Newsletter", dateline: "September 2026", pieces: [], status: "sent", renderedHtml: "Saved published HTML" } : null; } },
      newsletterCycle: { findFirst: async ({ where }: any) => { assert.equal(where.issueId, "september"); return { id: "september-cycle", sendDate: "2026-09-23" }; } },
      newsletterComment: { findMany: async ({ where }: any) => { assert.equal(where.issueId, "september"); return []; } },
      pageReview: { findUnique: async ({ where }: any) => { assert.equal(where.id, "newsletter-september"); return null; } },
    } },
  }).default;
  const props = { searchParams: Promise.resolve({ issue: "september" }) };
  const html = renderToStaticMarkup(await Page(props));
  assert.match(html, /September Newsletter/);
  assert.match(html, /Saved published HTML/);
  assert.match(html, /september-cycle/);
  found = false;
  await assert.rejects(Page(props), /not found/);
  authorized = false;
  await assert.rejects(Page(props), /login/);
  assert.equal(returnTo, "/admin/workspace/marketing/newsletter/review?issue=september");
});
