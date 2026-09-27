/**
 * Emailing a public draft its link, and removing drafts whose two weeks
 * are up. The rules are in ./draft-expiry.ts; this is the I/O.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { mailConfigured, sendMail } from "@/lib/mail";
import { absolute } from "@/lib/notify/email";
import { draftExpiresAt, draftLinkLetter, draftPath, DRAFT_DAYS } from "./draft-expiry";
import { purgeApplication } from "./purge";

export interface DraftForNotice {
  id: string;
  stream: string;
  status: string;
  publicToken: string | null;
  applicantName: string | null;
  applicantEmail: string | null;
  draftNoticeSentAt: Date | null;
}

export const NOTICE_SELECT = {
  id: true, stream: true, status: true, publicToken: true,
  applicantName: true, applicantEmail: true, draftNoticeSentAt: true,
} as const;

/**
 * Send one draft its link.
 *
 * The first send starts the two weeks and stamps it; a later send —
 * "email me my link again" — repeats the same deadline rather than
 * granting a new one, or the button would be a way to never expire.
 */
export async function sendDraftLink(app: DraftForNotice): Promise<{ sent: boolean; expiresAt: Date | null }> {
  if (app.status !== "draft" || !app.publicToken || !app.applicantEmail) return { sent: false, expiresAt: null };
  const noticeAt = app.draftNoticeSentAt ?? new Date();
  const expiresAt = draftExpiresAt(noticeAt);
  if (!mailConfigured()) return { sent: false, expiresAt: app.draftNoticeSentAt ? expiresAt : null };

  const letter = draftLinkLetter({
    name: app.applicantName ?? "",
    stream: app.stream,
    link: absolute(draftPath(app.stream, app.publicToken)),
    expiresAt,
  });
  try {
    await sendMail({ to: app.applicantEmail, subject: letter.subject, text: letter.text });
  } catch {
    // Not sent means not told: the clock does not start on a letter
    // that never arrived.
    return { sent: false, expiresAt: app.draftNoticeSentAt ? expiresAt : null };
  }
  if (!app.draftNoticeSentAt) {
    await prisma.equipApplication.update({ where: { id: app.id }, data: { draftNoticeSentAt: noticeAt } });
  }
  return { sent: true, expiresAt };
}

/**
 * Remove every draft whose two weeks since its notice are up.
 *
 * Through purgeApplication, so an uploaded pitch deck goes with the
 * row instead of sitting in the bucket with nothing pointing at it.
 * Only status "draft": one sent back for more information is in a
 * reviewer's hands, not abandoned.
 */
export async function purgeExpiredDrafts(now: Date = new Date()): Promise<{ removed: number; files: number }> {
  const cutoff = new Date(now.getTime() - DRAFT_DAYS * 86_400_000);
  const due = await prisma.equipApplication.findMany({
    where: { status: "draft", draftNoticeSentAt: { not: null, lte: cutoff } },
    select: { id: true },
  });
  let removed = 0, files = 0;
  for (const d of due) {
    try {
      const r = await purgeApplication(d.id);
      removed += 1;
      files += r.files;
    } catch { /* one stuck row must not keep the rest */ }
  }
  return { removed, files };
}
