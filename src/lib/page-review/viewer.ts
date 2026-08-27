import { jwtVerify, SignJWT } from "jose";

const ISSUER = "bhn-training-platform";
const AUDIENCE = "page-review";

export interface PageReviewViewer {
  reviewId: string;
  /** The platform account, or "" for somebody who arrived on the link. */
  userId: string;
  name: string;
  /**
   * user  — signed in to the platform.
   * anon  — came in on the share link and typed a name.
   *
   * Carried in the token because it decides how the comment is stored,
   * and the comment route must not be able to be told otherwise by
   * whoever is holding the token.
   */
  kind: "user" | "anon";
}

function secret() {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("NEXTAUTH_SECRET is not configured.");
  return new TextEncoder().encode(value);
}

function cleanName(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "Team member";
}

export async function createPageReviewViewerToken(
  viewer: Omit<PageReviewViewer, "kind"> & { kind?: "user" | "anon" },
) {
  const kind = viewer.kind ?? "user";
  return new SignJWT({ reviewId: viewer.reviewId, name: cleanName(viewer.name), kind })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(viewer.userId || "anon")
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    // Shorter for somebody on a share link than for an account holder:
    // the link may be forwarded, and a day is long enough to read a
    // page and say what is wrong with it.
    .setExpirationTime(kind === "anon" ? "24h" : "12h")
    .sign(secret());
}

/**
 * A pass for somebody who has the share link and no account.
 *
 * The share token is what authorises this — it is the thing the
 * schema has always said "lets colleagues comment without a platform
 * account", and until now nothing minted the pass that would let them.
 */
export async function createAnonViewerToken(reviewId: string, name: string) {
  return createPageReviewViewerToken({ reviewId, userId: "", name, kind: "anon" });
}

export async function verifyPageReviewViewerToken(
  token: string,
  reviewId: string,
): Promise<PageReviewViewer | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (
      payload.reviewId !== reviewId ||
      typeof payload.sub !== "string" ||
      typeof payload.name !== "string"
    ) {
      return null;
    }
    const kind = payload.kind === "anon" ? "anon" : "user";
    return {
      reviewId,
      userId: kind === "anon" ? "" : payload.sub,
      name: cleanName(payload.name),
      kind,
    };
  } catch {
    return null;
  }
}
