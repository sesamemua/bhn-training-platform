import { z } from "zod";
import { mailConfigured, sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

export const staffReviewRecipients = {
  isActive: true,
  accountKind: "real",
  role: { in: ["instructor", "admin", "superadmin"] },
};
export const reviewInviteUserIds = z.array(z.string().min(1).max(150)).min(1).max(20);

export async function sendStaffReviewInvites({
  actor, userIds, title, path, instructions, audit,
}: {
  actor: { id: string; name?: string | null; email?: string | null };
  userIds: string[];
  title: string;
  path: string;
  instructions: string;
  audit: { action: string; targetType: string; targetId: string; round?: number };
}) {
  const ids = [...new Set(userIds)];
  const colleagues = await prisma.user.findMany({
    where: { ...staffReviewRecipients, id: { in: ids } },
    select: { id: true, name: true, email: true },
  });
  if (colleagues.length !== ids.length || colleagues.some(({ email }) => !z.string().email().safeParse(email).success)) {
    return { error: "Choose active colleagues from the team list.", sent: [] as string[] };
  }
  if (!mailConfigured()) return { error: "Email is not configured. Copy the review link instead.", sent: [] as string[] };

  const link = new URL(path, process.env.NEXTAUTH_URL || "https://bhn-training-platform.vercel.app").href;
  const sender = actor.name || "A BioHubNet colleague";
  const sent: string[] = [];
  const { round, ...target } = audit;
  for (const who of colleagues) {
    try {
      await sendMail({
        to: who.email,
        subject: `${sender} requested your review: ${title}`.replace(/[\r\n]+/g, " "),
        text: `Hello ${who.name || "there"},\n\n${sender} would like you to review ${title}.\n\n${link}\n\n${instructions}`,
        replyTo: actor.email ?? undefined,
      });
      sent.push(who.id);
      await prisma.auditLog.create({ data: {
        actorId: actor.id, ...target,
        detail: JSON.stringify({ recipientId: who.id, recipientEmail: who.email, round }),
      } }).catch((error) => console.error("Review invitation audit failed", error));
    } catch (error) {
      console.error("Review invitation failed", error);
    }
  }
  return { sent, error: sent.length < colleagues.length ? "Some invitations could not be sent. Only unsent recipients remain selected." : undefined };
}
