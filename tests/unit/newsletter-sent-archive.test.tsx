import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { NewsletterArchive } from "../../src/components/workspace/NewsletterArchive";
import * as archive from "../../src/lib/newsletter/archive";

const issueId = "mailchimp-us12-12345";
const saved = { version: 1, issueId, campaignId: "12345", sentAt: "2026-10-20", sendTimeText: "Tue, Oct 20, 2026 6:03 pm", archiveUrl: "https://mailchi.mp/biohubnet/october", subject: "October newsletter" };
const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function loadModule(path: string, mocks: Record<string, unknown>) {
  const require = createRequire(import.meta.url);
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: Record<string, any> = {};
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? require(id), exports);
  return exports;
}

test("archive metadata is campaign-bound and preserves the displayed send date without inferring a timezone", () => {
  assert.equal(archive.newsletterArchiveKey(issueId), "newsletter.archive.mailchimp.us12.12345");
  assert.equal(archive.newsletterArchiveKey("october-draft"), null);
  assert.equal(archive.newsletterArchiveKey("mailchimp-us12-../12345"), null);
  const parsed = archive.parseNewsletterArchiveMetadata(JSON.stringify(saved), issueId);
  assert.equal(parsed?.sentAt, "2026-10-20");
  assert.equal(archive.newsletterArchiveDateLabel(parsed), saved.sendTimeText);
  assert.equal(archive.newsletterArchiveDateLabel({ ...parsed!, sendTimeText: null }), saved.sentAt);
  for (const value of ["broken", "null", JSON.stringify({ ...saved, issueId: "other" }), JSON.stringify({ ...saved, campaignId: "23456" }), JSON.stringify({ ...saved, version: 2 })]) {
    assert.equal(archive.parseNewsletterArchiveMetadata(value, issueId), null);
  }
});

test("only an HTTPS mailchi.mp archive link is exposed", () => {
  assert.equal(archive.parseNewsletterArchiveMetadata(JSON.stringify(saved), issueId)?.archiveUrl, saved.archiveUrl);
  for (const archiveUrl of ["javascript:alert(1)", "https://mailchi.mp.evil.test/x", "https://evil.test/mailchi.mp", "http://mailchi.mp/x", "https://user:pass@mailchi.mp/x", "https://mailchi.mp:444/x"]) {
    assert.equal(archive.parseNewsletterArchiveMetadata(JSON.stringify({ ...saved, archiveUrl }), issueId)?.archiveUrl, null);
  }
});

test("sent viewer preserves exact source in an isolated visual iframe, with no review actions", () => {
  const source = '<!doctype html><html><head><style>h1{color:red}</style><script>parent.hacked=true</script></head><body><h1>Sent copy</h1><img src="https://example.com/image.jpg"><a href="https://biohubnet.ca">BioHubNet</a></body></html>';
  const output = renderToStaticMarkup(createElement(NewsletterArchive, { title: "October Newsletter", dateline: "October 2026", html: source, metadata: archive.parseNewsletterArchiveMetadata(JSON.stringify(saved), issueId) }));
  const frame = output.match(/<iframe\b[^>]*>/)![0];
  assert.ok(frame.includes(`srcDoc="${escapeAttribute(source)}"`));
  assert.ok(frame.includes('sandbox="allow-popups allow-popups-to-escape-sandbox"'));
  assert.ok(frame.includes('referrerPolicy="no-referrer"'));
  assert.ok(frame.includes('title="October Newsletter — sent newsletter"'));
  assert.match(output, /Sent Tue, Oct 20, 2026 6:03 pm/);
  assert.ok(output.includes(`href="${saved.archiveUrl}" target="_blank" rel="noopener noreferrer"`));
  assert.match(output, /View code/);
  assert.doesNotMatch(output, /Start review|Save|Send review request|Sign off|Open team review/);
  const component = readFileSync("src/components/workspace/NewsletterArchive.tsx", "utf8");
  assert.match(component, /value=\{html\} readOnly/);
  assert.doesNotMatch(component, /fetch\(|useEffect|dangerouslySetInnerHTML|allow-scripts|allow-same-origin/);
});

test("missing saved HTML has a clear fallback, not a generated empty newsletter", () => {
  const html = renderToStaticMarkup(createElement(NewsletterArchive, { title: "Old issue", dateline: "May 2025", html: null, metadata: null }));
  assert.match(html, /saved HTML is unavailable/);
  assert.doesNotMatch(html, /<iframe|Copy HTML|Start review/);
});

test("past issues separate sent Mailchimp copies from preserved drafts and show original send text", async () => {
  const Page = loadModule("src/app/(dashboard)/admin/workspace/marketing/newsletter/past/page.tsx", {
    "next/link": { __esModule: true, default: ({ children, ...props }: any) => createElement("a", props, children) },
    "next/navigation": { redirect: () => { throw new Error("unexpected redirect"); } },
    "@/lib/auth": { requireRole: async () => ({ user: { role: "instructor" } }), deniedRedirect: async () => "/login" },
    "@/lib/newsletter/currentIssue": { currentCycle: async () => ({ issueId: "current", month: "2026-11-01" }) },
    "@/lib/newsletter/archive": archive,
    "@/components/ui/PageHero": { PageHero: ({ title }: any) => createElement("h1", null, title) },
    "@/components/workspace/NewsletterNav": { NewsletterNav: () => null },
    "@/lib/prisma": { prisma: {
      newsletterCycle: { findMany: async () => [{ issueId: "future" }] },
      newsletterIssue: {
        findFirst: async () => ({ id: "current" }),
        findMany: async ({ where, orderBy }: any) => {
          assert.deepEqual(where.id.notIn, ["current", "future"]);
          assert.deepEqual(orderBy, { createdAt: "desc" });
          return [
            { id: issueId, title: "October sent", dateline: "October 2026", status: "sent", updatedAt: new Date(), _count: { pieces: 0 } },
            { id: "october-draft", title: "October working draft", dateline: "October 2026", status: "generated", updatedAt: new Date("2026-10-20T12:00:00Z"), _count: { pieces: 8 } },
          ];
        },
      },
      platformSetting: { findMany: async ({ where }: any) => { assert.deepEqual(where.key.in, [archive.newsletterArchiveKey(issueId)]); return [{ key: archive.newsletterArchiveKey(issueId), value: JSON.stringify(saved) }]; } },
    } },
  }).default;
  const output = renderToStaticMarkup(await Page());
  const sent = output.match(/<section aria-labelledby="sent-newsletters-heading">([\s\S]*?)<\/section>/)![1];
  const drafts = output.match(/<section aria-labelledby="earlier-newsletter-drafts-heading">([\s\S]*?)<\/section>/)![1];
  assert.match(sent, /October sent/);
  assert.match(sent, /Sent Tue, Oct 20, 2026 6:03 pm/);
  assert.doesNotMatch(sent, /0 contributions|Updated/);
  assert.match(drafts, /October working draft/);
  assert.match(drafts, /8 contributions/);
  assert.doesNotMatch(drafts, /October sent/);
});

test("imported sent route reads only the saved issue and provenance, never pasted/review state", async () => {
  const raw = "<html><body>Exact original</body></html>";
  const Page = loadModule("src/app/(dashboard)/admin/workspace/marketing/newsletter/review/page.tsx", {
    "next/navigation": { redirect: () => { throw new Error("unexpected redirect"); }, notFound: () => { throw new Error("not found"); } },
    "@/lib/auth": { requireRole: async () => ({ user: { role: "instructor" } }), deniedRedirect: async () => "/login" },
    "@/lib/newsletter/currentIssue": { resolveCurrentIssue: () => { throw new Error("must not create current issue"); } },
    "@/lib/newsletter/config": { getNewsletterConfig: () => { throw new Error("must not access approval config"); } },
    "@/lib/newsletter/archive": archive,
    "@/lib/newsletter/render": { renderIssue: () => { throw new Error("must not regenerate original"); } },
    "@/lib/newsletter/media": {},
    "@/lib/newsletter/wording-settings": { getPreserveWording: () => { throw new Error("must not read draft wording policy for sent archive"); } },
    "@/components/ui/PageHero": { PageHero: ({ title }: any) => createElement("h1", null, title) },
    "@/components/workspace/NewsletterNav": { NewsletterNav: () => null },
    "@/components/workspace/NewsletterArchive": { NewsletterArchive },
    "@/components/workspace/NewsletterPageReview": {},
    "@/components/workspace/NewsletterReviewClient": {},
    "@/components/workspace/PastedNewsletterReview": {},
    "@/lib/prisma": { prisma: {
      newsletterIssue: { findUnique: async () => ({ id: issueId, title: "Sent copy", dateline: "October 2026", status: "sent", pieces: [], renderedHtml: raw }) },
      platformSetting: { findUnique: async ({ where }: any) => { assert.equal(where.key, archive.newsletterArchiveKey(issueId)); return { value: JSON.stringify(saved) }; } },
    } },
  }).default;
  const output = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ issue: issueId }) }));
  assert.ok(output.includes(`srcDoc="${escapeAttribute(raw)}"`));
});
