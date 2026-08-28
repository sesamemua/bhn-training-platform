/**
 * Which earlier applications count against somebody's VentureConnect cap.
 *
 * One definition, because there were two identical copies of this query
 * and both carried the same bug — and a rule about money that exists
 * twice is a rule that will be enforced two different ways the first
 * time one copy is edited.
 */
import type { Prisma } from "@prisma/client";

/** An application, as far as the cap is concerned. */
export interface CapSubject {
  id: string;
  userId: string | null;
  applicantEmail: string | null;
  stream: string;
}

/**
 * The filter for "this applicant's other approved VentureConnect
 * applications".
 *
 * An account holder is identified by userId. A public applicant has no
 * account, and `userId: null` would match every OTHER public
 * application — everybody's, not theirs — so their own approvals are
 * found by the address they applied with. Getting that wrong does not
 * fail loudly: it silently refuses somebody because strangers have
 * been funded.
 */
export function priorApprovalsWhere(app: CapSubject): Prisma.EquipApplicationWhereInput {
  const who: Prisma.EquipApplicationWhereInput = app.userId
    ? { userId: app.userId }
    : app.applicantEmail
      ? { userId: null, applicantEmail: { equals: app.applicantEmail, mode: "insensitive" } }
      // No account and no address: nothing can be attributed to them,
      // and attributing everything would be worse.
      : { id: "__none__" };

  return {
    ...who,
    stream: "venture_connect",
    id: { not: app.id },
    status: { in: ["approved", "funded"] },
  };
}

/** What an approval of `amount` would do to the cap. */
export function capVerdict(cap: number, previouslyApproved: number, amount: number) {
  const remaining = Math.max(0, cap - previouslyApproved);
  return { cap, previouslyApproved, remaining, wouldExceed: amount > remaining };
}
