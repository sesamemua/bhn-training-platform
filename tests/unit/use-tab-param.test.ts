import test from "node:test";
import assert from "node:assert/strict";
import { setUrlParam } from "../../src/lib/hooks/use-tab-param";

test("tab changes are written into the address bar without navigating", () => {
  let href = "https://x.test/admin/equip/deadlines?year=2027";
  const replaced: string[] = [];
  (globalThis as { window?: unknown }).window = {
    location: { get href() { return href; } },
    history: { state: null, replaceState: (_s: unknown, _t: string, url: URL) => { href = url.toString(); replaced.push(href); } },
  };
  try {
    setUrlParam("view", "calendar");
    assert.equal(href, "https://x.test/admin/equip/deadlines?year=2027&view=calendar");
    setUrlParam("view", null);
    assert.equal(href, "https://x.test/admin/equip/deadlines?year=2027");
    assert.equal(replaced.length, 2);
  } finally { delete (globalThis as { window?: unknown }).window; }
});
