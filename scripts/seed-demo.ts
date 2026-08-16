/**
 * Seed the DEMO database into its presentable state.
 *
 *   npx tsx scripts/seed-demo.ts
 *
 * Run against the DEMO deployment's DATABASE_URL only. The script refuses
 * to run unless NEXT_PUBLIC_DEMO_MODE=true is set in its environment —
 * a deliberate speed bump so it cannot be pointed at production by
 * accident (production's env does not carry the flag).
 *
 * Idempotent: every step upserts or skips, so re-running (including from
 * the nightly reset) converges on the same world instead of duplicating.
 *
 * Order matters: the catalogue first (spawnShowcase enrolls Maya into
 * real courses when they exist), then events, then the personas.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { spawnShowcase } from "../src/lib/showcase/seed";
import { ensureDemoAdmin, ensurePersona, PERSONA_KEYS } from "../src/lib/demo/personas";

function step(name: string, fn: () => void | Promise<void>) {
  process.stdout.write(`── ${name}\n`);
  return fn();
}

async function main() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    console.error(
      "Refusing: NEXT_PUBLIC_DEMO_MODE is not 'true' in this environment.\n" +
        "This seeder is for the demo database only. If you really are pointing\n" +
        "at the demo DB, run:  NEXT_PUBLIC_DEMO_MODE=true npx tsx scripts/seed-demo.ts",
    );
    process.exit(1);
  }

  // 1. The real ENGAGE catalogue — 70 courses, from the committed fixture.
  await step("ENGAGE catalogue (70 courses)", () => {
    execFileSync(
      "npx",
      [
        "tsx",
        join("scripts", "import-engage-catalogue.ts"),
        "--file",
        join("prisma", "fixtures", "engage-catalogue.json"),
        "--write",
      ],
      { stdio: "inherit" },
    );
  });

  // 1b. The catalogue import deliberately writes no credit cost, but the
  //     showcase trainee's enrollment layer only engages when >=3 published
  //     courses cost credits — and the Spring 2026 catalogue PDF prices
  //     every on-demand course at 100 Training Credits. Set that here so
  //     Maya's completed-course history has something real to hang off.
  await step("Course credit costs (100 each, per the catalogue)", async () => {
    const r = await prisma.course.updateMany({
      where: { status: "published", creditCost: 0 },
      data: { creditCost: 100 },
    });
    console.log(`   priced ${r.count} courses`);
  });

  // 2. Events + workshops (symposium world), if the seeder is present.
  await step("Events & workshops", () => {
    execFileSync("npx", ["tsx", join("prisma", "seed-events.ts")], { stdio: "inherit" });
  });

  // 3. Maya — the lived-in showcase trainee. reset:true wipes her drifted
  //    state so every reseed lands on the canonical demo journey. The demo
  //    admin must exist first: spawnShowcase records createdByAdminId, a
  //    real FK into User.
  await step("Showcase trainee (Maya)", async () => {
    const admin = await ensureDemoAdmin();
    const r = await spawnShowcase(admin.id, { reset: true });
    console.log(
      `   enrollments=${r.counts.enrollments} certificates=${r.counts.certificates} ` +
        `merch=${r.counts.merchRewards} interviews=${r.counts.interviews}`,
    );
  });

  // 4. The other two doors.
  await step("Admin + employer personas", async () => {
    for (const key of PERSONA_KEYS) await ensurePersona(key);
  });

  const [users, courses, events] = await Promise.all([
    prisma.user.count(),
    prisma.course.count(),
    prisma.bhnEvent.count(),
  ]);
  console.log(`\nDemo world ready: ${users} users · ${courses} courses · ${events} events.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
