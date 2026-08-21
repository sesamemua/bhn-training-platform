import "server-only";

/**
 * Turning "I would like these three sessions" into seats to decide on.
 *
 * A submission is what somebody said; a booking is the thing a
 * coordinator acts on. Until this existed the two were separate systems
 * and the Capacity table stayed empty however many people registered.
 *
 * The seats start as `pending` — asking for a session is not being
 * given one, and a registration that quietly filled a room would make
 * the decision model decorative.
 */
import { prisma } from "@/lib/prisma";
import { sessionForOption } from "@/lib/training-week/schedule-2026";
import { rankedSessions } from "./submit";
import type { Answers } from "./logic";
import type { BuiltForm } from "./types";

export interface SeatsMade {
  made: number;
  /** Sessions we could not find a workshop for, named. */
  unmatched: string[];
}

/**
 * Create one pending seat per session asked for, in rank order.
 *
 * Best-effort by design: a session the schedule no longer knows about
 * is reported and skipped rather than throwing. The registration has
 * already been accepted at this point, and losing it because one option
 * string drifted would be a much worse outcome than a coordinator
 * seeing "1 session could not be matched".
 */
export async function makeSeats(
  doc: BuiltForm,
  answers: Answers,
  submissionId: string,
  userId: string | null,
): Promise<SeatsMade> {
  const wanted = rankedSessions(doc, answers);
  if (wanted.length === 0) return { made: 0, unmatched: [] };

  const slugs = wanted.map((o) => sessionForOption(o)?.slug).filter((s): s is string => !!s);
  const workshops = await prisma.workshop.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true },
  });
  const byslug = new Map(workshops.map((w) => [w.slug, w.id]));

  const unmatched: string[] = [];
  let made = 0;
  for (const [i, option] of wanted.entries()) {
    const slug = sessionForOption(option)?.slug;
    const workshopId = slug ? byslug.get(slug) : undefined;
    if (!workshopId) { unmatched.push(option); continue; }
    try {
      await prisma.workshopBooking.create({
        data: {
          workshopId,
          submissionId,
          userId,
          // 1 is their first choice. The decision model reads this when
          // a room is oversubscribed.
          rank: i + 1,
          status: "pending",
        },
      });
      made += 1;
    } catch {
      // The unique index on (workshop, submission) means a resubmit
      // does not double-book. Not an error worth failing a
      // registration over.
    }
  }
  return { made, unmatched };
}
