/**
 * Demo personas — the three doors on the /demo chooser.
 *
 * Each persona is a deterministic account (fixed email) that can be
 * re-ensured at any time:
 *
 *   trainee  → the existing showcase trainee (Maya Okafor), spawned by
 *              src/lib/showcase/seed.ts with a fully lived-in journey —
 *              completed courses, a finished pathway, certificates, merch
 *              tiers, interviews. accountKind="showcase".
 *   admin    → a demo admin who sees the whole workspace suite.
 *   employer → a demo employer with a company, so the employer portal
 *              renders populated rather than as an empty shell.
 *
 * All three sign in through the existing /sandbox/[token] magic-token
 * route, which honours only accountKind demo/showcase and refuses real
 * accounts — so nothing here can ever mint a session for a real user.
 *
 * ensurePersona() is idempotent: it upserts by fixed email and returns a
 * fresh magic token each call (rotating the token on every entry keeps
 * old links from accumulating).
 */
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { spawnShowcase } from "@/lib/showcase/seed";

export const PERSONA_KEYS = ["trainee", "admin", "employer"] as const;
export type PersonaKey = (typeof PERSONA_KEYS)[number];

export function isPersonaKey(v: string): v is PersonaKey {
  return (PERSONA_KEYS as readonly string[]).includes(v);
}

/** Copy for the chooser — one line each, written for a hiring manager. */
export const PERSONA_CARDS: Record<PersonaKey, { name: string; title: string; blurb: string }> = {
  trainee: {
    name: "Maya Okafor",
    title: "Trainee",
    blurb:
      "A trainee two cohorts in — completed courses, a finished learning pathway, certificates, credits and rewards, interview prep. The lived-in day-to-day view.",
  },
  admin: {
    name: "Alex Demo",
    title: "Administrator",
    blurb:
      "The operations view — course and event management, the workspace suite (website review, newsletter, outreach, merch), analytics, and the design system itself.",
  },
  employer: {
    name: "Jordan Demo",
    title: "Employer",
    blurb:
      "The hiring side — a company profile, internship postings, the talent pool, and applicant pipelines.",
  },
};

const ADMIN_EMAIL = "demo.admin@biohubnet.test";
const EMPLOYER_EMAIL = "demo.employer@biohubnet.test";
const DEMO_COMPANY = "Northway Biologics (Demo)";

function newToken(): string {
  return randomBytes(24).toString("hex");
}

/**
 * The demo admin, separately ensurable because spawnShowcase records
 * createdByAdminId — a real FK to User — so the trainee persona needs an
 * admin row to exist first. (Found the hard way: seeding a fresh database
 * with a placeholder id violates the constraint.)
 */
export async function ensureDemoAdmin(): Promise<{ id: string; magicToken: string }> {
  const token = newToken();
  const password = await bcrypt.hash(newToken(), 10); // unused; never shared
  const user = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      email: ADMIN_EMAIL,
      name: PERSONA_CARDS.admin.name,
      password,
      role: "admin",
      accountKind: "demo",
      emailVerified: new Date(),
      magicToken: token,
    },
    update: { magicToken: token, isActive: true },
  });
  return { id: user.id, magicToken: token };
}

export async function ensurePersona(key: PersonaKey): Promise<{ magicToken: string }> {
  if (key === "admin") {
    return ensureDemoAdmin();
  }

  if (key === "trainee") {
    // The showcase seeder owns this persona entirely — including its magic
    // token — but records who spawned it, so the demo admin comes first.
    const admin = await ensureDemoAdmin();
    const result = await spawnShowcase(admin.id, { reset: false });
    return { magicToken: result.user.magicToken };
  }

  const token = newToken();
  const password = await bcrypt.hash(newToken(), 10); // unused; never shared

  // employer — needs a company membership or the portal is an empty shell.
  const user = await prisma.user.upsert({
    where: { email: EMPLOYER_EMAIL },
    create: {
      email: EMPLOYER_EMAIL,
      name: PERSONA_CARDS.employer.name,
      password,
      role: "employer",
      accountKind: "demo",
      emailVerified: new Date(),
      magicToken: token,
    },
    update: { magicToken: token, isActive: true },
  });

  let company = await prisma.company.findFirst({ where: { name: DEMO_COMPANY } });
  if (!company) {
    company = await prisma.company.create({
      data: {
        name: DEMO_COMPANY,
        kind: "demo",
        industry: "Biomanufacturing",
        size: "51-200",
        location: "Toronto, ON",
        description:
          "A demonstration biologics manufacturer used by the portfolio demo. Everything on this company is synthetic.",
      },
    });
  }
  const membership = await prisma.companyMember.findFirst({
    where: { companyId: company.id, userId: user.id },
  });
  if (!membership) {
    await prisma.companyMember.create({
      data: { companyId: company.id, userId: user.id, role: "owner", title: "Talent Lead" },
    });
  }
  return { magicToken: token };
}
