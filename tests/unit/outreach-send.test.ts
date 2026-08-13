import assert from "node:assert/strict";
import test from "node:test";
import {
  SEND_BATCH_MAX,
  caslFooter,
  checkRecipient,
  composeBody,
  unsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
} from "../../src/lib/outreach/send";

const withSecret = async (fn: () => void | Promise<void>) => {
  const prev = process.env.NEXTAUTH_SECRET;
  process.env.NEXTAUTH_SECRET = "outreach-unit-test-secret-32-characters";
  try {
    await fn();
  } finally {
    if (prev === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = prev;
  }
};

test("a contact is only emailable with a valid address, no opt-out, and no prior send", () => {
  assert.equal(
    checkRecipient({ email: "a@b.ca", unsubscribedAt: null, alreadySent: false }).ok,
    true,
  );

  // Skips, not failures — a working directory is full of placeholder rows.
  assert.equal(
    checkRecipient({ email: "", unsubscribedAt: null, alreadySent: false }).reason,
    "no-address",
  );
  assert.equal(
    checkRecipient({ email: "not-an-address", unsubscribedAt: null, alreadySent: false }).reason,
    "bad-address",
  );
  assert.equal(
    checkRecipient({ email: "a@b.ca", unsubscribedAt: new Date(), alreadySent: false }).reason,
    "unsubscribed",
  );
  assert.equal(
    checkRecipient({ email: "a@b.ca", unsubscribedAt: null, alreadySent: true }).reason,
    "already-sent",
  );
});

test("an opt-out outranks everything else about a contact", () => {
  // Even a perfectly valid, never-contacted address must not be emailed.
  const v = checkRecipient({ email: "partner@utoronto.ca", unsubscribedAt: new Date(), alreadySent: false });
  assert.equal(v.ok, false);
  assert.equal(v.reason, "unsubscribed");
});

test("unsubscribe links are unguessable, per-person, and reject tampering", async () => {
  await withSecret(() => {
    const a = unsubscribeToken("person-a");
    const b = unsubscribeToken("person-b");
    assert.notEqual(a, b, "one link must not opt out a different contact");

    assert.equal(verifyUnsubscribeToken("person-a", a), true);
    assert.equal(verifyUnsubscribeToken("person-b", a), false, "token must not transfer between people");
    assert.equal(verifyUnsubscribeToken("person-a", "forged"), false);
    assert.equal(verifyUnsubscribeToken("person-a", ""), false);

    const url = unsubscribeUrl("https://app.biohubnet.ca/", "person-a");
    assert.equal(url, `https://app.biohubnet.ca/outreach/unsubscribe/person-a/${a}`);
  });
});

test("every sent message carries the CASL sender block and a working unsubscribe", async () => {
  await withSecret(() => {
    const link = unsubscribeUrl("https://app.biohubnet.ca", "person-a");
    const text = composeBody("Hello there.\n\nWould you like to partner?", link);

    assert.match(text, /Hello there\./);
    // Identification and mailing address are required by CASL s.6(2).
    assert.match(text, /BioHubNet \(Biomanufacturing Hub Network\)/);
    assert.match(text, /Toronto, ON M5S 1A1/);
    assert.match(text, /info@biohubnet\.ca/);
    // And a functioning unsubscribe.
    assert.ok(text.includes(link), "the unsubscribe link must appear verbatim");
    assert.match(text, /unsubscribe/i);
  });
});

test("the footer cannot be omitted by an empty template", async () => {
  await withSecret(() => {
    const link = unsubscribeUrl("https://app.biohubnet.ca", "p");
    assert.match(composeBody("", link), /Biomanufacturing Hub Network/);
    assert.match(caslFooter(link), /unsubscribe/i);
  });
});

test("a batch is bounded so it cannot outrun the function timeout", () => {
  assert.ok(SEND_BATCH_MAX > 0 && SEND_BATCH_MAX <= 50, `unexpected batch cap ${SEND_BATCH_MAX}`);
});
