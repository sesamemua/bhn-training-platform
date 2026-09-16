/**
 * Public sign-up switch.
 *
 * Production is invite-only: nobody can create their own account unless
 * ops sets REGISTRATION_OPEN=true on Vercel and redeploys. The demo
 * deployment (NEXT_PUBLIC_DEMO_MODE) keeps sign-up open, because sign-up
 * is part of what it demonstrates. Everything that creates an account
 * from a public form, or links to one, gates on isRegistrationOpen().
 *
 * Server-side only on purpose. REGISTRATION_OPEN is not a NEXT_PUBLIC_
 * variable, so a client component that called this would always read
 * "closed". Server components decide and pass the answer down as a prop.
 *
 * Deliberately prisma-free so the rules can be unit-tested; the invite
 * lookup lives in ./registration-invite.
 *
 * What stays open while sign-up is closed:
 *   • admins creating users from /admin/users (it posts to the same API)
 *   • a pending company-team invite, for the address it was sent to
 *   • the admin-issued links (employer magic links, demo/test seeders) —
 *     they never went through /register in the first place
 *   • LTI launch, but only for accounts that already exist: its id_token
 *     is not signature-checked yet, so it must not mint new ones
 */
import { NextResponse } from "next/server";
import { demoMode } from "@/lib/demo/mode";

export const REGISTRATION_CLOSED_ERROR = "Registration is closed.";

/** Where the closed page and CTAs send people who need access. */
export const REGISTRATION_CONTACT_EMAIL = "support@biohubnet.ca";

/** Closed unless the flag is exactly "true" — a typo must not open it. */
export function isRegistrationOpen(): boolean {
  return process.env.REGISTRATION_OPEN === "true" || demoMode();
}

export function registrationClosedResponse(): NextResponse {
  return NextResponse.json({ error: REGISTRATION_CLOSED_ERROR }, { status: 403 });
}

// Lives in its own import-free module so the client login page can use it.
export { inviteTokenFromPath } from "./invite-path";

export interface RegistrationInvite {
  email: string;
  status: string;
  expiresAt: Date;
}

/**
 * May this invite create an account for this email while sign-up is
 * closed? Only a live invite, and only for the address it was sent to —
 * a forwarded link must not mint an account for somebody else.
 */
export function inviteAllowsRegistration(
  invite: RegistrationInvite | null | undefined,
  email: string,
  now: Date = new Date(),
): boolean {
  if (!invite) return false;
  if (invite.status !== "pending") return false;
  if (invite.expiresAt.getTime() <= now.getTime()) return false;
  const want = invite.email.trim().toLowerCase();
  return want.length > 0 && want === email.trim().toLowerCase();
}
