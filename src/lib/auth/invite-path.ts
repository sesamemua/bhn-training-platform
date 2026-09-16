/**
 * Recognises a company-invite return path. Import-free on purpose: the
 * login page (a client component) needs it too, and ./registration pulls
 * in next/server.
 */

/**
 * The company-invite token inside a `/invite/<token>` return path, or
 * null. The invite page sends new teammates to
 * /register?callbackUrl=/invite/<token>, so this is how /register knows
 * the visitor was invited. Tokens are 64 hex characters.
 *
 * A query or fragment on the path is ignored: campaignAuthUrl() copies
 * utm_* / gclid into callbackUrl, and a tracked link must not turn a
 * real invitee away. The path itself still has to be exactly
 * /invite/<token> on this site.
 */
export function inviteTokenFromPath(path: string | null | undefined): string | null {
  const pathname = (path ?? "").split(/[?#]/, 1)[0];
  const match = /^\/invite\/([a-f0-9]{16,128})\/?$/i.exec(pathname);
  return match ? match[1] : null;
}
