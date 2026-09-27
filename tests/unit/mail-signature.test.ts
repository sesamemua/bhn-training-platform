/** Every message is from BioHubNet and ends with its signature. */
import test from "node:test";
import assert from "node:assert/strict";
import { senderFrom } from "../../src/lib/mail";
import {
  cleanSignature, DEFAULT_SIGNATURE, signatureHtml, signatureProblem, withHtmlSignature, withSignature,
} from "../../src/lib/mail-signature";

test("the sender is BioHubNet whatever SMTP_FROM says", () => {
  assert.equal(senderFrom("BHN Training <info@biohubnet.ca>", "info@biohubnet.ca"), "BioHubNet <info@biohubnet.ca>");
  assert.equal(senderFrom("noreply@biohubnet.ca", "info@biohubnet.ca"), "BioHubNet <noreply@biohubnet.ca>");
  assert.equal(senderFrom(undefined, "info@biohubnet.ca"), "BioHubNet <info@biohubnet.ca>");
  assert.equal(senderFrom(undefined, undefined), "");
});

test("the default signature has the address, and the website above the email", () => {
  const lines = DEFAULT_SIGNATURE.split("\n");
  assert.equal(lines[0], "BioHubNet");
  assert.ok(lines.some((l) => l.includes("144 College Street")));
  assert.ok(lines.indexOf("https://biohubnet.ca") < lines.indexOf("info@biohubnet.ca"));
  assert.ok(lines.some((l) => l.includes("biohubnet.ca/newsletter")));
  assert.ok(lines.some((l) => l.includes("linkedin.com/company/biohubnet")));
});

test("plain text: the delimiter, then the signature as written", () => {
  const out = withSignature("Hello Ana,\n\nSee you there.\n\n", "BioHubNet\ninfo@biohubnet.ca");
  assert.equal(out, "Hello Ana,\n\nSee you there.\n\n-- \nBioHubNet\ninfo@biohubnet.ca\n");
});

test("HTML: links made clickable, anything typed escaped, placed inside <body>", () => {
  const html = signatureHtml("BioHubNet <team>\nhttps://biohubnet.ca\ninfo@biohubnet.ca");
  assert.ok(html.includes("BioHubNet &lt;team&gt;"), "what was typed is shown, not run");
  assert.ok(html.includes('<a href="https://biohubnet.ca"'));
  assert.ok(html.includes('<a href="mailto:info@biohubnet.ca"'));
  const doc = withHtmlSignature("<html><body><p>Hi</p></body></html>", "BioHubNet");
  assert.ok(doc.endsWith("</div></body></html>"));
  assert.ok(withHtmlSignature("<p>Hi</p>", "BioHubNet").startsWith("<p>Hi</p><div"));
});

test("what an admin types is tidied, and limits are said plainly", () => {
  assert.equal(cleanSignature("  BioHubNet  \r\n\n\n\ninfo@biohubnet.ca \n"), "BioHubNet\n\ninfo@biohubnet.ca");
  assert.equal(signatureProblem("BioHubNet"), null);
  assert.match(signatureProblem("   ") ?? "", /cannot be empty/);
  assert.match(signatureProblem("x".repeat(1_001)) ?? "", /under 1000/);
  assert.match(signatureProblem(Array(16).fill("line").join("\n")) ?? "", /15 lines/);
});
