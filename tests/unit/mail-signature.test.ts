/** Every message is from BioHubNet and ends with its signature. */
import test from "node:test";
import assert from "node:assert/strict";
import { senderFrom, SIGNATURE_LINKS, withHtmlSignature, withSignature } from "../../src/lib/mail";

test("the sender is BioHubNet whatever SMTP_FROM says", () => {
  assert.equal(senderFrom("BHN Training <info@biohubnet.ca>", "info@biohubnet.ca"), "BioHubNet <info@biohubnet.ca>");
  assert.equal(senderFrom("noreply@biohubnet.ca", "info@biohubnet.ca"), "BioHubNet <noreply@biohubnet.ca>");
  assert.equal(senderFrom(undefined, "info@biohubnet.ca"), "BioHubNet <info@biohubnet.ca>");
  assert.equal(senderFrom(undefined, undefined), "");
});

test("the plain-text signature carries the address, newsletter and LinkedIn", () => {
  const out = withSignature("Hello Ana,\n\nSee you there.\n\n");
  assert.match(out, /See you there\.\n\n-- \nBioHubNet\ninfo@biohubnet\.ca\n/);
  assert.ok(out.includes(SIGNATURE_LINKS.newsletter));
  assert.ok(out.includes(SIGNATURE_LINKS.linkedin));
});

test("an HTML document takes the signature inside its body", () => {
  const doc = withHtmlSignature("<html><body><p>Hi</p></body></html>");
  assert.ok(doc.endsWith("</div></body></html>"));
  assert.ok(doc.includes(SIGNATURE_LINKS.newsletter));
  // A fragment just gets it on the end.
  assert.ok(withHtmlSignature("<p>Hi</p>").startsWith("<p>Hi</p><div"));
});
