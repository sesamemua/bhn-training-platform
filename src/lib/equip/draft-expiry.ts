/**
 * Unsubmitted public drafts: the link, the two weeks, and the letter.
 *
 * A public EQUIP application has no account behind it. The only way
 * back into a draft is its link — and until now that link lived only in
 * the browser tab it was started in. Close the tab, switch computers,
 * and the draft was gone; the data shows people starting over, some
 * from a draft that was one field from finished.
 *
 * So the link is emailed the moment a draft is started, with a plain
 * deadline: two weeks from that email to submit, after which the draft
 * is removed. The deadline is counted from the EMAIL, never from when
 * the draft was started — a draft whose owner was never told is never
 * removed, because nobody made them that promise.
 *
 * Pure module: no Prisma, no mailer.
 */

export const DRAFT_DAYS = 14;
const DAY_MS = 86_400_000;

/** When a draft told on `noticeSentAt` is removed. */
export function draftExpiresAt(noticeSentAt: Date | string): Date {
  return new Date(new Date(noticeSentAt).getTime() + DRAFT_DAYS * DAY_MS);
}

/** Only an unsubmitted draft that was told, and whose two weeks are up. */
export function isExpiredDraft(
  app: { status: string; draftNoticeSentAt: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (app.status !== "draft" || !app.draftNoticeSentAt) return false;
  return draftExpiresAt(app.draftNoticeSentAt).getTime() <= now.getTime();
}

/** The page a public draft lives on, per stream. */
export function draftPath(stream: string, token: string): string {
  const base = stream === "innovation_fellowship" ? "/apply/innovation-fellowship" : "/apply/venture-connect";
  return `${base}/${token}`;
}

export const STREAM_NAME: Record<string, string> = {
  venture_connect: "VentureConnect",
  innovation_fellowship: "Innovation Fellowship",
  venture_lift: "VentureLift",
};

/** "Sunday 11 October", Toronto time — the way a deadline is said aloud. */
export function deadlineWords(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", weekday: "long", day: "numeric", month: "long",
  }).format(d);
}

/**
 * The letter with the link in it.
 *
 * Says the one thing people did not know — this link is the only way
 * back — then the date, then what happens after it. No threat in the
 * tone: most people who see it will finish, and the deadline is there
 * so a draft abandoned in September is not sitting in the system in
 * March holding somebody's pitch deck.
 */
export function draftLinkLetter(opts: {
  name: string;
  stream: string;
  link: string;
  expiresAt: Date;
}): { subject: string; text: string } {
  const program = STREAM_NAME[opts.stream] ?? "EQUIP";
  const first = opts.name.trim().split(/\s+/)[0] || "there";
  const by = deadlineWords(opts.expiresAt);
  return {
    subject: `Your ${program} application — the link to come back to it`,
    text:
      `Hello ${first},\n\n` +
      `You have started a ${program} application. This link is the only way back into it, so keep this email:\n\n` +
      `${opts.link}\n\n` +
      `Your answers save as you go. Open the link on any device to pick up where you left off.\n\n` +
      `Please submit by ${by}. Applications that have not been submitted by then are removed, ` +
      `along with anything uploaded to them — after that you would need to start a new one.\n\n` +
      `If you did not start this application, you can ignore this email; the draft will be removed on its own.\n\n` +
      `The BioHubNet team`,
  };
}
