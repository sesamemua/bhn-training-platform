/**
 * Turning an email address into something two lists can be matched on.
 *
 * The registration form blocks anybody whose address is not on the
 * eligibility roster, which makes this function the difference between
 * a real applicant getting in and a real applicant emailing a
 * coordinator instead. It is deliberately generous: every rule here
 * exists because the same human writes their address differently on
 * two different days.
 *
 * It is NOT a validator. Deciding whether something is a plausible
 * address is a separate job; this only decides whether two strings mean
 * the same mailbox.
 */

/**
 * Domains that are the same institution under two names.
 *
 * UofT people are on the roster under whichever one their programme
 * asked for. Kept as an explicit table rather than a guess about
 * subdomains in general — alumni.utoronto.ca is genuinely a different
 * population from utoronto.ca and must not be folded in.
 */
const DOMAIN_ALIASES: Record<string, string> = {
  "mail.utoronto.ca": "utoronto.ca",
  "googlemail.com": "gmail.com",
};

/** Providers where a dot in the local part is not part of the address. */
const DOTLESS = new Set(["gmail.com"]);

/** Zero-width characters that survive a copy out of a web page. */
const INVISIBLE = /[​-‍﻿]/g;

/**
 * Pull the address out of whatever was pasted.
 *
 * People copy a cell out of a spreadsheet and get
 * `Jane Doe <jane@x.com>`, or a mailto:, or an address wrapped in the
 * smart quotes a spreadsheet added for them.
 */
function extract(raw: string): string {
  let s = String(raw ?? "").trim();
  s = s.replace(/^mailto:/i, "");
  const angled = s.match(/<([^>]+)>/);
  if (angled) s = angled[1];
  s = s.replace(INVISIBLE, "").replace(/^["'“”‘’\s]+|["'“”‘’\s,;]+$/g, "");
  return s.trim();
}

/**
 * The key two addresses are compared on, or null when there is no
 * usable address in the input.
 *
 * Lowercased throughout. The local part is technically case-sensitive,
 * and in practice nobody on either of these lists means a different
 * person by a different capitalisation — where the two disagree,
 * matching the human is the job.
 */
export function emailKey(raw: string): string | null {
  const s = extract(raw).toLowerCase();
  if (/\s/.test(s)) return null;

  const at = s.lastIndexOf("@");
  if (at <= 0 || at === s.length - 1) return null;

  let local = s.slice(0, at);
  let domain = s.slice(at + 1);
  if (local.includes("@")) return null;
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return null;

  domain = DOMAIN_ALIASES[domain] ?? domain;

  /*
   * Sub-addressing is stripped everywhere. jane+equip@x.com and
   * jane@x.com are the same mailbox by RFC 5233, and somebody who
   * tagged their address when applying should not be turned away for
   * it. The risk runs the safe way: it can only ever match the same
   * human to themselves.
   */
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  else if (plus === 0) return null;

  /*
   * Dots only where the provider genuinely ignores them. Doing this
   * everywhere would merge two different people at any institution
   * using first.last addressing — which is most of them.
   */
  if (DOTLESS.has(domain)) local = local.replace(/\./g, "");

  if (!local) return null;
  return `${local}@${domain}`;
}

/** True when two addresses mean the same mailbox. */
export function sameMailbox(a: string, b: string): boolean {
  const ka = emailKey(a);
  const kb = emailKey(b);
  return ka !== null && ka === kb;
}
