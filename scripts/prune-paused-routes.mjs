#!/usr/bin/env node
/**
 * Leave the paused ENGAGE / EXPERIENCE routes out of the production build.
 *
 * Runs inside `npm run build`, between `prisma migrate deploy` and
 * `next build`. On the production Vercel build (see pauseDecision in
 * deploy/paused-routes.mjs) it deletes the listed route folders from the
 * build workspace — Vercel's throwaway clone — so `next build` never
 * creates functions for them. The repository is not touched.
 *
 * Anywhere else it prints why it did nothing and exits 0, so a local
 * build, the bhn-demo project and CI are unchanged. On Vercel it exits 1,
 * before removing anything, if a listed folder is missing from the clone.
 *
 *   node scripts/prune-paused-routes.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { PAUSED_ROUTE_FOLDERS, isMainCheckout, pauseDecision } from "../deploy/paused-routes.mjs";

const TAG = "[prune-paused-routes]";
const cwd = process.cwd();
const decision = pauseDecision(process.env, cwd);

if (!decision.pause) {
  console.log(`${TAG} skipped: ${decision.reason}. Every route is built.`);
  process.exit(0);
}

// Belt and braces: pauseDecision already refuses the owner's checkout.
if (isMainCheckout(cwd)) {
  console.error(`${TAG} refusing: ${cwd} is the owner's working checkout.`);
  process.exit(1);
}

// Refuse anything that does not look like this repo's root.
const appDir = path.join(cwd, "src", "app");
let pkgName = "";
try {
  pkgName = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8")).name ?? "";
} catch {
  // handled below
}
if (pkgName !== "bhn-training-platform" || !fs.existsSync(appDir)) {
  console.error(`${TAG} refusing: ${cwd} is not the bhn-training-platform root.`);
  process.exit(1);
}

/** @param {string} dir */
function countFiles(dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    n += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1;
  }
  return n;
}

console.log(`${TAG} pausing ENGAGE + EXPERIENCE: ${decision.reason}`);

// Check the whole list before deleting anything.
const absent = [];
for (const folder of PAUSED_ROUTE_FOLDERS) {
  const abs = path.resolve(cwd, folder);
  // Never outside src/app, never src/app itself.
  if (!abs.startsWith(appDir + path.sep)) {
    console.error(`${TAG} refusing to remove ${folder}: not inside src/app.`);
    process.exit(1);
  }
  if (!fs.existsSync(abs)) absent.push(folder);
}

// Vercel builds from a fresh clone, so every listed folder must be there.
// A missing one means the list has drifted from the code (a route moved or
// a group was renamed): the moved route would ship as functions while its
// old URL redirects to /paused. Fail before touching anything. The local
// override tolerates absent folders so re-runs in a throwaway copy work.
if (process.env.VERCEL === "1" && absent.length > 0) {
  for (const folder of absent) console.error(`${TAG}   missing: ${folder}`);
  console.error(
    `${TAG} ${absent.length} of ${PAUSED_ROUTE_FOLDERS.length} listed folders do not exist in this clone. ` +
      `Update PAUSED_ROUTE_FOLDERS in deploy/paused-routes.mjs (or set BHN_PAUSE_PILLARS=0). Nothing was removed.`,
  );
  process.exit(1);
}

let removed = 0;
let files = 0;
for (const folder of PAUSED_ROUTE_FOLDERS) {
  if (absent.includes(folder)) continue;
  const abs = path.resolve(cwd, folder);
  const n = countFiles(abs);
  fs.rmSync(abs, { recursive: true, force: true });
  removed += 1;
  files += n;
  console.log(`${TAG}   removed ${folder} (${n} file${n === 1 ? "" : "s"})`);
}
for (const folder of absent) console.log(`${TAG}   already absent: ${folder}`);
console.log(
  `${TAG} removed ${removed} of ${PAUSED_ROUTE_FOLDERS.length} folders (${files} files); ` +
    `${absent.length} already absent. Paused pages redirect to /paused; paused APIs 404.`,
);
