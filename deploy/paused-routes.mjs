// @ts-check
/**
 * ENGAGE + EXPERIENCE are paused on the live site.
 *
 * The owner does not need the ENGAGE (courses, pathways, credits…) or
 * EXPERIENCE (internships, employer portal, resume tools…) functions for
 * now. Every route on Vercel is its own ~30 MB function, and the account
 * is far over its Functions Storage limit, so those routes are left out
 * of the bhn-training-platform project's Vercel builds only (production
 * and preview). The code stays in the repo and still runs locally and on
 * the bhn-demo project, unchanged.
 *
 * This file is the single source of truth, plain ESM so both consumers
 * can load it without a build step:
 *
 *   • scripts/prune-paused-routes.mjs — part of `npm run build`. On the
 *     production Vercel build it deletes PAUSED_ROUTE_FOLDERS from
 *     Vercel's throwaway clone before `next build`. The repo is untouched.
 *   • next.config.ts — on the same build it adds redirects from each
 *     paused page prefix to /paused, and exposes the prefixes to the app
 *     (NEXT_PUBLIC_PAUSED_PREFIXES / NEXT_PUBLIC_PAUSED_API_PREFIXES) so
 *     src/lib/deploy/paused.ts can hide the links that lead there.
 *
 * Everything keys off pauseDecision(), which is fail-safe: it says yes
 * ONLY on a Vercel build of the bhn-training-platform project. Missing
 * variables, the bhn-demo project, a local `next build`, `vercel dev`,
 * anything run inside the owner's checkout — all "no". next.config.ts
 * additionally requires the folders to be gone from disk, so redirects
 * and hidden links never appear without the prune having run.
 *
 * To un-pause: set BHN_PAUSE_PILLARS=0 on the Vercel project (or empty
 * the folder list) and redeploy. Nothing else needs to change.
 *
 * No import.meta here: next.config.ts is compiled to CommonJS by Next,
 * and this file is compiled along with it.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * VERCEL_PROJECT_ID of bhn-training-platform (team sonicot-7530s-projects),
 * as recorded in .vercel/project.json. Vercel documents VERCEL_PROJECT_ID
 * as "Available at: Both build and runtime", and unlike
 * VERCEL_GIT_REPO_SLUG it differs between two projects that deploy the
 * same repository — bhn-demo deploys this repo through the CLI and must
 * keep every route.
 * https://vercel.com/docs/environment-variables/system-environment-variables#vercel_project_id
 */
export const PRODUCTION_PROJECT_ID = "prj_mrZsPmNhlMo8pxzazfZZdAIa6sYL";

/** The owner's working checkout. The local test override never runs here. */
export const MAIN_CHECKOUT = "/Users/ruilinyuan/Documents/My Doc/Claude Proj/bhn-training-platform";

/**
 * Route folders left out of the production build, relative to the repo
 * root. Each one holds only ENGAGE / EXPERIENCE routes; nothing outside
 * these folders imports anything inside them.
 *
 * Deliberately NOT here, although they sit next to the pillars:
 *   • src/app/api/public/employer-intake — biohubnet.ca's "Hire an
 *     intern" form posts to it.
 *   • src/app/api/admin/credits — the admin users page grants credits
 *     through it.
 *   • src/app/for-trainees — /for-trainees/venture-connect is EQUIP.
 *   • src/app/(dashboard)/admin/experience-metrics — a UX KPI page, not
 *     the EXPERIENCE pillar.
 *   • the root of admin/committees and api/admin/committees — the EQUIP
 *     Review committee lives under them (only the hqp folders go).
 *   • the legacy forms / feedback surfaces.
 */
export const PAUSED_ROUTE_FOLDERS = Object.freeze([
  // ── ENGAGE: learner pages
  "src/app/(dashboard)/courses",
  "src/app/(dashboard)/pathways",
  "src/app/(dashboard)/my-courses",
  "src/app/(dashboard)/gradebook",
  "src/app/(dashboard)/certificates",
  "src/app/(dashboard)/certifications",
  "src/app/(dashboard)/credits",
  "src/app/(dashboard)/rewards",
  "src/app/(dashboard)/committee",
  "src/app/(dashboard)/buddy",
  "src/app/player",
  "src/app/scorm-files",
  "src/app/showcase/[slug]",
  "src/app/showcase/regulatory-affairs",
  // ── ENGAGE: admin pages
  "src/app/(dashboard)/admin/committees/hqp",
  "src/app/(dashboard)/admin/enrollments",
  "src/app/(dashboard)/admin/groups",
  "src/app/(dashboard)/admin/credit-applications",
  "src/app/(dashboard)/admin/pathway-enrollments",
  "src/app/(dashboard)/admin/course-filters",
  "src/app/(dashboard)/admin/course-thumbnails",
  "src/app/(dashboard)/admin/certificates",
  "src/app/(dashboard)/admin/cover-art",
  "src/app/(dashboard)/admin/showcase",
  "src/app/(dashboard)/admin/reports",
  "src/app/(dashboard)/admin/lti",
  // ── EXPERIENCE: learner pages
  "src/app/(dashboard)/experience",
  "src/app/(dashboard)/internships",
  "src/app/(dashboard)/interviews",
  "src/app/(dashboard)/mock-interview",
  "src/app/(dashboard)/simulator",
  "src/app/(dashboard)/career-paths",
  "src/app/(dashboard)/resume",
  "src/app/(dashboard)/profile/application",
  "src/app/(dashboard)/profile/applications",
  "src/app/(dashboard)/profile/job-folders",
  "src/app/(dashboard)/profile/master",
  "src/app/(dashboard)/profile/matches",
  "src/app/(dashboard)/profile/resume",
  "src/app/(dashboard)/profile/resumes",
  "src/app/(dashboard)/profile/skills",
  "src/app/(dashboard)/profile/stories",
  "src/app/(dashboard)/profile/tailor",
  // ── EXPERIENCE: employer side and public pages
  "src/app/(auth)/signup/employer",
  "src/app/(dashboard)/talent-pool",
  "src/app/(dashboard)/employer",
  "src/app/(dashboard)/mentor",
  "src/app/for-employers",
  "src/app/jobs",
  "src/app/employer",
  "src/app/invite",
  "src/app/share/folder",
  "src/app/share/sim",
  // ── EXPERIENCE: admin pages
  "src/app/(dashboard)/admin/skills",
  "src/app/(dashboard)/admin/matching-config",
  "src/app/(dashboard)/admin/employer-invites",
  "src/app/(dashboard)/admin/demo-workspaces",
  "src/app/(dashboard)/admin/showcases",
  "src/app/(dashboard)/admin/simulator-requests",
  "src/app/(dashboard)/admin/simulations",
  "src/app/(dashboard)/admin/experience",
  "src/app/(dashboard)/admin/internships",
  "src/app/(dashboard)/admin/pipeline-analytics",
  // ── ENGAGE: APIs
  "src/app/api/adaptive",
  "src/app/api/assessments",
  "src/app/api/certificates",
  "src/app/api/courses",
  "src/app/api/credits",
  "src/app/api/enrollments",
  "src/app/api/lti",
  "src/app/api/modules",
  "src/app/api/pathways",
  "src/app/api/scorm",
  "src/app/api/xapi",
  "src/app/api/rewards",
  "src/app/api/committee",
  "src/app/api/showcase",
  "src/app/api/buddy",
  "src/app/api/admin/committees/hqp",
  "src/app/api/admin/certificates",
  "src/app/api/admin/courses",
  "src/app/api/admin/credit-applications",
  "src/app/api/admin/enrollments",
  "src/app/api/admin/groups",
  "src/app/api/admin/lti",
  "src/app/api/admin/modules",
  "src/app/api/admin/pathway-enrollments",
  "src/app/api/admin/pathways",
  "src/app/api/admin/reports",
  "src/app/api/admin/showcase",
  "src/app/api/admin/ai",
  // ── EXPERIENCE: APIs
  "src/app/api/auth/claim-invite",
  "src/app/api/share/sim",
  "src/app/api/applications",
  "src/app/api/employer",
  "src/app/api/internships",
  "src/app/api/interviews",
  "src/app/api/jobs",
  "src/app/api/match",
  "src/app/api/matching",
  "src/app/api/mock-interview",
  "src/app/api/prep",
  "src/app/api/resume",
  "src/app/api/simulator",
  "src/app/api/tailoring",
  "src/app/api/talent-pool",
  "src/app/api/profile/application",
  "src/app/api/profile/job-folders",
  "src/app/api/profile/master",
  "src/app/api/profile/resume",
  "src/app/api/profile/resumes",
  "src/app/api/profile/skills",
  "src/app/api/profile/talent-pool",
  "src/app/api/admin/demo-workspaces",
  "src/app/api/admin/employer-invites",
  "src/app/api/admin/experience",
  "src/app/api/admin/facilities",
  "src/app/api/admin/internships",
  "src/app/api/admin/matching-config",
  "src/app/api/admin/showcases",
  "src/app/api/admin/simulations",
  "src/app/api/admin/simulator-requests",
  "src/app/api/admin/skills",
  "src/app/api/admin/talent-pool",
  "src/app/api/admin/forms/talent-application",
]);

/**
 * Static route names that share a parent with a paused DYNAMIC folder
 * and stay live. `/showcase/[slug]` is paused, `/showcase/gsap` is not,
 * and a redirect is matched before the filesystem, so the wildcard must
 * step around it. tests/unit/paused-routes.test.ts checks this against
 * the disk.
 */
export const KEPT_DYNAMIC_SIBLINGS = Object.freeze({
  "src/app/showcase/[slug]": Object.freeze(["gsap"]),
});

/**
 * Exact page paths paused while their route FOLDER stays deployed,
 * because that folder also serves something live: /forms/[slug] also
 * renders the obio-bootcamp form. The talent-application form feeds the
 * paused talent pool and calls paused APIs (leave the pool, sample
 * uploads), so its links are hidden AND the path redirects to /paused
 * like any other paused page. /forms/<anything else> is untouched.
 */
export const EXACT_PAUSED_PAGE_PATHS = Object.freeze(["/forms/talent-application"]);

/** Where every paused page redirects. */
export const PAUSED_LANDING_PATH = "/paused";

const OPT_OUT_VALUES = new Set(["0", "false", "off", "no"]);

/**
 * @param {string} p
 * @returns {string}
 */
function canonicalDir(p) {
  let resolved = path.resolve(p);
  try {
    resolved = fs.realpathSync(resolved);
  } catch {
    // Not on disk (tests, or a checkout that does not exist here).
  }
  // macOS volumes are case-insensitive by default; compare that way.
  return resolved.replace(/\/+$/, "").toLowerCase();
}

/**
 * Is `cwd` the owner's checkout, or a folder inside it? Nothing is ever
 * pruned or paused there, whatever the environment says.
 *
 * @param {string} cwd
 * @returns {boolean}
 */
export function isMainCheckout(cwd) {
  const here = canonicalDir(cwd);
  const main = canonicalDir(MAIN_CHECKOUT);
  return here === main || here.startsWith(main + "/");
}

/**
 * Should THIS build leave the paused pillars out?
 *
 * Yes only when one of these holds:
 *   1. Vercel build (VERCEL === "1") of the production project
 *      (VERCEL_PROJECT_ID === PRODUCTION_PROJECT_ID). Production and
 *      preview deployments both count: preview functions take storage
 *      too. `vercel dev` (VERCEL_ENV === "development") does not.
 *   2. Local test override: BHN_PAUSE_LOCAL_COPY equals the current
 *      directory. For measuring a pruned build in a throwaway copy or
 *      worktree only.
 *
 * Always no when BHN_PAUSE_PILLARS is 0/false/off/no, when the build
 * is the demo (NEXT_PUBLIC_DEMO_MODE=true), or when the current
 * directory is the owner's checkout (MAIN_CHECKOUT) or inside it — on
 * every path, Vercel variables included, so no environment can make the
 * prune delete folders from the real working tree.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [cwd]
 * @returns {{ pause: boolean, reason: string }}
 */
export function pauseDecision(env = process.env, cwd = process.cwd()) {
  const optOut = (env.BHN_PAUSE_PILLARS ?? "").trim().toLowerCase();
  if (OPT_OUT_VALUES.has(optOut)) {
    return { pause: false, reason: `BHN_PAUSE_PILLARS=${env.BHN_PAUSE_PILLARS} opts out` };
  }
  if (env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return { pause: false, reason: "demo build (NEXT_PUBLIC_DEMO_MODE=true) keeps every route" };
  }
  if (isMainCheckout(cwd)) {
    return { pause: false, reason: `never inside the main checkout (${MAIN_CHECKOUT})` };
  }
  if (env.VERCEL === "1") {
    if (env.VERCEL_ENV === "development") {
      // `vercel dev` sets VERCEL=1 and the linked project's id on the
      // local dev server. Real builds are "production" or "preview".
      return { pause: false, reason: "vercel dev (VERCEL_ENV=development) keeps every route" };
    }
    if (env.VERCEL_PROJECT_ID === PRODUCTION_PROJECT_ID) {
      return { pause: true, reason: `Vercel build of bhn-training-platform (${PRODUCTION_PROJECT_ID})` };
    }
    return {
      pause: false,
      reason: `Vercel build of another project (VERCEL_PROJECT_ID=${env.VERCEL_PROJECT_ID || "unset"})`,
    };
  }
  const localCopy = (env.BHN_PAUSE_LOCAL_COPY ?? "").trim();
  if (localCopy) {
    if (canonicalDir(localCopy) !== canonicalDir(cwd)) {
      return { pause: false, reason: "BHN_PAUSE_LOCAL_COPY does not match the current directory" };
    }
    return { pause: true, reason: `local throwaway copy override (${cwd})` };
  }
  return { pause: false, reason: "not a Vercel build (VERCEL is not 1)" };
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [cwd]
 * @returns {boolean}
 */
export function shouldPausePillars(env = process.env, cwd = process.cwd()) {
  return pauseDecision(env, cwd).pause;
}

/**
 * Folder → URL prefix. Route groups `(x)` add nothing to the URL; a
 * dynamic segment `[x]` (or catch-all `[...x]`) becomes `*`, one
 * segment of anything.
 *
 * @param {string} folder e.g. "src/app/(dashboard)/profile/resume"
 * @returns {string} e.g. "/profile/resume"
 */
export function folderToUrlPrefix(folder) {
  const rel = folder.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!rel.startsWith("src/app/")) throw new Error(`Not under src/app: ${folder}`);
  const segments = [];
  for (const seg of rel.slice("src/app/".length).split("/")) {
    if (!seg) continue;
    if (/^\(.*\)$/.test(seg)) continue;
    if (seg.startsWith("@") || seg.startsWith("(.")) {
      throw new Error(`Parallel / intercepting segment not supported: ${folder}`);
    }
    if (seg.startsWith("[[")) throw new Error(`Optional catch-all not supported: ${folder}`);
    segments.push(seg.startsWith("[") ? "*" : seg);
  }
  if (segments.length === 0) throw new Error(`Refusing to pause the site root: ${folder}`);
  return "/" + segments.join("/");
}

/**
 * @param {string} prefix
 * @returns {boolean}
 */
function isApiPrefix(prefix) {
  return prefix === "/api" || prefix.startsWith("/api/");
}

/** @param {string[]} list */
const uniqueSorted = (list) => [...new Set(list)].sort();

/** Paused page (non-API) URL prefixes, deduplicated. */
export const PAUSED_PAGE_PREFIXES = Object.freeze(
  uniqueSorted(PAUSED_ROUTE_FOLDERS.map(folderToUrlPrefix).filter((p) => !isApiPrefix(p))),
);

/** Paused API URL prefixes. These are not redirected; they simply 404. */
export const PAUSED_API_PREFIXES = Object.freeze(
  uniqueSorted(PAUSED_ROUTE_FOLDERS.map(folderToUrlPrefix).filter(isApiPrefix)),
);

/**
 * Live paths that a paused wildcard prefix would otherwise swallow,
 * e.g. "/showcase/gsap".
 */
export const PAUSED_PREFIX_EXCEPTIONS = Object.freeze(
  uniqueSorted(
    Object.entries(KEPT_DYNAMIC_SIBLINGS).flatMap(([folder, names]) => {
      const prefix = folderToUrlPrefix(folder);
      const parent = prefix.slice(0, prefix.lastIndexOf("/"));
      return names.map((n) => `${parent}/${n}`);
    }),
  ),
);

/**
 * The value src/lib/deploy/paused.ts reads. Comma-separated; `*` is one
 * segment of anything; a leading `!` marks a live exception.
 *
 * @returns {string}
 */
export function pausedPagePrefixesEnvValue() {
  return [
    ...PAUSED_PAGE_PREFIXES,
    ...EXACT_PAUSED_PAGE_PATHS,
    ...PAUSED_PREFIX_EXCEPTIONS.map((p) => `!${p}`),
  ].join(",");
}

/** @returns {string} */
export function pausedApiPrefixesEnvValue() {
  return PAUSED_API_PREFIXES.join(",");
}

/** @param {string} s */
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * next.config redirect source for one prefix. A `*` becomes a named
 * parameter whose pattern refuses the live siblings.
 *
 * @param {string} prefix
 * @returns {string}
 */
function redirectSource(prefix) {
  let n = 0;
  return prefix
    .split("/")
    .map((seg, i, all) => {
      if (seg !== "*") return seg;
      const parent = all.slice(0, i).join("/");
      const kept = PAUSED_PREFIX_EXCEPTIONS
        .filter((e) => e.slice(0, e.lastIndexOf("/")) === parent)
        .map((e) => escapeRegex(e.slice(e.lastIndexOf("/") + 1)));
      const guard = kept.length ? `(?!(?:${kept.join("|")})(?:/|$))` : "";
      n += 1;
      return `:paused${n}(${guard}[^/]+)`;
    })
    .join("/");
}

/**
 * Two redirects (exact and `/:path*`) for every paused page prefix and
 * every exact paused page path. API prefixes get none; they 404.
 *
 * @returns {{ source: string, destination: string, permanent: false }[]}
 */
export function pausedRedirects() {
  return [...PAUSED_PAGE_PREFIXES, ...EXACT_PAUSED_PAGE_PATHS].flatMap((prefix) => {
    const source = redirectSource(prefix);
    return [
      { source, destination: PAUSED_LANDING_PATH, permanent: /** @type {const} */ (false) },
      { source: `${source}/:path*`, destination: PAUSED_LANDING_PATH, permanent: /** @type {const} */ (false) },
    ];
  });
}

/**
 * Listed folders that are still on disk under `cwd`.
 *
 * @param {string} [cwd]
 * @returns {string[]}
 */
export function pausedFoldersPresent(cwd = process.cwd()) {
  return PAUSED_ROUTE_FOLDERS.filter((folder) => fs.existsSync(path.join(cwd, folder)));
}

/**
 * Everything next.config.ts needs, in one call. When the build is not
 * paused: no redirects, and both env values are empty strings, so the
 * app hides nothing.
 *
 * When the guard says pause, the listed folders must already be gone
 * (scripts/prune-paused-routes.mjs runs first inside `npm run build`).
 * If any is still on disk the prune did not run — e.g. the Build Command
 * was changed to plain `next build` — and this throws, so the build
 * fails loudly instead of deploying functions nobody can reach. (At
 * runtime on Vercel there is no src/app, so the check passes.)
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [cwd]
 */
export function pausedPillarsBuildConfig(env = process.env, cwd = process.cwd()) {
  const decision = pauseDecision(env, cwd);
  if (decision.pause) {
    const present = pausedFoldersPresent(cwd);
    if (present.length > 0) {
      throw new Error(
        `[paused-routes] ENGAGE + EXPERIENCE should be paused here (${decision.reason}), ` +
          `but ${present.length} of ${PAUSED_ROUTE_FOLDERS.length} paused route folders are still on disk ` +
          `(first: ${present[0]}). The prune step did not run: build with \`npm run build\` ` +
          `(node scripts/prune-paused-routes.mjs before next build), or set BHN_PAUSE_PILLARS=0 to keep every route.`,
      );
    }
  }
  return {
    active: decision.pause,
    reason: decision.reason,
    redirects: decision.pause ? pausedRedirects() : [],
    env: {
      NEXT_PUBLIC_PAUSED_PREFIXES: decision.pause ? pausedPagePrefixesEnvValue() : "",
      NEXT_PUBLIC_PAUSED_API_PREFIXES: decision.pause ? pausedApiPrefixesEnvValue() : "",
    },
  };
}
