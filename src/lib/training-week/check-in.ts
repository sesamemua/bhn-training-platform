/**
 * Training Week check-in: what the door says about a person.
 *
 * Each registrant carries one pass (a QR). Staff at a door pick the
 * session they are running; a scan — or a click on the laptop list —
 * asks one question: does this person have a seat in THIS session, and
 * may they come in? The answer is one of a handful of cases, each with
 * a colour and a sentence, decided here so the phone and the laptop can
 * never disagree about who gets in.
 *
 * The rules, as agreed:
 *   - approved             → in, checked in on the spot
 *   - waitlisted / undecided → in only if the room still has space
 *                              (checked in < capacity); staff press "Let in"
 *   - declined              → not in
 *   - no seat this session  → not in; the card says which sessions they
 *                              do have, so they can be pointed the right way
 *   - already checked in    → said, with the time, and nothing recorded twice
 *
 * Pure module: no Prisma, no React.
 */

/** What a pass's QR holds. The prefix stops a stray QR from being read as ours. */
export const PASS_PREFIX = "BHNTW:";

export const passQrContent = (token: string) => `${PASS_PREFIX}${token}`;

/**
 * The token in whatever the camera read — our QR, the pass page's own
 * URL, or a token typed in by hand. Null for anything else.
 */
export function tokenFromScan(raw: string): string | null {
  const s = raw.trim();
  const fromPrefix = s.startsWith(PASS_PREFIX) ? s.slice(PASS_PREFIX.length) : null;
  const fromUrl = s.match(/\/training-week\/pass\/([A-Za-z0-9_-]{16,})/)?.[1] ?? null;
  const bare = /^[A-Za-z0-9_-]{16,64}$/.test(s) ? s : null;
  const t = fromPrefix ?? fromUrl ?? bare;
  return t && /^[A-Za-z0-9_-]{16,64}$/.test(t) ? t : null;
}

export type DoorVerdict =
  | "checked_in"       // just checked in
  | "already"          // checked in before
  | "can_let_in"       // waitlisted/undecided, room has space
  | "full"             // waitlisted/undecided, room is full
  | "declined"         // declined for this session
  | "not_this_session" // registered, but no seat in this session
  | "unknown";         // the code matches nobody

export interface SeatFacts {
  /** pending | confirmed | waitlist | cancelled — or null when they have no seat here. */
  status: string | null;
  checkedInAt: string | null;
}

export interface RoomFacts {
  capacity: number;
  checkedIn: number;
}

/**
 * What the door does with this person, BEFORE anything is recorded.
 * "checked_in" here means "check them in now"; the caller records it
 * and reports it.
 */
export function doorVerdict(seat: SeatFacts | null, room: RoomFacts): DoorVerdict {
  if (!seat || !seat.status) return "not_this_session";
  if (seat.checkedInAt) return "already";
  if (seat.status === "confirmed") return "checked_in";
  if (seat.status === "cancelled") return "declined";
  // Waitlisted, or never decided: in if there is a chair for them.
  return hasSpace(room) ? "can_let_in" : "full";
}

/** A room with no capacity set is treated as having space: nobody said otherwise. */
export const hasSpace = (room: RoomFacts) => room.capacity <= 0 || room.checkedIn < room.capacity;

/** Colour and words for a verdict, the same on the phone and the laptop. */
export const VERDICT_COPY: Record<DoorVerdict, { tone: "green" | "amber" | "red" | "grey"; title: string }> = {
  checked_in: { tone: "green", title: "Checked in" },
  already: { tone: "grey", title: "Already checked in" },
  can_let_in: { tone: "amber", title: "Waitlisted — there is space" },
  full: { tone: "red", title: "Waitlisted — the room is full" },
  declined: { tone: "red", title: "No place in this session" },
  not_this_session: { tone: "red", title: "Not registered for this session" },
  unknown: { tone: "red", title: "Pass not recognised" },
};

export interface SessionWindow {
  id: string;
  start: string;
  end: string;
}

/**
 * The session a door is most likely running at `now`: one in progress,
 * else the next to start today, else the one that ended most recently.
 * A default only — staff can always pick another.
 */
export function sessionNow(sessions: SessionWindow[], now: Date = new Date()): string | null {
  if (sessions.length === 0) return null;
  const t = now.getTime();
  const at = (s: string) => new Date(s).getTime();
  // Doors open before a session starts; count the half hour before it as "now".
  const EARLY = 45 * 60_000;
  const running = sessions.filter((s) => at(s.start) - EARLY <= t && t <= at(s.end));
  if (running.length > 0) return running.sort((a, b) => at(a.start) - at(b.start))[0].id;
  const upcoming = sessions.filter((s) => at(s.start) > t).sort((a, b) => at(a.start) - at(b.start));
  if (upcoming.length > 0) return upcoming[0].id;
  return [...sessions].sort((a, b) => at(b.end) - at(a.end))[0].id;
}

/* ── "I can't make it" ──────────────────────────────────────────── */

/** A reason has to be a reason: a couple of sentences, not "busy". */
export const WITHDRAW_MIN_CHARS = 40;
export const WITHDRAW_MAX_CHARS = 2000;

/** Why a reason cannot be accepted yet, or null when it can. */
export function withdrawProblem(raw: string): string | null {
  const r = raw.trim();
  if (r.length === 0) return "Please tell us why you can't make it.";
  if (r.length < WITHDRAW_MIN_CHARS) {
    return `Please say a little more — at least ${WITHDRAW_MIN_CHARS} characters (${WITHDRAW_MIN_CHARS - r.length} to go).`;
  }
  if (r.length > WITHDRAW_MAX_CHARS) return `Please keep it under ${WITHDRAW_MAX_CHARS} characters.`;
  return null;
}

/**
 * Said wherever somebody might decide not to come: on the pass, on the
 * "I can't make it" page and in the letters. Not a threat — the point is
 * that telling us is always fine, and silence is what costs.
 */
export const NO_SHOW_NOTE =
  "Please tell us if you can't come. A no-show without a valid reason may affect your eligibility for future BioHubNet training and programmes.";
