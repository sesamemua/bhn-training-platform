/**
 * Routine social posts, generated from the platform's own facts.
 *
 * The reason this lives in the platform rather than in a chat window:
 * the deadline in the post and the deadline in the database are the
 * same fact. Extend a VentureConnect window and every unsent reminder
 * moves with it, because none of them has a date typed into it.
 *
 * Nothing here publishes anything. A post is drafted, a person approves
 * it, and only then can it go out — the same rule EQUIP decision emails
 * follow, and for the same reason: an automatic message about somebody's
 * funding is not a message anybody chose to send.
 *
 * Pure module: no Prisma, no I/O, no clock reads. Everything that needs
 * "now" takes it as an argument, so the planner can be tested against a
 * fixed date instead of whatever day the suite runs on.
 */

export const SOCIAL_STREAMS = ["venture_connect"] as const;
export type SocialStream = (typeof SOCIAL_STREAMS)[number];

/**
 * What a post is FOR.
 *
 *   launch     — the window is open, here is what it funds
 *   reminder   — n days left, one per rung of the ladder below
 *   recipients — who was funded this cycle
 */
export const SOCIAL_KINDS = ["launch", "reminder", "recipients"] as const;
export type SocialKind = (typeof SOCIAL_KINDS)[number];

/**
 * Where a post is in its life.
 *
 * `skipped` exists so a coordinator can decline a post without it being
 * regenerated on the next run. Deleting it would just come back.
 */
export const SOCIAL_STATUSES = ["draft", "approved", "scheduled", "published", "skipped"] as const;
export type SocialStatus = (typeof SOCIAL_STATUSES)[number];

/** A post that has left the building cannot be edited or regenerated. */
export const TERMINAL_STATUSES: readonly SocialStatus[] = ["published", "skipped"];

/**
 * The reminder ladder, in days before the deadline.
 *
 * Four rungs, thinning as the date approaches — a fortnight out is a
 * "plan your application" post, the closing day is a different message
 * entirely. Zero is the deadline itself.
 *
 * Changing this list changes which posts exist. Rungs already drafted
 * for a cycle are left alone; only missing ones are created, so
 * shortening the ladder never deletes something a person has edited.
 */
export const REMINDER_LADDER = [14, 7, 2, 0] as const;
export type ReminderRung = (typeof REMINDER_LADDER)[number];

/**
 * The facts a VentureConnect post is written from.
 *
 * Assembled from EquipDeadline and, for a recipients post, the funded
 * applications. Passed in rather than queried so the copy and the asset
 * spec are pure functions of the data — which is what makes them
 * testable and what stops two posts about one cycle disagreeing.
 */
export interface CycleFacts {
  stream: SocialStream;
  /** EquipDeadline id — the cycle this post belongs to. */
  deadlineId: string;
  /** "October 2026", or the date if the cycle was never labelled. */
  cycleLabel: string;
  /** The deadline as it stands NOW, extensions included. */
  deadlineAt: Date;
  /** What it was when the window opened, if it has since moved. */
  originalDeadlineAt: Date;
  /** Maximum award, in whole dollars. */
  maxAward: number;
  /** Where to apply. Path only; the origin is added at render time. */
  applyPath: string;
}

/** One funded venture, for a recipients post. */
export interface Recipient {
  /** The person, as they gave their name. */
  name: string;
  /** Their venture or project. */
  venture: string;
  /** What they were awarded. Omitted from copy when the cycle chooses
   *  not to publish amounts. */
  amount: number | null;
}

/**
 * The contract with the image renderer.
 *
 * A SEPARATE AGENT builds the renderer. This shape is the whole
 * interface between us, so it is deliberately boring: no database ids,
 * no internal enums beyond the template name, nothing that requires
 * reading this codebase to understand. A renderer should be able to
 * satisfy it from the JSON alone.
 *
 * `version` is here so the renderer can refuse a spec it does not
 * understand rather than drawing something wrong. Bump it when a
 * template's required fields change; never repurpose a field.
 *
 * What it must NOT carry: application ids, applicant email addresses,
 * anything about an applicant who has not consented to be named, and
 * any copy that is not also visible in the post body. An image is
 * harder to retract than a sentence.
 */
export interface AssetSpec {
  version: 1;
  /** Which layout to draw. One per post kind, so far. */
  template: "vc-launch" | "vc-reminder" | "vc-recipients";
  /** The one line that carries the post. Short enough to set large. */
  headline: string;
  /** A supporting line. May be empty. */
  subhead: string;
  /** Bottom-corner detail — a date, a count, a deadline. */
  footnote: string;
  /** Names to set as a list. Empty for launch and reminder. */
  names: { name: string; detail: string }[];
  /** Suggested output sizes, longest edge first. */
  sizes: ("square" | "portrait" | "landscape")[];
}

/** The identity of a post within a cycle — what makes it unique. */
export interface PostKey {
  stream: SocialStream;
  kind: SocialKind;
  deadlineId: string;
  /** Only meaningful for reminders; 0 for the other kinds. */
  daysBefore: number;
}

/**
 * One string that identifies a post, for the unique index.
 *
 * The materialiser runs daily and must never create a second copy of a
 * post somebody has already edited. A composite key in the database is
 * the only thing that makes that guaranteed rather than likely.
 */
export function postKey(k: PostKey): string {
  return `${k.stream}:${k.kind}:${k.deadlineId}:${k.daysBefore}`;
}
