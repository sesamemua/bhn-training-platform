/**
 * Showcase Trainee — single global "advanced trainee" demo account.
 *
 * Use case
 * --------
 * For sales calls, partner demos, and training-team walkthroughs we
 * want a trainee account that's already lived through the full BHN
 * journey — completed coursework, finished a pathway, earned
 * certificates, hit both merch tiers, has a fully-built application
 * profile (resume / 1-min video / elevator pitch), and has interviews
 * scheduled. So a viewer hopping into the showcase sees the platform
 * in its "lived-in" advanced state, not an empty new-trainee shell.
 *
 * One account, refreshable
 * ------------------------
 * Unlike sandbox (one per admin) or demo (one per prospect), this is
 * a single global account at a deterministic email
 * (showcase.trainee@biohubnet.test). Admins can spawn it once,
 * refresh / reset it (wipe + re-seed) to clean state, or sign in
 * directly via the magic token we mint on each spawn.
 *
 * accountKind="showcase"
 * ----------------------
 * Filtered out of "real" stats by default (same gate as sandbox /
 * demo). Magic-token sign-in is allowed at /sandbox/[token] (we
 * extended the gate). Never auto-deletes.
 *
 * Resilience
 * ----------
 * The seeder uses real Course / Pathway / InternshipPosting rows when
 * present (so the showcase looks authentic on a populated DB) and
 * gracefully skips those layers when the DB hasn't been seeded yet.
 * The credit-transaction history + merch rewards are seeded
 * unconditionally so the rewards demo always works.
 */
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/** Deterministic identifiers — one global showcase trainee. */
export const SHOWCASE_EMAIL = "showcase.trainee@biohubnet.test";
export const SHOWCASE_NAME = "Maya Okafor";

export interface ShowcaseSeedResult {
  user: { id: string; email: string; name: string; magicToken: string };
  password: string;
  /** Counts so the admin UI can render "spawned with N enrollments,
   *  M certificates, …" without re-querying. */
  counts: {
    enrollments: number;
    certificates: number;
    creditTransactions: number;
    merchRewards: number;
    interviews: number;
    userSkills: number;
  };
}

function newToken() {
  return randomBytes(24).toString("hex");
}

const SHOWCASE_PROFILE = {
  bio: "PhD candidate translating mRNA platform work into a stage-zero startup. Two cohorts deep into BHN training; currently building a regulatory + IP playbook for first-in-class therapeutics.",
  jobTitle: "PhD Candidate",
  organization: "University of Toronto",
  country: "Canada",
  phone: "+1 (416) 555-0142",
  // Stub URLs — clearly demo. Won't actually serve a file; the goal
  // is to demonstrate that the My Application surfaces have content
  // rather than empty placeholders.
  resumeUrl: "https://demo.biohubnet.test/showcase/maya-okafor-resume.pdf",
  videoIntroUrl: "https://demo.biohubnet.test/showcase/maya-okafor-intro.mp4",
  elevatorPitch:
    "Translating mRNA delivery platforms into rare-disease therapeutics. Two patents disclosed; pre-seed; looking for commercial-stage co-founders and seed-stage capital partners.",
};

const SHOWCASE_PICKUP_ADDRESS = {
  recipientName: SHOWCASE_NAME,
  // PICKUP claims don't store an address — the bundle waits at the
  // BHN office at U of T. We still set the recipientName so the
  // admin queue shows "Hand to: Maya Okafor".
};

/**
 * Spawn or refresh the showcase trainee. Idempotent: if the account
 * already exists we leave it in place and re-seed the related rows
 * around it (in case schema or content has evolved).
 *
 * Pass `reset = true` to wipe the related rows and re-seed cleanly —
 * useful when the showcase has drifted from the canonical state and
 * you want a known-good demo state.
 */
export async function spawnShowcase(
  adminId: string,
  options: { reset?: boolean } = {},
): Promise<ShowcaseSeedResult> {
  const { reset = false } = options;
  const password = "showcase-trainee";
  const passwordHash = await bcrypt.hash(password, 10);
  const token = newToken();

  // 1. Upsert the user row ────────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { email: SHOWCASE_EMAIL },
    create: {
      email: SHOWCASE_EMAIL,
      name: SHOWCASE_NAME,
      password: passwordHash,
      role: "trainee",
      accountKind: "showcase",
      isActive: true,
      emailVerified: new Date(),
      magicToken: token,
      createdByAdminId: adminId,
      credits: 1000, // 200 starter + 6000 granted - 5200 spent
      // Two cohorts in, the first-login cell-split ritual is long behind
      // her — and a demo visitor must land on the lived-in dashboard, not
      // a mandatory mini-game (it stays reachable via ?replay=1).
      hasSplitCell: true,
      bio: SHOWCASE_PROFILE.bio,
      jobTitle: SHOWCASE_PROFILE.jobTitle,
      organization: SHOWCASE_PROFILE.organization,
      country: SHOWCASE_PROFILE.country,
      phone: SHOWCASE_PROFILE.phone,
      resumeUrl: SHOWCASE_PROFILE.resumeUrl,
      videoIntroUrl: SHOWCASE_PROFILE.videoIntroUrl,
      elevatorPitch: SHOWCASE_PROFILE.elevatorPitch,
      applicationUpdatedAt: new Date(),
    },
    update: {
      // Always rotate the magic token so old links can't ride forever.
      magicToken: token,
      role: "trainee",
      accountKind: "showcase",
      isActive: true,
      hasSplitCell: true,
      // Re-apply the canonical profile every spawn so admins can use
      // spawn() to "fix" any local drift.
      bio: SHOWCASE_PROFILE.bio,
      jobTitle: SHOWCASE_PROFILE.jobTitle,
      organization: SHOWCASE_PROFILE.organization,
      country: SHOWCASE_PROFILE.country,
      phone: SHOWCASE_PROFILE.phone,
      resumeUrl: SHOWCASE_PROFILE.resumeUrl,
      videoIntroUrl: SHOWCASE_PROFILE.videoIntroUrl,
      elevatorPitch: SHOWCASE_PROFILE.elevatorPitch,
      applicationUpdatedAt: new Date(),
    },
  });

  // 2. If reset, wipe related rows so the next steps re-seed cleanly.
  //    On a normal spawn we leave existing related rows alone (they
  //    might carry hand-tweaked demo state we don't want to clobber).
  if (reset) {
    await Promise.all([
      prisma.merchReward.deleteMany({ where: { userId: user.id } }),
      prisma.certificate.deleteMany({ where: { userId: user.id } }),
      prisma.enrollment.deleteMany({ where: { userId: user.id } }),
      prisma.pathwayEnrollment.deleteMany({ where: { userId: user.id } }),
      prisma.creditTransaction.deleteMany({ where: { userId: user.id } }),
      prisma.userSkill.deleteMany({ where: { userId: user.id } }),
      prisma.interview.deleteMany({ where: { applicantId: user.id } }),
    ]);
  }

  // 3. Credit transactions — these drive the rewards-tier math
  //    (lifetimeSpent = sum of debits). We ALWAYS seed the synthetic
  //    history so both merch tiers (2,500 and 5,000) unlock cleanly,
  //    independent of whether real Course rows exist on this DB.
  let creditTransactions = 0;
  if (reset || (await prisma.creditTransaction.count({ where: { userId: user.id } })) === 0) {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    // Initial 200, application-grant 6000, three enrollment debits.
    const tx = await prisma.creditTransaction.createMany({
      data: [
        {
          userId: user.id,
          amount: 200,
          type: "credit",
          reason: "initial",
          balanceAfter: 200,
          createdAt: new Date(now - 120 * day),
        },
        {
          userId: user.id,
          amount: 6000,
          type: "credit",
          reason: "admin_grant",
          balanceAfter: 6200,
          createdAt: new Date(now - 100 * day),
        },
        {
          userId: user.id,
          amount: -1500,
          type: "debit",
          reason: "enrollment",
          balanceAfter: 4700,
          createdAt: new Date(now - 90 * day),
        },
        {
          userId: user.id,
          amount: -1800,
          type: "debit",
          reason: "enrollment",
          balanceAfter: 2900,
          createdAt: new Date(now - 65 * day),
        },
        {
          userId: user.id,
          amount: -1900,
          type: "debit",
          reason: "enrollment",
          balanceAfter: 1000,
          createdAt: new Date(now - 30 * day),
        },
      ],
    });
    creditTransactions = tx.count;
  }

  // 4. Merch rewards — both tiers, both CLAIMED at the BHN office at
  //    U of T (PICKUP). Tier 1 already SHIPPED (ready for pickup);
  //    Tier 2 still in queue (CLAIMED, waiting on pack). This shows
  //    off the full lifecycle in the trainee /rewards card states.
  let merchRewards = 0;
  if (reset || (await prisma.merchReward.count({ where: { userId: user.id } })) === 0) {
    const baseShip = {
      ...SHOWCASE_PICKUP_ADDRESS,
      shirtSize: null,
      notes: "Available afternoons after 2pm. Will collect from front desk.",
    };
    await prisma.merchReward.create({
      data: {
        userId: user.id,
        tier: 1,
        threshold: 2500,
        status: "SHIPPED",                 // ready for pickup
        fulfillmentMethod: "PICKUP",
        unlockedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        claimedAt:  new Date(Date.now() - 55 * 24 * 60 * 60 * 1000),
        shippedAt:  new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        fulfilledById: adminId,
        ...baseShip,
      },
    });
    await prisma.merchReward.create({
      data: {
        userId: user.id,
        tier: 2,
        threshold: 5000,
        status: "CLAIMED",                 // in pack queue
        fulfillmentMethod: "PICKUP",
        unlockedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        claimedAt:  new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
        ...baseShip,
      },
    });
    merchRewards = 2;
  } else {
    merchRewards = await prisma.merchReward.count({ where: { userId: user.id } });
  }

  // 5. Real Course / Enrollment / Certificate rows — only when the
  //    DB has at least 3 published, credited courses. On a sparse DB
  //    we skip these layers (the rewards demo still works because
  //    step 3 wrote the credit history that rewards.ts reads).
  let enrollments = 0;
  let certificates = 0;
  const candidateCourses = await prisma.course.findMany({
    where: { status: "published", creditCost: { gt: 0 } },
    orderBy: { createdAt: "asc" },
    take: 4,
    select: { id: true, title: true },
  });
  if (candidateCourses.length >= 3 && (reset || (await prisma.enrollment.count({ where: { userId: user.id } })) === 0)) {
    const completedCourses = candidateCourses.slice(0, 2);
    const activeCourse = candidateCourses[2];

    for (const c of completedCourses) {
      await prisma.enrollment.upsert({
        where: { userId_courseId: { userId: user.id, courseId: c.id } },
        create: {
          userId: user.id,
          courseId: c.id,
          status: "completed",
          progress: 1,
          score: 92 + Math.floor(Math.random() * 5),
          completedAt: new Date(Date.now() - (30 + Math.floor(Math.random() * 40)) * 24 * 60 * 60 * 1000),
        },
        update: {
          status: "completed",
          progress: 1,
          score: 92 + Math.floor(Math.random() * 5),
        },
      });
      enrollments++;
      await prisma.certificate.upsert({
        where: { userId_courseId: { userId: user.id, courseId: c.id } },
        create: {
          userId: user.id,
          courseId: c.id,
          kind: "course",
          issueDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
        update: {},
      });
      certificates++;
    }
    // One active enrollment so the dashboard "in progress" widget has content.
    await prisma.enrollment.upsert({
      where: { userId_courseId: { userId: user.id, courseId: activeCourse.id } },
      create: {
        userId: user.id,
        courseId: activeCourse.id,
        status: "active",
        progress: 0.62,
      },
      update: {
        status: "active",
        progress: 0.62,
      },
    });
    enrollments++;
  }

  // 6. Pathway — completed enrollment + pathway-level certificate.
  const pathway = await prisma.pathway.findFirst({
    where: { status: "published" },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true },
  });
  if (pathway && (reset || (await prisma.pathwayEnrollment.count({ where: { userId: user.id } })) === 0)) {
    await prisma.pathwayEnrollment.upsert({
      where: { userId_pathwayId: { userId: user.id, pathwayId: pathway.id } },
      create: {
        userId: user.id,
        pathwayId: pathway.id,
        status: "completed",
        approvedAt: new Date(Date.now() - 80 * 24 * 60 * 60 * 1000),
        completedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      },
      update: {
        status: "completed",
        completedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      },
    });
    await prisma.certificate.upsert({
      where: { userId_pathwayId: { userId: user.id, pathwayId: pathway.id } },
      create: {
        userId: user.id,
        pathwayId: pathway.id,
        kind: "pathway",
        issueDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      },
      update: {},
    });
    certificates++;
  }

  // 7. Interviews — need a posting + an interviewer. Use the first
  //    available active posting; admin who spawned plays interviewer.
  let interviews = 0;
  const posting = await prisma.internshipPosting.findFirst({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (posting && (reset || (await prisma.interview.count({ where: { applicantId: user.id } })) === 0)) {
    const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
    await prisma.interview.create({
      data: {
        postingId: posting.id,
        applicantId: user.id,
        scheduledById: adminId,
        proposedSlots: [inDays(3).toISOString(), inDays(4).toISOString(), inDays(5).toISOString()],
        acceptedSlot: inDays(4),
        status: "accepted",
        format: "video",
        location: "Zoom — link sent 24h before",
        notes: "Process science round 1 — focus on analytical method development experience.",
      },
    });
    await prisma.interview.create({
      data: {
        postingId: posting.id,
        applicantId: user.id,
        scheduledById: adminId,
        proposedSlots: [inDays(8).toISOString(), inDays(9).toISOString(), inDays(10).toISOString()],
        status: "proposed",
        format: "onsite",
        location: "144 College St., Toronto, ON",
        notes: "Round 2 — onsite lab visit. Will tour suite + meet team.",
      },
    });
    interviews = 2;
  }

  // 8. Skills — pick a few skills if the ontology is seeded.
  let userSkills = 0;
  const skills = await prisma.skill.findMany({
    orderBy: { name: "asc" },
    take: 6,
    select: { id: true },
  });
  if (skills.length > 0 && (reset || (await prisma.userSkill.count({ where: { userId: user.id } })) === 0)) {
    for (const s of skills) {
      await prisma.userSkill.upsert({
        where: { userId_skillId: { userId: user.id, skillId: s.id } },
        create: {
          userId: user.id,
          skillId: s.id,
          level: 0.7 + Math.random() * 0.25,
          source: "inferred",
        },
        update: {},
      });
      userSkills++;
    }
  }

  return {
    user: { id: user.id, email: user.email, name: user.name ?? SHOWCASE_NAME, magicToken: token },
    password,
    counts: {
      enrollments,
      certificates,
      creditTransactions,
      merchRewards,
      interviews,
      userSkills,
    },
  };
}

/** Wipe + re-seed for a known-good demo state. */
export async function resetShowcase(adminId: string): Promise<ShowcaseSeedResult> {
  return spawnShowcase(adminId, { reset: true });
}

/** Fully delete the showcase trainee + all owned rows (cascade). */
export async function deleteShowcase(): Promise<{ deleted: boolean }> {
  const user = await prisma.user.findUnique({
    where: { email: SHOWCASE_EMAIL },
    select: { id: true, accountKind: true },
  });
  if (!user) return { deleted: false };
  // Defence in depth — refuse to ever delete a real account by mistake.
  if (user.accountKind !== "showcase") return { deleted: false };
  await prisma.user.delete({ where: { id: user.id } });
  return { deleted: true };
}

/** Read-only summary for the admin page. */
export async function getShowcase() {
  const user = await prisma.user.findUnique({
    where: { email: SHOWCASE_EMAIL },
    select: {
      id: true, email: true, name: true, magicToken: true, credits: true,
      createdByAdminId: true, createdAt: true, updatedAt: true,
      accountKind: true,
    },
  });
  if (!user || user.accountKind !== "showcase") return null;
  const [enrollments, certificates, creditTransactions, merchRewards, interviews, userSkills] = await Promise.all([
    prisma.enrollment.count({ where: { userId: user.id } }),
    prisma.certificate.count({ where: { userId: user.id } }),
    prisma.creditTransaction.count({ where: { userId: user.id } }),
    prisma.merchReward.count({ where: { userId: user.id } }),
    prisma.interview.count({ where: { applicantId: user.id } }),
    prisma.userSkill.count({ where: { userId: user.id } }),
  ]);
  return {
    user,
    counts: { enrollments, certificates, creditTransactions, merchRewards, interviews, userSkills },
  };
}
