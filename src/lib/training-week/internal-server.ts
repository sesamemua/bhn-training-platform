/**
 * The internal set, as the server reads it: the Internal list plus every
 * staff account.
 *
 * Staff are always internal — the rule, not a list somebody keeps in
 * step. An admin or superadmin account's address counts the moment the
 * account exists and stops counting when it goes. The list is still for
 * the rest: guests like Darius and Gilbert, and staff who register with
 * an address other than their account's (Yeseul with her Gmail).
 *
 * Demo accounts are not people: anything at a .test address is left out.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { emailKey } from "@/lib/eligibility/email-key";
import { INTERNAL_KEY, internalKeys, parseInternal, type InternalPerson } from "./internal";

export const STAFF_ROLES = ["admin", "superadmin"] as const;

export interface InternalSet {
  list: InternalPerson[];
  /** Everybody who counts, by normalised address. */
  keys: Set<string>;
  /** The staff accounts counted automatically, for the admin page to show. */
  staff: { name: string; email: string }[];
}

export async function loadInternalSet(): Promise<InternalSet> {
  const [row, staffUsers] = await Promise.all([
    prisma.platformSetting.findUnique({ where: { key: INTERNAL_KEY }, select: { value: true } }),
    prisma.user.findMany({
      where: { role: { in: [...STAFF_ROLES] } },
      select: { name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const list = parseInternal(row?.value);
  const keys = internalKeys(list);
  const staff = staffUsers
    .filter((u) => !/\.test$/i.test(u.email))
    .map((u) => ({ name: u.name?.trim() || u.email, email: u.email }));
  for (const s of staff) {
    const k = emailKey(s.email);
    if (k) keys.add(k);
  }
  return { list, keys, staff };
}
