import { NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { verifyTotp } from "./security/mfa";

/** Brute-force lockout policy.
 *  • Threshold 5 failed attempts → lock account for LOCKOUT_MINUTES.
 *  • Window resets on a successful sign-in.
 *  Tuned conservatively — biotech buyers sometimes paste credentials
 *  from a manager and fat-finger 2-3 times before getting it right;
 *  5 keeps that legitimate flow alive without making the brute-
 *  force window meaningful. */
const LOGIN_FAIL_THRESHOLD = 5;
const LOCKOUT_MINUTES = 30;

export const ACT_AS_COOKIE = "bhn-act-as";

const DAY = 24 * 60 * 60;
const LONG_SESSION = 30 * DAY;
const SHORT_SESSION = 1 * DAY;

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions["adapter"],
  session: { strategy: "jwt", maxAge: LONG_SESSION },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totp: { label: "Authenticator code", type: "text" },
        remember: { label: "Remember me", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });
        if (!user?.password) return null;

        // Brute-force gate: locked accounts get a hard no until the
        // window expires. We don't reveal "you're locked" via NextAuth
        // (return value is just null = "Invalid email or password"),
        // but a locked-account login attempt is still audit-logged
        // below so admins can see the pattern.
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          return null;
        }

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) {
          // Increment failure counter, lock if past threshold.
          const nextCount = user.failedLoginCount + 1;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginCount: nextCount,
              lastFailedLoginAt: new Date(),
              ...(nextCount >= LOGIN_FAIL_THRESHOLD
                ? { lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000) }
                : {}),
            },
          }).catch(() => undefined);
          if (nextCount >= LOGIN_FAIL_THRESHOLD) {
            await prisma.auditLog.create({
              data: {
                actorId: user.id,
                action: "auth.login_locked",
                targetType: "user",
                targetId: user.id,
                detail: JSON.stringify({ failedLoginCount: nextCount, lockoutMinutes: LOCKOUT_MINUTES }),
              },
            }).catch(() => undefined);
          }
          return null;
        }

        // MFA gate. If the user has TOTP enabled, the credentials
        // payload must include a fresh 6-digit code. Sandbox / demo
        // accounts skip — they're sandboxed by design.
        if (user.totpEnabledAt && user.totpSecret) {
          const code = credentials.totp ?? "";
          if (!verifyTotp(user.totpSecret, code)) {
            // Treat MFA failure as a login fail for lockout purposes.
            const nextCount = user.failedLoginCount + 1;
            await prisma.user.update({
              where: { id: user.id },
              data: {
                failedLoginCount: nextCount,
                lastFailedLoginAt: new Date(),
                ...(nextCount >= LOGIN_FAIL_THRESHOLD
                  ? { lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000) }
                  : {}),
              },
            }).catch(() => undefined);
            return null;
          }
        }

        // All gates passed — clear the failure counter.
        if (user.failedLoginCount > 0 || user.lockedUntil) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginCount: 0,
              lockedUntil: null,
            },
          }).catch(() => undefined);
        }
        // Optional email-verification gate. When BHN_REQUIRE_EMAIL_VERIFY
        // is true, sign-in fails for unverified accounts. We let
        // demo / sandbox accounts through unconditionally — they
        // bypass the verification flow on purpose. Returning null
        // here surfaces as "Invalid email or password" which is
        // intentionally vague (don't leak whether an account is
        // verified vs whether the password is wrong); the dashboard
        // banner + /verify-email pages exist for the friendly UX.
        const requireVerify =
          (process.env.BHN_REQUIRE_EMAIL_VERIFY ?? "").toLowerCase() === "true";
        const accountKind = (user as { accountKind?: string | null }).accountKind ?? "real";
        if (
          requireVerify &&
          accountKind === "real" &&
          !user.emailVerified
        ) {
          return null;
        }
        // Pass the remember flag through to the JWT callback
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          remember: credentials.remember !== "false",
        } as unknown as { id: string; email: string; name: string | null; role: string };
      },
    }),
    // Passwordless sign-in. The /api/auth/send-code route emails a
    // 6-digit code; this provider verifies it. Single-use — the row is
    // deleted on success. attempts caps brute force at 5.
    CredentialsProvider({
      id: "email-code",
      name: "email-code",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Code", type: "text" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const code = credentials?.code?.trim();
        if (!email || !code || !/^\d{6}$/.test(code)) return null;
        const row = await prisma.loginCode.findFirst({
          where: { email, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
        });
        if (!row) return null;
        if (row.attempts >= 5) {
          await prisma.loginCode.delete({ where: { id: row.id } }).catch(() => {});
          return null;
        }
        const ok = await bcrypt.compare(code, row.codeHash);
        if (!ok) {
          await prisma.loginCode.update({
            where: { id: row.id },
            data: { attempts: { increment: 1 } },
          });
          return null;
        }
        // Success — burn the code so it can't be reused.
        await prisma.loginCode.delete({ where: { id: row.id } }).catch(() => {});
        // Also clear any other live codes for this email.
        await prisma.loginCode.deleteMany({ where: { email } }).catch(() => {});
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          remember: true,
        } as unknown as { id: string; email: string; name: string | null; role: string };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.role = (user as { role?: string }).role ?? "user";
        token.id = user.id;
        const remember = (user as { remember?: boolean }).remember;
        if (remember === false) {
          token.shortSession = true;
          token.exp = Math.floor(Date.now() / 1000) + SHORT_SESSION;
        } else {
          token.shortSession = false;
        }
      }
      // Honor exp on subsequent calls so JWT effectively has shorter lifespan when shortSession is set
      if (trigger === "update" && token.shortSession) {
        token.exp = Math.floor(Date.now() / 1000) + SHORT_SESSION;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string; id?: string }).role = token.role as string;
        (session.user as { id?: string }).id = token.id as string;
      }
      return session;
    },
  },
  events: {
    // Stamp last sign-in time on every successful authentication so the
    // admin Users table "Last Login" column reflects real activity. Fires
    // for both credential providers (password + email-code). Best effort —
    // a write failure must never block the login itself.
    async signIn({ user }) {
      const id = (user as { id?: string })?.id;
      if (!id) return;
      await prisma.user
        .update({ where: { id }, data: { lastLoginAt: new Date() } })
        .catch(() => undefined);
    },
  },
};

/** Raw session — never modified for impersonation. Use for auth on
 *  endpoints that toggle the act-as cookie itself. */
export const getRawSession = () => getServerSession(authOptions);

/**
 * getSession(). If the caller is a superadmin and has an active
 * `bhn-act-as` cookie, the returned session.user.role reflects the
 * impersonated role while session.user.realRole keeps the true role
 * and session.user.actingAs flags that we're in view-as mode.
 *
 * This means requireRole("admin") will (correctly) fail when a
 * superadmin is viewing as a trainee — so the experience is faithful.
 */
export async function getSession() {
  const session = await getRawSession();
  if (!session) return null;
  const realRole = (session.user as { role?: string }).role;
  (session.user as { realRole?: string }).realRole = realRole;
  if (realRole === "superadmin") {
    try {
      const actAs = (await cookies()).get(ACT_AS_COOKIE)?.value;
      if (actAs && actAs !== "superadmin" && ROLE_RANK[actAs] !== undefined) {
        (session.user as { role?: string }).role = actAs;
        (session.user as { actingAs?: string }).actingAs = actAs;
      }
    } catch {
      // cookies() can throw outside a request scope — ignore.
    }
  }
  return session;
}

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

/**
 * Roles, ordered:
 *   trainee / evaluating → learner (0)        [legacy alias: 'user']
 *   employer             → HR partner posting jobs (0, gated separately)
 *   hr                   → internal HR / people-ops seat (0, gated separately)
 *   engage_hqp_advisor   → trainee-side HQP advisor seat (1)
 *   equip_grant_reviewer → EQUIP grant review committee seat (1)
 *   instructor           → authors courses (1)
 *   admin                → manages users, audit, settings (2)
 *   superadmin           → admin + LTI, platform settings (3)
 *
 * The two specialised reviewer / advisor seats live at rank 1 — they
 * sit alongside instructors in the staff tier. They're NOT auto-
 * granted admin permissions; routes that gate on a specific role
 * (e.g. /admin/equip) check the role explicitly, while routes that
 * gate on a rank (e.g. requireRole("admin")) still treat them as
 * non-admin staff. Use them to mark someone as "this is the
 * committee seat for X" without granting platform-wide admin access.
 */
export const ROLE_RANK: Record<string, number> = {
  user: 0,                  // legacy
  trainee: 0,
  evaluating: 0,
  employer: 0,              // outside the learner-staff progression — gated separately
  hr: 0,                    // internal HR / people-ops seat — gated per-route, NOT auto-admin
  industrial_mentor: 0,     // industry professional offering guidance to trainees;
                            //   external like employer, gated per-route, not staff
  engage_hqp_advisor: 1,    // ENGAGE HQP Advisory committee seat
  equip_grant_reviewer: 1,  // EQUIP Grant Review committee seat
  instructor: 1,
  admin: 2,
  superadmin: 3,
};

export type Role =
  | "trainee"
  | "evaluating"
  | "employer"
  | "hr"
  | "industrial_mentor"
  | "engage_hqp_advisor"
  | "equip_grant_reviewer"
  | "instructor"
  | "admin"
  | "superadmin";

/** Industrial professional acting as a mentor to trainees. External
 *  role — sits at rank 0 alongside trainee/evaluating/employer. Not
 *  auto-granted any privileged access; routes that should expose
 *  mentor functionality (talent pool read, mentorship pairings,
 *  trainee progress views) gate on the role explicitly. */
export function isIndustrialMentor(role: string) {
  return role === "industrial_mentor";
}

/** Is this account an employer (HR partner who posts jobs / reviews applicants)? */
export function isEmployer(role: string) {
  return role === "employer";
}

/** Internal HR / people-ops seat. Like employer it sits at rank 0 and is
 *  gated per-route — being HR grants no admin access on its own. Use it to
 *  classify internal people-ops staff distinctly from platform admins. */
export function isHr(role: string) {
  return role === "hr";
}

export async function requireRole(minRole: "instructor" | "admin" | "superadmin") {
  const session = await requireSession();
  const userRole = (session.user as { role?: string }).role ?? "user";
  const required = ROLE_RANK[minRole] ?? ROLE_RANK.admin;
  const actual = ROLE_RANK[userRole] ?? 0;
  if (actual < required) throw new Error("Forbidden");
  return session;
}

/**
 * Where to send someone who just failed a role gate on `path`.
 *
 * Signed in but under-privileged → home; there is nothing to sign into.
 * Signed OUT → the login page carrying a return path, so a link followed
 * from an email survives the sign-in instead of dumping them on the
 * dashboard having forgotten where they were going.
 */
export async function deniedRedirect(path: string): Promise<string> {
  const session = await getSession();
  return session ? "/dashboard" : `/login?callbackUrl=${encodeURIComponent(path)}`;
}

/** Admin or higher — manages users, audit, settings. */
export function isAdmin(role: string) {
  return (ROLE_RANK[role] ?? 0) >= ROLE_RANK["admin"];
}

/** Instructor or higher — authors courses. */
export function isStaff(role: string) {
  return (ROLE_RANK[role] ?? 0) >= ROLE_RANK["instructor"];
}

/**
 * Confirm the calling user has authoring rights over this specific
 * course. Used by mutation endpoints under /api/courses/[id]/* to
 * prevent one instructor from defacing another's course (the kind of
 * IDOR that surfaced in the May-2026 Canvas incident: low-privilege
 * authenticated account reaching resources it doesn't own).
 *
 * Returns the session on success. Throws on unauthorized / forbidden.
 *
 * Authorisation matrix:
 *   • The course's `instructorId` matches the caller       → allow
 *   • The caller is admin or superadmin                    → allow
 *     (so platform staff can still moderate / ghost-edit)
 *   • Otherwise                                            → deny (403)
 */
export async function requireCourseOwner(courseId: string) {
  const session = await requireSession();
  const userId = (session.user as { id?: string }).id ?? null;
  const role = (session.user as { role?: string }).role ?? "user";
  if (!userId) throw new Error("Unauthorized");

  // Admins / superadmins skip the ownership check.
  if (isAdmin(role)) return { session, userId, role, isOwner: false, isAdminOverride: true };

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { instructorId: true },
  });
  if (!course) throw new Error("Forbidden"); // Don't leak existence to non-owners.
  if (course.instructorId !== userId) throw new Error("Forbidden");
  return { session, userId, role, isOwner: true, isAdminOverride: false };
}
