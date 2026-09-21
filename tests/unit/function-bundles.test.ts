/**
 * Vercel merges routes whose function config matches into one Lambda. A
 * route that exports its own `maxDuration` (or `preferredRegion`) gets a
 * config of its own, so it ships as a separate Lambda carrying another copy
 * of Prisma's engine: about 9 MB more Functions Storage per deployment,
 * counted for 30 days. The project default (300 s under Fluid compute)
 * already covers every route. See the Functions Storage note in
 * next.config.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = path.resolve(__dirname, "../../src/app");
const SPLITS_BUNDLE = /^\s*export\s+const\s+(maxDuration|preferredRegion)\b/m;

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(p);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) yield p;
  }
}

test("no route exports its own maxDuration or preferredRegion", () => {
  const offenders = [...sourceFiles(APP)]
    .filter((f) => SPLITS_BUNDLE.test(fs.readFileSync(f, "utf8")))
    .map((f) => path.relative(APP, f));
  assert.deepEqual(offenders, []);
});
