/**
 * ENGAGE + EXPERIENCE pause on the production deployment
 * (deploy/paused-routes.mjs, scripts/prune-paused-routes.mjs,
 * src/lib/deploy/paused.ts).
 *
 * The expensive mistakes here are silent ones: pruning the demo project,
 * pruning locally, a folder whose removal breaks the build, a redirect
 * that swallows a live page. Each has a test below.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import {
  EXACT_PAUSED_PAGE_PATHS,
  KEPT_DYNAMIC_SIBLINGS,
  MAIN_CHECKOUT,
  PAUSED_API_PREFIXES,
  PAUSED_PAGE_PREFIXES,
  PAUSED_ROUTE_FOLDERS,
  PRODUCTION_PROJECT_ID,
  folderToUrlPrefix,
  isMainCheckout,
  pauseDecision,
  pausedApiPrefixesEnvValue,
  pausedPagePrefixesEnvValue,
  pausedPillarsBuildConfig,
  pausedRedirects,
  shouldPausePillars,
} from "../../deploy/paused-routes.mjs";
import {
  isPausedPath,
  isPausedPathIn,
  parsePausedList,
  pathHasPrefix,
  pausedPillarsActive,
  withoutPaused,
  withoutPausedSteps,
} from "../../src/lib/deploy/paused";

const ROOT = path.resolve(__dirname, "../..");
const APP = path.join(ROOT, "src", "app");
const OTHER_DIR = path.join(os.tmpdir(), "bhn-paused-routes-not-here");

const PAUSED_LIST = parsePausedList(pausedPagePrefixesEnvValue(), pausedApiPrefixesEnvValue());

function withPausedEnv(pages: string | undefined, apis: string | undefined, fn: () => void) {
  const prev = [process.env.NEXT_PUBLIC_PAUSED_PREFIXES, process.env.NEXT_PUBLIC_PAUSED_API_PREFIXES];
  const set = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  set("NEXT_PUBLIC_PAUSED_PREFIXES", pages);
  set("NEXT_PUBLIC_PAUSED_API_PREFIXES", apis);
  try {
    fn();
  } finally {
    set("NEXT_PUBLIC_PAUSED_PREFIXES", prev[0]);
    set("NEXT_PUBLIC_PAUSED_API_PREFIXES", prev[1]);
  }
}

// ── The guard ──────────────────────────────────────────────────────

test("the guard is on only for a Vercel build of bhn-training-platform", () => {
  const prod = { VERCEL: "1", VERCEL_PROJECT_ID: PRODUCTION_PROJECT_ID };
  const rows: [string, Record<string, string | undefined>, boolean][] = [
    ["production project build", prod, true],
    ["production, production target", { ...prod, VERCEL_ENV: "production" }, true],
    ["production, preview target", { ...prod, VERCEL_ENV: "preview" }, true],
    ["vercel dev on the linked production project", { ...prod, VERCEL_ENV: "development" }, false],
    ["no env at all (local)", {}, false],
    ["VERCEL missing", { VERCEL_PROJECT_ID: PRODUCTION_PROJECT_ID }, false],
    ["VERCEL is not exactly 1", { VERCEL: "true", VERCEL_PROJECT_ID: PRODUCTION_PROJECT_ID }, false],
    ["VERCEL=0", { VERCEL: "0", VERCEL_PROJECT_ID: PRODUCTION_PROJECT_ID }, false],
    ["project id missing", { VERCEL: "1" }, false],
    ["project id empty", { VERCEL: "1", VERCEL_PROJECT_ID: "" }, false],
    ["bhn-demo project (real id)", { VERCEL: "1", VERCEL_PROJECT_ID: "prj_pIzGfBM7eewku5cPWXnPg2IomYfN" }, false],
    ["bhn-tpf2 project (real id)", { VERCEL: "1", VERCEL_PROJECT_ID: "prj_sU6HEj8ArC4vsFalXQ56EqFqjjpo" }, false],
    ["id differs only in case", { VERCEL: "1", VERCEL_PROJECT_ID: PRODUCTION_PROJECT_ID.toLowerCase() }, false],
    [
      "same repo slug is not enough (bhn-demo builds this repo too)",
      { VERCEL: "1", VERCEL_GIT_REPO_SLUG: "bhn-training-platform", VERCEL_PROJECT_ID: "prj_demo" },
      false,
    ],
    [
      "production URL is not enough",
      { VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: "bhn-training-platform.vercel.app" },
      false,
    ],
    ["demo mode on the production id", { ...prod, NEXT_PUBLIC_DEMO_MODE: "true" }, false],
    ["opt-out 0", { ...prod, BHN_PAUSE_PILLARS: "0" }, false],
    ["opt-out false", { ...prod, BHN_PAUSE_PILLARS: "false" }, false],
    ["opt-out OFF", { ...prod, BHN_PAUSE_PILLARS: " OFF " }, false],
    ["opt-out no", { ...prod, BHN_PAUSE_PILLARS: "no" }, false],
    ["BHN_PAUSE_PILLARS=1 changes nothing", { ...prod, BHN_PAUSE_PILLARS: "1" }, true],
    ["BHN_PAUSE_PILLARS=1 cannot force it on", { BHN_PAUSE_PILLARS: "1" }, false],
    [
      "local override is ignored on another Vercel project",
      { VERCEL: "1", VERCEL_PROJECT_ID: "prj_demo", BHN_PAUSE_LOCAL_COPY: OTHER_DIR },
      false,
    ],
  ];
  for (const [name, env, want] of rows) {
    assert.equal(shouldPausePillars(env, OTHER_DIR), want, name);
    assert.equal(pauseDecision(env, OTHER_DIR).pause, want, name);
    assert.ok(pauseDecision(env, OTHER_DIR).reason.length > 0, `${name} explains itself`);
  }
});

test("the local override works only in the directory it names, never the main checkout", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bhn-pause-"));
  try {
    assert.equal(shouldPausePillars({ BHN_PAUSE_LOCAL_COPY: tmp }, tmp), true);
    assert.equal(shouldPausePillars({ BHN_PAUSE_LOCAL_COPY: `${tmp}/` }, tmp), true);
    assert.equal(shouldPausePillars({ BHN_PAUSE_LOCAL_COPY: tmp }, OTHER_DIR), false);
    assert.equal(shouldPausePillars({ BHN_PAUSE_LOCAL_COPY: "   " }, tmp), false);
    assert.equal(shouldPausePillars({ BHN_PAUSE_LOCAL_COPY: tmp, BHN_PAUSE_PILLARS: "0" }, tmp), false);
    assert.equal(
      shouldPausePillars({ BHN_PAUSE_LOCAL_COPY: tmp, NEXT_PUBLIC_DEMO_MODE: "true" }, tmp),
      false,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  assert.equal(shouldPausePillars({ BHN_PAUSE_LOCAL_COPY: MAIN_CHECKOUT }, MAIN_CHECKOUT), false);
  assert.equal(
    shouldPausePillars({ BHN_PAUSE_LOCAL_COPY: MAIN_CHECKOUT.toUpperCase() }, MAIN_CHECKOUT.toUpperCase()),
    false,
  );
  const sub = path.join(MAIN_CHECKOUT, "copy");
  assert.equal(shouldPausePillars({ BHN_PAUSE_LOCAL_COPY: sub }, sub), false);
});

test("the main checkout is refused on every path, Vercel variables included", () => {
  const prod = { VERCEL: "1", VERCEL_PROJECT_ID: PRODUCTION_PROJECT_ID };
  for (const cwd of [MAIN_CHECKOUT, MAIN_CHECKOUT.toLowerCase(), `${MAIN_CHECKOUT}/`, path.join(MAIN_CHECKOUT, "src")]) {
    assert.equal(isMainCheckout(cwd), true, cwd);
    assert.equal(shouldPausePillars(prod, cwd), false, cwd);
    assert.equal(shouldPausePillars({ ...prod, VERCEL_ENV: "production" }, cwd), false, cwd);
    assert.match(pauseDecision(prod, cwd).reason, /main checkout/);
    assert.equal(pausedPillarsBuildConfig(prod, cwd).active, false, cwd);
  }
  assert.equal(isMainCheckout(`${MAIN_CHECKOUT}-copy`), false);
  assert.equal(isMainCheckout("/vercel/path0"), false);
  assert.equal(shouldPausePillars(prod, "/vercel/path0"), true);
});

test("an inactive build config adds no redirects and hides nothing", () => {
  const off = pausedPillarsBuildConfig({}, OTHER_DIR);
  assert.equal(off.active, false);
  assert.deepEqual(off.redirects, []);
  assert.deepEqual(off.env, { NEXT_PUBLIC_PAUSED_PREFIXES: "", NEXT_PUBLIC_PAUSED_API_PREFIXES: "" });

  // OTHER_DIR does not exist, so every paused folder is "gone", as after the prune.
  const on = pausedPillarsBuildConfig({ VERCEL: "1", VERCEL_PROJECT_ID: PRODUCTION_PROJECT_ID }, OTHER_DIR);
  assert.equal(on.active, true);
  assert.equal(on.redirects.length, (PAUSED_PAGE_PREFIXES.length + EXACT_PAUSED_PAGE_PATHS.length) * 2);
  assert.equal(on.redirects.length, 126);
  assert.equal(on.env.NEXT_PUBLIC_PAUSED_PREFIXES, pausedPagePrefixesEnvValue());
  assert.equal(on.env.NEXT_PUBLIC_PAUSED_API_PREFIXES, pausedApiPrefixesEnvValue());
  for (const r of on.redirects) {
    assert.equal(r.destination, "/paused");
    assert.equal(r.permanent, false);
    assert.ok(!r.source.startsWith("/api"), `no API redirect: ${r.source}`);
  }
});

test("the build config refuses to pause while paused folders are still on disk", () => {
  const prod = { VERCEL: "1", VERCEL_PROJECT_ID: PRODUCTION_PROJECT_ID };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bhn-pause-config-"));
  try {
    // Nothing on disk: the prune ran.
    assert.equal(pausedPillarsBuildConfig(prod, dir).active, true);
    // One folder left behind (partial prune, or the list drifted).
    fs.mkdirSync(path.join(dir, "src/app/api/adaptive"), { recursive: true });
    assert.throws(() => pausedPillarsBuildConfig(prod, dir), /prune step did not run/);
    assert.throws(() => pausedPillarsBuildConfig({ BHN_PAUSE_LOCAL_COPY: dir }, dir), /still on disk/);
    // Not pausing: folders on disk are the normal state, no throw.
    for (const env of [{}, { ...prod, BHN_PAUSE_PILLARS: "0" }, { ...prod, VERCEL_ENV: "development" }]) {
      const off = pausedPillarsBuildConfig(env, dir);
      assert.equal(off.active, false);
      assert.deepEqual(off.redirects, []);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("vercel dev in a linked checkout adds no redirects and hides nothing", () => {
  // The CLI passes VERCEL=1, VERCEL_ENV=development and the linked
  // project's id to `next dev`; every folder is still on disk.
  const devEnv = { VERCEL: "1", VERCEL_ENV: "development", VERCEL_PROJECT_ID: PRODUCTION_PROJECT_ID };
  for (const cwd of [ROOT, MAIN_CHECKOUT, OTHER_DIR]) {
    const cfg = pausedPillarsBuildConfig(devEnv, cwd);
    assert.equal(cfg.active, false, cwd);
    assert.deepEqual(cfg.redirects, []);
    assert.deepEqual(cfg.env, { NEXT_PUBLIC_PAUSED_PREFIXES: "", NEXT_PUBLIC_PAUSED_API_PREFIXES: "" });
  }
});

// ── The folder list ────────────────────────────────────────────────

const EXPECTED_PREFIXES: [string, string][] = [
  ["src/app/(dashboard)/courses", "/courses"],
  ["src/app/(dashboard)/pathways", "/pathways"],
  ["src/app/(dashboard)/my-courses", "/my-courses"],
  ["src/app/(dashboard)/gradebook", "/gradebook"],
  ["src/app/(dashboard)/certificates", "/certificates"],
  ["src/app/(dashboard)/certifications", "/certifications"],
  ["src/app/(dashboard)/credits", "/credits"],
  ["src/app/(dashboard)/rewards", "/rewards"],
  ["src/app/(dashboard)/committee", "/committee"],
  ["src/app/(dashboard)/buddy", "/buddy"],
  ["src/app/player", "/player"],
  ["src/app/scorm-files", "/scorm-files"],
  ["src/app/showcase/[slug]", "/showcase/*"],
  ["src/app/showcase/regulatory-affairs", "/showcase/regulatory-affairs"],
  ["src/app/(dashboard)/admin/committees/hqp", "/admin/committees/hqp"],
  ["src/app/(dashboard)/admin/enrollments", "/admin/enrollments"],
  ["src/app/(dashboard)/admin/groups", "/admin/groups"],
  ["src/app/(dashboard)/admin/credit-applications", "/admin/credit-applications"],
  ["src/app/(dashboard)/admin/pathway-enrollments", "/admin/pathway-enrollments"],
  ["src/app/(dashboard)/admin/course-filters", "/admin/course-filters"],
  ["src/app/(dashboard)/admin/course-thumbnails", "/admin/course-thumbnails"],
  ["src/app/(dashboard)/admin/certificates", "/admin/certificates"],
  ["src/app/(dashboard)/admin/cover-art", "/admin/cover-art"],
  ["src/app/(dashboard)/admin/showcase", "/admin/showcase"],
  ["src/app/(dashboard)/admin/reports", "/admin/reports"],
  ["src/app/(dashboard)/admin/lti", "/admin/lti"],
  ["src/app/(dashboard)/experience", "/experience"],
  ["src/app/(dashboard)/internships", "/internships"],
  ["src/app/(dashboard)/interviews", "/interviews"],
  ["src/app/(dashboard)/mock-interview", "/mock-interview"],
  ["src/app/(dashboard)/simulator", "/simulator"],
  ["src/app/(dashboard)/career-paths", "/career-paths"],
  ["src/app/(dashboard)/resume", "/resume"],
  ["src/app/(dashboard)/profile/application", "/profile/application"],
  ["src/app/(dashboard)/profile/applications", "/profile/applications"],
  ["src/app/(dashboard)/profile/job-folders", "/profile/job-folders"],
  ["src/app/(dashboard)/profile/master", "/profile/master"],
  ["src/app/(dashboard)/profile/matches", "/profile/matches"],
  ["src/app/(dashboard)/profile/resume", "/profile/resume"],
  ["src/app/(dashboard)/profile/resumes", "/profile/resumes"],
  ["src/app/(dashboard)/profile/skills", "/profile/skills"],
  ["src/app/(dashboard)/profile/stories", "/profile/stories"],
  ["src/app/(dashboard)/profile/tailor", "/profile/tailor"],
  ["src/app/(auth)/signup/employer", "/signup/employer"],
  ["src/app/(dashboard)/talent-pool", "/talent-pool"],
  ["src/app/(dashboard)/employer", "/employer"],
  ["src/app/(dashboard)/mentor", "/mentor"],
  ["src/app/for-employers", "/for-employers"],
  ["src/app/jobs", "/jobs"],
  ["src/app/employer", "/employer"],
  ["src/app/invite", "/invite"],
  ["src/app/share/folder", "/share/folder"],
  ["src/app/share/sim", "/share/sim"],
  ["src/app/(dashboard)/admin/skills", "/admin/skills"],
  ["src/app/(dashboard)/admin/matching-config", "/admin/matching-config"],
  ["src/app/(dashboard)/admin/employer-invites", "/admin/employer-invites"],
  ["src/app/(dashboard)/admin/demo-workspaces", "/admin/demo-workspaces"],
  ["src/app/(dashboard)/admin/showcases", "/admin/showcases"],
  ["src/app/(dashboard)/admin/simulator-requests", "/admin/simulator-requests"],
  ["src/app/(dashboard)/admin/simulations", "/admin/simulations"],
  ["src/app/(dashboard)/admin/experience", "/admin/experience"],
  ["src/app/(dashboard)/admin/internships", "/admin/internships"],
  ["src/app/(dashboard)/admin/pipeline-analytics", "/admin/pipeline-analytics"],
  ["src/app/api/adaptive", "/api/adaptive"],
  ["src/app/api/assessments", "/api/assessments"],
  ["src/app/api/certificates", "/api/certificates"],
  ["src/app/api/courses", "/api/courses"],
  ["src/app/api/credits", "/api/credits"],
  ["src/app/api/enrollments", "/api/enrollments"],
  ["src/app/api/lti", "/api/lti"],
  ["src/app/api/modules", "/api/modules"],
  ["src/app/api/pathways", "/api/pathways"],
  ["src/app/api/scorm", "/api/scorm"],
  ["src/app/api/xapi", "/api/xapi"],
  ["src/app/api/rewards", "/api/rewards"],
  ["src/app/api/committee", "/api/committee"],
  ["src/app/api/showcase", "/api/showcase"],
  ["src/app/api/buddy", "/api/buddy"],
  ["src/app/api/admin/committees/hqp", "/api/admin/committees/hqp"],
  ["src/app/api/admin/certificates", "/api/admin/certificates"],
  ["src/app/api/admin/courses", "/api/admin/courses"],
  ["src/app/api/admin/credit-applications", "/api/admin/credit-applications"],
  ["src/app/api/admin/enrollments", "/api/admin/enrollments"],
  ["src/app/api/admin/groups", "/api/admin/groups"],
  ["src/app/api/admin/lti", "/api/admin/lti"],
  ["src/app/api/admin/modules", "/api/admin/modules"],
  ["src/app/api/admin/pathway-enrollments", "/api/admin/pathway-enrollments"],
  ["src/app/api/admin/pathways", "/api/admin/pathways"],
  ["src/app/api/admin/reports", "/api/admin/reports"],
  ["src/app/api/admin/showcase", "/api/admin/showcase"],
  ["src/app/api/admin/ai", "/api/admin/ai"],
  ["src/app/api/auth/claim-invite", "/api/auth/claim-invite"],
  ["src/app/api/share/sim", "/api/share/sim"],
  ["src/app/api/applications", "/api/applications"],
  ["src/app/api/employer", "/api/employer"],
  ["src/app/api/internships", "/api/internships"],
  ["src/app/api/interviews", "/api/interviews"],
  ["src/app/api/jobs", "/api/jobs"],
  ["src/app/api/match", "/api/match"],
  ["src/app/api/matching", "/api/matching"],
  ["src/app/api/mock-interview", "/api/mock-interview"],
  ["src/app/api/prep", "/api/prep"],
  ["src/app/api/resume", "/api/resume"],
  ["src/app/api/simulator", "/api/simulator"],
  ["src/app/api/tailoring", "/api/tailoring"],
  ["src/app/api/talent-pool", "/api/talent-pool"],
  ["src/app/api/profile/application", "/api/profile/application"],
  ["src/app/api/profile/job-folders", "/api/profile/job-folders"],
  ["src/app/api/profile/master", "/api/profile/master"],
  ["src/app/api/profile/resume", "/api/profile/resume"],
  ["src/app/api/profile/resumes", "/api/profile/resumes"],
  ["src/app/api/profile/skills", "/api/profile/skills"],
  ["src/app/api/profile/talent-pool", "/api/profile/talent-pool"],
  ["src/app/api/admin/demo-workspaces", "/api/admin/demo-workspaces"],
  ["src/app/api/admin/employer-invites", "/api/admin/employer-invites"],
  ["src/app/api/admin/experience", "/api/admin/experience"],
  ["src/app/api/admin/facilities", "/api/admin/facilities"],
  ["src/app/api/admin/internships", "/api/admin/internships"],
  ["src/app/api/admin/matching-config", "/api/admin/matching-config"],
  ["src/app/api/admin/showcases", "/api/admin/showcases"],
  ["src/app/api/admin/simulations", "/api/admin/simulations"],
  ["src/app/api/admin/simulator-requests", "/api/admin/simulator-requests"],
  ["src/app/api/admin/skills", "/api/admin/skills"],
  ["src/app/api/admin/talent-pool", "/api/admin/talent-pool"],
  ["src/app/api/admin/forms/talent-application", "/api/admin/forms/talent-application"],
];

test("every listed folder maps to the URL prefix it serves", () => {
  assert.equal(PAUSED_ROUTE_FOLDERS.length, 125);
  assert.deepEqual(
    [...PAUSED_ROUTE_FOLDERS].sort(),
    EXPECTED_PREFIXES.map(([f]) => f).sort(),
    "the folder list and this table must change together",
  );
  for (const [folder, prefix] of EXPECTED_PREFIXES) {
    assert.equal(folderToUrlPrefix(folder), prefix, folder);
  }
  const pages = new Set(EXPECTED_PREFIXES.map(([, p]) => p).filter((p) => !p.startsWith("/api/")));
  const apis = new Set(EXPECTED_PREFIXES.map(([, p]) => p).filter((p) => p.startsWith("/api/")));
  assert.deepEqual([...PAUSED_PAGE_PREFIXES].sort(), [...pages].sort());
  assert.deepEqual([...PAUSED_API_PREFIXES].sort(), [...apis].sort());
});

test("folderToUrlPrefix refuses what it cannot express", () => {
  assert.throws(() => folderToUrlPrefix("app/courses"));
  assert.throws(() => folderToUrlPrefix("src/app/(dashboard)"));
  assert.throws(() => folderToUrlPrefix("src/app/@modal/courses"));
  assert.throws(() => folderToUrlPrefix("src/app/docs/[[...slug]]"));
  assert.equal(folderToUrlPrefix("src/app/docs/[...slug]"), "/docs/*");
  assert.equal(folderToUrlPrefix("src/app/(a)/(b)/x/"), "/x");
});

test("each listed folder exists, holds routes, and is not inside another listed folder", () => {
  for (const folder of PAUSED_ROUTE_FOLDERS) {
    const abs = path.join(ROOT, folder);
    assert.ok(fs.statSync(abs).isDirectory(), `${folder} exists`);
    assert.ok(routeFiles(abs).length > 0, `${folder} holds a page or route`);
    for (const other of PAUSED_ROUTE_FOLDERS) {
      if (other !== folder) assert.ok(!folder.startsWith(other + "/"), `${folder} is inside ${other}`);
    }
  }
  assert.equal(new Set(PAUSED_ROUTE_FOLDERS).size, PAUSED_ROUTE_FOLDERS.length, "no duplicates");
});

test("the deliberate keeps stay off the list", () => {
  for (const kept of [
    "src/app/api/public/employer-intake",
    "src/app/api/admin/credits",
    "src/app/for-trainees",
    "src/app/(dashboard)/admin/experience-metrics",
    "src/app/(dashboard)/admin/committees",
    "src/app/(dashboard)/admin/committees/equip-review",
    "src/app/api/admin/committees",
    "src/app/(dashboard)/forms",
    "src/app/(dashboard)/admin/forms",
    "src/app/api/forms",
    "src/app/feedback",
    "src/app/api/feedback",
    "src/app/showcase/gsap",
    "src/app/(dashboard)/admin/merch",
    "src/app/merch",
  ]) {
    assert.ok(
      !PAUSED_ROUTE_FOLDERS.some((f) => kept === f || kept.startsWith(f + "/")),
      `${kept} must stay deployed`,
    );
  }
});

test("wildcard exceptions match the live siblings on disk", () => {
  for (const folder of PAUSED_ROUTE_FOLDERS) {
    const name = path.basename(folder);
    if (!name.startsWith("[")) continue;
    const parent = path.dirname(folder);
    const liveStatic = fs
      .readdirSync(path.join(ROOT, parent), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("[") && !d.name.startsWith("("))
      .map((d) => `${parent}/${d.name}`)
      .filter((sibling) => !PAUSED_ROUTE_FOLDERS.includes(sibling))
      .map((sibling) => path.basename(sibling))
      .sort();
    const declared = [...((KEPT_DYNAMIC_SIBLINGS as Record<string, readonly string[]>)[folder] ?? [])].sort();
    assert.deepEqual(declared, liveStatic, `KEPT_DYNAMIC_SIBLINGS for ${folder}`);
  }
});

// ── Routes on disk vs. the prefixes and redirects ──────────────────

const ROUTE_FILE = /^(page|route)\.(tsx|ts|jsx|js)$/;

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routeFiles(abs));
    else if (ROUTE_FILE.test(entry.name)) out.push(abs);
  }
  return out;
}

function sampleUrl(file: string): string {
  const segs = path
    .relative(APP, path.dirname(file))
    .split(path.sep)
    .filter((s) => s && !/^\(.*\)$/.test(s))
    .map((s) => (s.startsWith("[[...") ? "" : s.startsWith("[...") ? "a/b" : s.startsWith("[") ? "sample-id" : s))
    .filter(Boolean);
  return "/" + segs.join("/");
}

function insidePaused(file: string): boolean {
  return PAUSED_ROUTE_FOLDERS.some((f) => file.startsWith(path.join(ROOT, f) + path.sep));
}

const ALL_ROUTES = routeFiles(APP);
const REDIRECT_MATCHERS = pausedRedirects().map((r) => ({
  source: r.source,
  match: getPathMatch(r.source, { strict: true, removeUnnamedParams: true }),
}));

test("no live route is hidden or redirected", () => {
  const live = ALL_ROUTES.filter((f) => !insidePaused(f));
  assert.ok(live.length > 300, `found ${live.length} live routes`);
  const extra = ["/showcase/gsap", "/admin/experience-metrics", "/for-trainees/engage", "/forms/obio-bootcamp", "/paused"];
  for (const url of [...new Set([...live.map(sampleUrl), ...extra])]) {
    assert.equal(isPausedPathIn(url, PAUSED_LIST), false, `${url} is live but would be hidden`);
    for (const m of REDIRECT_MATCHERS) {
      assert.equal(m.match(url), false, `${url} is live but ${m.source} redirects it`);
    }
  }
  // Exact paused paths inside a live folder: hidden AND redirected, while
  // the folder's other pages stay untouched.
  assert.deepEqual([...EXACT_PAUSED_PAGE_PATHS], ["/forms/talent-application"]);
  for (const p of EXACT_PAUSED_PAGE_PATHS) {
    assert.equal(isPausedPathIn(p, PAUSED_LIST), true, p);
    // (A trailing slash is first normalised by Next's own 308.)
    for (const url of [p, `${p}/x`]) {
      assert.ok(REDIRECT_MATCHERS.some((m) => m.match(url) !== false), `${url} redirects to /paused`);
    }
    for (const url of [`${p}x`, `${p}-2`]) {
      assert.ok(REDIRECT_MATCHERS.every((m) => m.match(url) === false), `${url} is not redirected`);
    }
  }
});

test("every paused page redirects and every paused route is hidden", () => {
  const paused = ALL_ROUTES.filter(insidePaused);
  assert.ok(paused.length > 300, `found ${paused.length} paused route files`);
  for (const file of paused) {
    const url = sampleUrl(file);
    assert.equal(isPausedPathIn(url, PAUSED_LIST), true, `${url} should be hidden`);
    if (!url.startsWith("/api/")) {
      assert.ok(REDIRECT_MATCHERS.some((m) => m.match(url) !== false), `${url} should redirect to /paused`);
    } else {
      assert.ok(REDIRECT_MATCHERS.every((m) => m.match(url) === false), `${url} must not redirect`);
    }
  }
});

// ── Build safety: nothing that stays imports what goes ─────────────

const SCAN_DIRS = ["src", "tests", "scripts", "prisma", "evals", "playwright", "deploy"];
const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

function codeFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...codeFiles(abs));
    else if (CODE_FILE.test(entry.name)) out.push(abs);
  }
  return out;
}

test("no file outside the paused folders imports from inside them", () => {
  const pausedAbs = PAUSED_ROUTE_FOLDERS.map((f) => path.join(ROOT, f));
  const offenders: string[] = [];
  const files = SCAN_DIRS.flatMap((d) => codeFiles(path.join(ROOT, d))).filter((f) => !insidePaused(f));
  assert.ok(files.length > 1000, `scanned ${files.length} files`);
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(SPECIFIER)) {
      const spec = m[1];
      let target: string;
      if (spec.startsWith("@/")) target = path.join(ROOT, "src", spec.slice(2));
      else if (spec.startsWith(".")) target = path.resolve(path.dirname(file), spec);
      else continue;
      if (pausedAbs.some((p) => target === p || target.startsWith(p + path.sep))) {
        offenders.push(`${path.relative(ROOT, file)} → ${spec}`);
      }
    }
  }
  assert.deepEqual(offenders, [], "the production build would fail without these");
});

// ── The app-side helper ────────────────────────────────────────────

test("isPausedPath is a no-op when this deployment pauses nothing", () => {
  withPausedEnv(undefined, undefined, () => {
    assert.equal(pausedPillarsActive(), false);
    for (const p of ["/courses", "/employer/postings", "/api/adaptive", "/showcase/x"]) {
      assert.equal(isPausedPath(p), false, p);
    }
    const items = [{ href: "/courses" }, { href: "/events" }];
    assert.equal(withoutPaused(items), items, "same array back");
    const steps = [{ path: "/courses" }, { cta: { href: "/jobs" } }];
    assert.equal(withoutPausedSteps(steps), steps, "same array back");
  });
  withPausedEnv("", "", () => assert.equal(isPausedPath("/courses"), false));
  withPausedEnv(" , ,", "", () => assert.equal(pausedPillarsActive(), false));
});

test("isPausedPath follows the production prefixes", () => {
  withPausedEnv(pausedPagePrefixesEnvValue(), pausedApiPrefixesEnvValue(), () => {
    assert.equal(pausedPillarsActive(), true);
    const rows: [string | null | undefined, boolean][] = [
      ["/courses", true],
      ["/courses/", true],
      ["/courses/abc/learn", true],
      ["/Courses", true],
      ["/courses?from=instructor", true],
      ["/courses#top", true],
      ["/coursesx", false],
      ["/my-courses", true],
      ["/admin/experience", true],
      ["/admin/experience/employer-intake", true],
      ["/admin/experience-metrics", false],
      ["/admin/showcase", true],
      ["/admin/showcases", true],
      ["/admin/committees", false],
      ["/admin/committees/hqp", true],
      ["/admin/committees/equip-review", false],
      ["/committee/hqp", true],
      ["/profile", false],
      ["/profile/preferences", false],
      ["/profile/resume", true],
      ["/profile/resumes", true],
      ["/showcase/gsap", false],
      ["/showcase/gsap/anything", false],
      ["/showcase/some-cohort", true],
      ["/showcase/regulatory-affairs", true],
      ["/share/equip-report/abc", false],
      ["/share/sim/abc", true],
      ["/forms/talent-application", true],
      ["/forms/obio-bootcamp", false],
      ["/for-trainees/engage", false],
      ["/for-trainees/venture-connect", false],
      ["/employer", true],
      ["/employer/postings", true],
      ["/employer/demo/tok", true],
      ["/signup/employer/tok", true],
      ["/register", false],
      ["/events", false],
      ["/equip", false],
      ["/dashboard", false],
      ["/paused", false],
      ["/api/adaptive/bookmarks/1/review", true],
      ["/api/courses", true],
      ["/api/admin/credits/grant", false],
      ["/api/admin/committees", false],
      ["/api/admin/committees/hqp/rounds", true],
      ["/api/public/employer-intake", false],
      ["/api/profile", false],
      ["/api/profile/resume", true],
      ["/api/auth/claim-invite", true],
      ["/api/auth/session", false],
      ["https://bhn-training-platform.vercel.app/courses", false],
      ["//evil.example/courses", false],
      ["courses", false],
      ["", false],
      [null, false],
      [undefined, false],
    ];
    for (const [href, want] of rows) assert.equal(isPausedPath(href), want, String(href));

    const nav = [{ href: "/courses" }, { href: "/events" }, { href: "/profile/resume" }, { href: null }];
    assert.deepEqual(withoutPaused(nav), [{ href: "/events" }, { href: null }]);
  });
});

test("the env format: wildcards, exceptions, junk", () => {
  const list = parsePausedList("/a/*, !/a/keep ,nope, /b ,!", "/api/x");
  assert.deepEqual(list, { include: ["/a/*", "/b", "/api/x"], except: ["/a/keep"] });
  assert.equal(isPausedPathIn("/a/one", list), true);
  assert.equal(isPausedPathIn("/a/one/two", list), true);
  assert.equal(isPausedPathIn("/a", list), false);
  assert.equal(isPausedPathIn("/a/keep", list), false);
  assert.equal(isPausedPathIn("/a/keep/deeper", list), false);
  assert.equal(isPausedPathIn("/a/keeper", list), true);
  assert.equal(isPausedPathIn("/api/x/y", list), true);
  assert.equal(pathHasPrefix("/x", "/"), false, "an empty prefix pauses nothing");
});

// ── The prune script ───────────────────────────────────────────────

function fakeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bhn-prune-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "bhn-training-platform" }));
  for (const folder of [
    "src/app/(dashboard)/courses/[id]",
    "src/app/api/adaptive",
    "src/app/showcase/[slug]",
    "src/app/showcase/gsap",
    "src/app/(dashboard)/admin/experience-metrics",
    "src/app/api/public/employer-intake",
  ]) {
    fs.mkdirSync(path.join(dir, folder), { recursive: true });
    fs.writeFileSync(path.join(dir, folder, folder.includes("/api/") ? "route.ts" : "page.tsx"), "export {};\n");
  }
  return dir;
}

const SCRIPT = path.join(ROOT, "scripts", "prune-paused-routes.mjs");

function runPrune(cwd: string, env: Record<string, string>) {
  return spawnSync(process.execPath, [SCRIPT], {
    cwd,
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", ...env },
    encoding: "utf8",
  });
}

test("the prune script does nothing unless the guard says so", () => {
  const dir = fakeRepo();
  try {
    const envs: Record<string, string>[] = [
      {},
      { VERCEL: "1", VERCEL_PROJECT_ID: "prj_demo" },
      { VERCEL: "1", VERCEL_PROJECT_ID: PRODUCTION_PROJECT_ID, BHN_PAUSE_PILLARS: "0" },
      { VERCEL: "1", VERCEL_PROJECT_ID: PRODUCTION_PROJECT_ID, VERCEL_ENV: "development" },
      { BHN_PAUSE_LOCAL_COPY: OTHER_DIR },
    ];
    for (const env of envs) {
      const res = runPrune(dir, env);
      assert.equal(res.status, 0, res.stderr);
      assert.match(res.stdout, /skipped/);
      assert.ok(fs.existsSync(path.join(dir, "src/app/(dashboard)/courses/[id]/page.tsx")));
      assert.ok(fs.existsSync(path.join(dir, "src/app/api/adaptive/route.ts")));
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the prune script removes exactly the listed folders when told to", () => {
  const dir = fakeRepo();
  try {
    const res = runPrune(dir, { BHN_PAUSE_LOCAL_COPY: dir });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /removed 3 of 125 folders \(3 files\)/);
    for (const gone of ["src/app/(dashboard)/courses", "src/app/api/adaptive", "src/app/showcase/[slug]"]) {
      assert.equal(fs.existsSync(path.join(dir, gone)), false, gone);
    }
    for (const kept of [
      "src/app/showcase/gsap/page.tsx",
      "src/app/(dashboard)/admin/experience-metrics/page.tsx",
      "src/app/api/public/employer-intake/route.ts",
    ]) {
      assert.ok(fs.existsSync(path.join(dir, kept)), kept);
    }
    // Running twice is harmless.
    const again = runPrune(dir, { BHN_PAUSE_LOCAL_COPY: dir });
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /removed 0 of 125 folders/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("on Vercel the prune script needs every listed folder, and removes them all", () => {
  const prod = { VERCEL: "1", VERCEL_PROJECT_ID: PRODUCTION_PROJECT_ID, VERCEL_ENV: "production" };
  const dir = fakeRepo();
  try {
    // The fake repo holds only 3 of the listed folders: list drift. Fail, remove nothing.
    const res = runPrune(dir, prod);
    assert.equal(res.status, 1, res.stdout);
    assert.match(res.stderr, /122 of 125 listed folders do not exist/);
    assert.match(res.stderr, /Nothing was removed/);
    assert.ok(fs.existsSync(path.join(dir, "src/app/(dashboard)/courses/[id]/page.tsx")));
    assert.ok(fs.existsSync(path.join(dir, "src/app/api/adaptive/route.ts")));

    // A complete clone: everything listed goes, the keeps stay.
    for (const folder of PAUSED_ROUTE_FOLDERS) {
      fs.mkdirSync(path.join(dir, folder), { recursive: true });
      fs.writeFileSync(path.join(dir, folder, folder.includes("/api/") ? "route.ts" : "page.tsx"), "export {};\n");
    }
    const ok = runPrune(dir, prod);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /removed 125 of 125 folders/);
    assert.match(ok.stdout, /0 already absent/);
    for (const folder of PAUSED_ROUTE_FOLDERS) assert.equal(fs.existsSync(path.join(dir, folder)), false, folder);
    for (const kept of [
      "src/app/showcase/gsap/page.tsx",
      "src/app/(dashboard)/admin/experience-metrics/page.tsx",
      "src/app/api/public/employer-intake/route.ts",
    ]) {
      assert.ok(fs.existsSync(path.join(dir, kept)), kept);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the prune script refuses a directory that is not this repo", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bhn-prune-other-"));
  try {
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "something-else" }));
    fs.mkdirSync(path.join(dir, "src/app/api/adaptive"), { recursive: true });
    const res = runPrune(dir, { BHN_PAUSE_LOCAL_COPY: dir });
    assert.equal(res.status, 1);
    assert.ok(fs.existsSync(path.join(dir, "src/app/api/adaptive")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
