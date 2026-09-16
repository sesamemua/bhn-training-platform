/**
 * Who may still create an account through POST /api/auth/register while
 * public sign-up is closed. Kept out of the route file (Next only lets a
 * route.ts export its handlers) so each exception can be tested.
 *
 *   • a signed-in admin — /admin/users "Create User" posts to that API
 *   • the addressee of a live company-team invite — the invite page sends
 *     new teammates to /register
 *
 * Everyone else is turned away before validation, the CAPTCHA call or
 * any write.
 */
import { getSession, isAdmin } from "@/lib/auth";
import { inviteAllowsRegistration, type RegistrationInvite } from "./registration";
import { findRegistrationInvite } from "./registration-invite";

export interface RegistrationGateDeps {
  /** The caller's effective role, or "" when signed out. */
  callerRole: () => Promise<string>;
  /** A company-team invite by token, or null. */
  findInvite: (token: string) => Promise<RegistrationInvite | null>;
}

/**
 * getSession() only decodes the JWT, with no database read. It throws
 * outside a request; that, like any failure, counts as signed out, so a
 * broken session can only close the gate, never open it. A superadmin
 * "viewing as" a lower role gets that role, as everywhere else.
 */
async function sessionRole(): Promise<string> {
  const session = await getSession().catch(() => null);
  return (session?.user as { role?: string } | undefined)?.role ?? "";
}

/** What the route uses. Tests swap these fields and put them back. */
export const registrationGateDeps: RegistrationGateDeps = {
  callerRole: sessionRole,
  findInvite: findRegistrationInvite,
};

export async function closedRegistrationAllows(
  email: unknown,
  inviteToken: unknown,
  deps: RegistrationGateDeps = registrationGateDeps,
): Promise<boolean> {
  // Any failure reading the role counts as signed out.
  const role = await Promise.resolve().then(deps.callerRole).catch(() => "");
  if (isAdmin(role)) return true;
  if (typeof inviteToken !== "string" || !inviteToken || typeof email !== "string") return false;
  const invite = await deps.findInvite(inviteToken);
  return inviteAllowsRegistration(invite, email);
}
