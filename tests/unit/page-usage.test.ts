import test from "node:test";
import assert from "node:assert/strict";
import { formatDuration, pageLabel, summarizePageUsage } from "../../src/lib/page-usage";

const d = (s: string) => new Date(`2026-10-${s}T12:00:00Z`);

test("page usage ranks by visits, skips the dashboard and api, and resumes the latest page", () => {
  const u = summarizePageUsage([
    { path: "/dashboard", visits: 40, ms: 900000, last: d("16") },
    { path: "/api/x", visits: 9, ms: 0, last: d("16") },
    { path: "/admin/workspace/design-review", visits: 5, ms: 120000, last: d("10") },
    { path: "/courses", visits: 8, ms: 60000, last: d("12") },
    { path: "/events", visits: 5, ms: 300000, last: d("14") },
  ]);
  assert.deepEqual(u.pages.map((p) => p.path), ["/courses", "/events", "/admin/workspace/design-review"]);
  assert.equal(u.totalVisits, 18);
  assert.equal(u.totalMs, 480000);
  assert.deepEqual(u.resume, { path: "/events", label: "Events" });
});

test("page usage labels workspace and id paths readably", () => {
  assert.equal(pageLabel("/admin/workspace/design-review"), "Design review");
  assert.equal(pageLabel("/courses/clx9a8b7c6d5e4f3g2h1i0j"), "Courses · item");
  assert.equal(formatDuration(0), "—");
  assert.equal(formatDuration(5_400_000), "1 h 30 min");
});
