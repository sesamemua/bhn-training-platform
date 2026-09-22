import test from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { parseFollowWidget, parseLinkedInPage } from "../../src/lib/metrics/linkedin";
import { parseTopPages, parseTotals, serviceAccountJwt } from "../../src/lib/metrics/ga4";

const post = (id: string, date: string, text: string) =>
  ({ "@type": "DiscussionForumPosting", url: `https://www.linkedin.com/posts/biohubnet_x-activity-${id}-abcd`, datePublished: date, text });

const page = `<html><body>
<p>BioHubNet · 2,305 followers</p>
<script type="application/ld+json">${JSON.stringify({ "@graph": [
  post("111", "2026-09-16T21:36:25Z", "Registration is now open for the Symposium"),
  post("222", "2026-09-08T20:30:22Z", "VentureConnect grant applications are open"),
  post("333", "2026-07-01T10:00:00Z", "An old post"),
  { "@type": "Organization", name: "BioHubNet" },
] })}</script>
<article data-activity-urn="urn:li:activity:111"><span>36 Reactions</span><span>1 Comment</span></article>
<article data-activity-urn="urn:li:activity:999"><span>50 Reactions</span></article>
<article data-activity-urn="urn:li:activity:222"><span>8 Reactions</span></article>
</body></html>`;

test("LinkedIn: followers, and the last 30 days of posts with their own reactions", () => {
  const s = parseLinkedInPage(page, new Date("2026-09-22T12:00:00Z"));
  assert.equal(s.followers, 2305);
  assert.deepEqual(s.posts.map((p) => [p.reactions, p.comments]), [[36, 1], [8, 0]]);
  assert.equal(s.posts[0].text, "Registration is now open for the Symposium");
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
