/**
 * Migration-order check.
 *
 * Prisma applies `prisma/migrations/*` in lexicographic folder order on a
 * fresh database. Production already holds folders dated AHEAD of the
 * calendar (up to 20261003000000_social_posts) — all applied, all tracked
 * by NAME in `_prisma_migrations`. Two things follow:
 *
 *   • Renaming an applied folder fails the next Vercel build: `migrate
 *     deploy` sees one migration missing and one it has never heard of.
 *   • A migration carrying today's real timestamp sorts BEFORE those
 *     folders. Production would apply it fine; a fresh database (demo
 *     reset, Neon branch) would run it before the tables it alters exist.
 *
 * So the rule is monotonic: every NEW folder must sort after the newest
 * folder already on the base ref. Once the calendar passes the last
 * fabricated date, real timestamps satisfy this on their own.
 *
 * Usage: `npm run check:migrations`. Base ref = MIGRATION_BASE_REF (CI sets
 * it to the pre-push SHA on a push, so a multi-commit push is checked
 * whole), else HEAD~1 on main in CI, origin/main on a PR, HEAD locally.
 * A base that cannot be read is a failure, not a pass.
 */
import { readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const DIR = path.join(process.cwd(), "prisma", "migrations");
const NAME = /^(\d{14})_[a-z0-9_]+$/;

function sh(cmd: string): string {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function localFolders(): string[] {
  return readdirSync(DIR)
    .filter((f) => statSync(path.join(DIR, f)).isDirectory())
    .sort();
}

function baseRef(): string {
  const given = process.env.MIGRATION_BASE_REF?.trim();
  // GitHub sends all zeros as `before` when the push created the branch.
  if (given && !/^0+$/.test(given)) return given;
  if (process.env.GITHUB_ACTIONS) return process.env.GITHUB_REF_NAME === "main" ? "HEAD~1" : "origin/main";
  return "HEAD";
}

function baseFolders(ref: string): string[] {
  let out: string;
  try {
    out = sh(`git ls-tree --name-only ${ref} prisma/migrations/`);
  } catch {
    console.error(`✗ cannot read prisma/migrations at ${ref} (is the ref fetched?)`);
    process.exit(2);
  }
  const folders = out
    .split("\n")
    .map((l) => path.basename(l.trim()))
    .filter((f) => f && f !== "migration_lock.toml")
    .sort();
  if (folders.length === 0) {
    console.error(`✗ ${ref} has no prisma/migrations — refusing to treat every folder as new`);
    process.exit(2);
  }
  return folders;
}

/** The day after the newest folder, at 000000 — the next name that sorts. */
function nextPrefix(newest: string): string {
  const y = Number(newest.slice(0, 4));
  const m = Number(newest.slice(4, 6)) - 1;
  const d = Number(newest.slice(6, 8));
  const next = new Date(Date.UTC(y, m, d + 1));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}000000`;
}

const ref = baseRef();
const local = localFolders();
const base = baseFolders(ref);
const known = new Set(base);
const fresh = local.filter((f) => !known.has(f));
const newest = base.length ? base[base.length - 1] : "";

const problems: string[] = [];
for (const f of fresh) {
  if (!NAME.test(f)) {
    problems.push(`${f}: must match <YYYYMMDDHHMMSS>_<snake_case_name>`);
  } else if (newest && f <= newest) {
    problems.push(`${f}: sorts before ${newest} — a fresh database would apply it too early`);
  }
}

console.log(`migrations: ${local.length} local · ${base.length} on ${ref} · ${fresh.length} new`);
if (newest) console.log(`newest on ${ref}: ${newest}\nnext valid prefix: ${nextPrefix(newest.slice(0, 14))}_<name>`);
if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log(fresh.length ? `✓ ${fresh.join(", ")} sort after ${newest}` : "✓ nothing new to check");
