/**
 * Who is on the board, and what is outstanding with each of them.
 *
 * Pure, like src/lib/merch/board.ts and for the same reason: the page
 * and the tests read one set of rules, so what you see and what is
 * asserted cannot drift.
 *
 * The team is everyone who can actually act on a request — instructor
 * and above, real accounts only. Trainees are not colleagues to lean on
 * for free, and demo accounts are not people.
 */
import { draftedFor, firstNameOf, initialsOf, type PickStatus } from "./picker";

/** The roles whose brains are on the menu. */
export const TEAM_ROLES = ["instructor", "admin", "superadmin"] as const;

export interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

export interface ProfileRow {
  userId: string;
  speciality: string;
  rate: string;
}

export interface PickRow {
  id: string;
  askedById: string;
  askedOfId: string;
  subject: string;
  body: string;
  href: string | null;
  kind: string;
  status: string;
  probe: string | null;
  bribe: string;
  answer: string | null;
  answeredAt: Date | null;
  createdAt: Date;
}

export interface Colleague {
  id: string;
  name: string;
  firstName: string;
  email: string;
  initials: string;
  speciality: string;
  rate: string;
  /** False when nobody has edited it — the card says so rather than pretending. */
  specialityIsGuess: boolean;
  /** How many times the person looking has picked this brain. */
  pickedByYou: number;
  /** Of those, how many came back. */
  answeredForYou: number;
  /** Their open asks from you. */
  openFromYou: number;
  /** Whether this is the person looking at the page. */
  isYou: boolean;
}

const asStatus = (s: string): PickStatus =>
  s === "answered" || s === "declined" ? s : "open";

/**
 * The team, each with what you personally have asked of them.
 *
 * Deliberately per-viewer: a shared count would say "this brain has been
 * picked 14 times" without saying by whom, and the number that makes the
 * point is your own.
 */
export function buildTeam(
  users: UserRow[],
  profiles: ProfileRow[],
  picks: PickRow[],
  viewerId: string,
): Colleague[] {
  const byUser = new Map(profiles.map((p) => [p.userId, p]));
  const mine = picks.filter((p) => p.askedById === viewerId);

  return users
    .map((u) => {
      const profile = byUser.get(u.id);
      const drafted = draftedFor(u.email);
      const forThem = mine.filter((p) => p.askedOfId === u.id);
      const name = u.name?.trim() || u.email;
      return {
        id: u.id,
        name,
        firstName: firstNameOf(u.name, name),
        email: u.email,
        initials: initialsOf(u.name, u.email),
        speciality: profile?.speciality ?? drafted.speciality,
        rate: profile?.rate ?? drafted.rate,
        specialityIsGuess: !profile,
        pickedByYou: forThem.length,
        answeredForYou: forThem.filter((p) => asStatus(p.status) === "answered").length,
        openFromYou: forThem.filter((p) => asStatus(p.status) === "open").length,
        isYou: u.id === viewerId,
      };
    })
    // You first — the page is about your behaviour, so your own card is
    // where the reciprocity line lands.
    .sort((a, b) => Number(b.isYou) - Number(a.isYou) || a.name.localeCompare(b.name));
}

/** Everyone whose brain you could pick: the team, minus yourself. */
export function pickable(team: Colleague[]): Colleague[] {
  return team.filter((c) => !c.isYou);
}

export interface AskerTotals {
  sent: number;
  promised: number;
  delivered: number;
  received: number;
}

/**
 * Your own numbers. `delivered` is 0 by construction — nothing in this
 * feature can record buying somebody a coffee, and pretending otherwise
 * would make the one honest number on the page a lie.
 */
export function askerTotals(picks: PickRow[], viewerId: string, nothing: string): AskerTotals {
  const sent = picks.filter((p) => p.askedById === viewerId);
  return {
    sent: sent.length,
    promised: sent.filter((p) => p.bribe.trim().toLowerCase() !== nothing).length,
    delivered: 0,
    received: picks.filter((p) => p.askedOfId === viewerId).length,
  };
}

/** Open asks you are waiting on, newest first. */
export function outstanding(picks: PickRow[], viewerId: string): PickRow[] {
  return picks
    .filter((p) => p.askedById === viewerId && asStatus(p.status) === "open")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Asks pointed at you — the ones the sidebar badge counts. */
export function waitingOnYou(picks: PickRow[], viewerId: string): PickRow[] {
  return picks
    .filter((p) => p.askedOfId === viewerId && asStatus(p.status) === "open")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
