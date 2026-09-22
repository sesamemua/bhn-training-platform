import test from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { activityDate, parseFollowWidget, parseLinkedInPage } from "../../src/lib/metrics/linkedin";
import { parseTopPages, parseTotals, serviceAccountJwt } from "../../src/lib/metrics/ga4";

/** An activity id for a moment: LinkedIn puts the millisecond timestamp in the top bits. */
const idAt = (iso: string) => (BigInt(Date.parse(iso)) * BigInt(4194304)).toString();
const card = (iso: string, text: string, social: string, repost = false) =>
  `<article data-activity-urn="urn:li:activity:${idAt(iso)}">${repost ? "<span>BioHubNet reposted this</span>" : ""}` +
  `<p data-test-id="main-feed-activity-card__commentary" dir="ltr">${text}</p>${social}</article>`;

// No structured posts at all — the copy LinkedIn sends cloud servers.
const page = `<html><body><p>BioHubNet · 2,305 followers</p>
${card("2026-09-16T21:36:25Z", "Registration is now open for the <b>Symposium</b> &amp; Training Week", "<span>36 Reactions</span><span>1 Comment</span>")}
${card("2026-09-17T14:19:00Z", "Someone else's post", "<span>50 Reactions</span>", true)}
${card("2026-09-08T20:30:22Z", "VentureConnect grant applications are open", "<span>8 Reactions</span>")}
${card("2026-07-01T10:00:00Z", "An old post", "<span>3 Reactions</span>")}
</body></html>`;

test("LinkedIn: followers, and the last 30 days of the page's own posts, from the cards alone", () => {
  const s = parseLinkedInPage(page, new Date("2026-09-22T12:00:00Z"));
  assert.equal(s.followers, 2305);
  assert.deepEqual(s.posts.map((p) => [p.reactions, p.comments]), [[36, 1], [8, 0]]);
  assert.equal(s.posts[0].text, "Registration is now open for the Symposium & Training Week");
  assert.equal(s.posts[0].published.slice(0, 16), "2026-09-16T21:36");
  assert.equal(activityDate("7507866972420833281").toISOString().slice(0, 16), "2026-09-21T18:22");
  assert.equal(parseFollowWidget('<div class="follower-count">2,305\n</div>'), 2305);
  assert.equal(parseFollowWidget("<html>sign in</html>"), null);
});

test("GA4: totals per date range and top pages, whichever order Google returns them in", () => {
  const totals = parseTotals({ rows: [
    { dimensionValues: [{ value: "date_range_1" }], metricValues: [{ value: "90" }, { value: "120" }, { value: "300" }] },
    { dimensionValues: [{ value: "date_range_0" }], metricValues: [{ value: "110" }, { value: "150" }, { value: "420" }] },
  ] });
  assert.deepEqual(totals, { current: { users: 110, sessions: 150, views: 420 }, previous: { users: 90, sessions: 120, views: 300 } });
  assert.deepEqual(parseTotals({}).current, { users: 0, sessions: 0, views: 0 });
  assert.deepEqual(parseTopPages({ rows: [{ dimensionValues: [{ value: "/2026-annual-symposium/" }], metricValues: [{ value: "87" }] }] }), [
    { path: "/2026-annual-symposium/", views: 87 },
  ]);
});

test("GA4: the service-account token request is signed with the key and asks for read-only access", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwt = serviceAccountJwt({ client_email: "dash@bhn.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() }, 1_790_000_000);
  const [head, claim, signature] = jwt.split(".");
  assert.ok(createVerify("RSA-SHA256").update(`${head}.${claim}`).verify(publicKey, signature, "base64url"));
  const c = JSON.parse(Buffer.from(claim, "base64url").toString());
  assert.equal(c.scope, "https://www.googleapis.com/auth/analytics.readonly");
  assert.equal(c.exp - c.iat, 3600);
});
