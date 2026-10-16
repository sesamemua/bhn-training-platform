import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as scheduling from "../../src/lib/social/scheduling";

test("three day-specific options follow Buffer's published ranking, not made-up account analytics", () => {
  assert.deepEqual(scheduling.recommendedPostingTimes("2026-10-19"), ["22:00", "17:00", "21:00"]);
  assert.deepEqual(scheduling.recommendedPostingTimes("2026-10-20"), ["16:00", "17:00", "22:00"]);
  assert.deepEqual(scheduling.recommendedPostingTimes("2026-10-21"), ["16:00", "15:00", "17:00"]);
  assert.deepEqual(scheduling.recommendedPostingTimes("2026-10-22"), ["17:00", "19:00", "21:00"]);
  assert.deepEqual(scheduling.recommendedPostingTimes("2026-10-23"), ["15:00", "16:00", "17:00"]);
  assert.deepEqual(scheduling.recommendedPostingTimes("2026-10-24"), ["09:00", "18:00", "22:00"]);
  assert.deepEqual(scheduling.recommendedPostingTimes("2026-10-25"), ["22:00", "21:00", "06:00"]);
  for (const invalid of ["", "invalid", "2026-02-30", "2026-13-01", "2026-1-01"]) assert.deepEqual(scheduling.recommendedPostingTimes(invalid), []);
});

test("Toronto date and chosen time are independent of the user's computer timezone and follow DST", () => {
  const old = process.env.TZ;
  try {
    for (const zone of ["UTC", "Asia/Tokyo", "America/Vancouver"]) {
      process.env.TZ = zone;
      assert.equal(scheduling.socialDate(new Date("2026-10-24T01:00:00Z")), "2026-10-23");
      assert.equal(scheduling.socialScheduledInstant("2026-10-23", "16:00").toISOString(), "2026-10-23T20:00:00.000Z");
      assert.equal(scheduling.socialScheduledInstant("2026-12-23", "16:00").toISOString(), "2026-12-23T21:00:00.000Z");
      assert.equal(scheduling.socialScheduledInstant("2026-11-01", "00:00").toISOString(), "2026-11-01T04:00:00.000Z");
      assert.equal(scheduling.socialScheduledInstant("2026-11-01", "03:15").toISOString(), "2026-11-01T08:15:00.000Z");
    }
  } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
});

test("invalid, skipped and repeated clock-change times cannot silently schedule at a different time", () => {
  for (const [day, time] of [["2026-02-30", "16:00"], ["2026-10-23", "24:00"], ["", ""], ["2026-10-23", "9:00"]]) {
    assert.throws(() => scheduling.socialScheduledInstant(day, time), /valid date and time/);
  }
  assert.throws(() => scheduling.socialScheduledInstant("2026-03-08", "02:30"), /does not exist/);
  assert.throws(() => scheduling.socialScheduledInstant("2026-11-01", "01:30"), /occurs twice/);
});

test("the scheduling form offers a calendar date, three selectable recommendations, custom time and a Toronto preview", () => {
  const source = ts.transpileModule(readFileSync("src/components/workspace/SocialPublishControls.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const require = createRequire(import.meta.url);
  const exports: { SocialPublishControls?: ComponentType<Record<string, unknown>> } = {};
  let index = 0;
  const state = [false, null, true, "2030-10-23", "16:00", Date.parse("2030-10-01T12:00:00Z")];
  const mocks: Record<string, unknown> = {
    react: { useState: () => [state[index++], () => {}], useEffect: () => {} },
    "@/components/ui/ConfirmDialog": { useConfirmDialog: () => ({ node: null, confirmDialog: async () => false }) },
    "@/lib/social/scheduling": scheduling,
  };
  new Function("require", "exports", source)((id: string) => mocks[id] ?? require(id), exports);
  const render = (status = "approved") => {
    index = 0;
    return renderToStaticMarkup(createElement(exports.SocialPublishControls!, {
      post: { id: "test-only", status, assetUrl: "https://example.com/test.png", cycleLabel: "Test", scheduledFor: "2030-10-23T20:00:00Z" },
      connection: { ready: true }, pending: false, onResult: () => {},
    }));
  };
  const html = render();
  assert.match(html, /type="date"[^>]+aria-label="Posting date"/);
  assert.match(html, /type="time"[^>]+aria-label="Posting time"/);
  assert.doesNotMatch(html, /datetime-local/);
  assert.equal((html.match(/aria-pressed=/g) ?? []).length, 3);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /Toronto \(Eastern Time\)/);
  assert.match(html, /Eastern Daylight Time|EDT/);
  assert.match(html, /General guidance, not BioHubNet audience data/);
  assert.ok(html.includes(scheduling.POSTING_TIME_SOURCE));
  assert.doesNotMatch(render("draft"), /type="date"/);
  assert.doesNotMatch(render("scheduled"), /type="date"/);
});
