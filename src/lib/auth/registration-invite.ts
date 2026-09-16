/**
 * The one database read behind invite-scoped sign-up. Kept apart from
 * ./registration so those rules stay prisma-free and testable.
 */
import { prisma } from "@/lib/prisma";

export interface PendingRegistrationInvite {
  token: string;
  email: string;
  status: string;
  expiresAt: Date;
  companyName: string;
}

/** A company-team invite by token, or null. Read-only; never throws. */
export async function findRegistrationInvite(token: string): Promise<PendingRegistrationInvite | null> {
  const row = await prisma.companyInvite
    .findUnique({
      where: { token },
      select: {
        token: true,
        email: true,
        status: true,
        expiresAt: true,
        company: { select: { name: true } },
      },
    })
    .catch(() => null);
  if (!row) return null;
  return {
    token: row.token,
    email: row.email,
    status: row.status,
    expiresAt: row.expiresAt,
    companyName: row.company.name,
  };
}
