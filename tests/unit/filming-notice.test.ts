/** The door notice escapes what was typed and keeps line breaks. */
import test from "node:test";
import assert from "node:assert/strict";
import { noticeHtml } from "../../src/lib/video/filming-notice";

test("typed text is escaped, line breaks kept, printing only when asked", () => {
  const html = noticeHtml({ headline: "Quiet <please>", subhead: "Filming", when: "8:30", where: "Atrium", message: "Line one\nLine two", thanks: "Thanks", logoUrl: "https://x/logo.png" });
  assert.ok(html.includes("Quiet &lt;please&gt;"));
  assert.ok(html.includes("Line one<br>Line two"));
  assert.ok(!html.includes("window.print"));
  assert.ok(noticeHtml({ headline: "", subhead: "", when: "", where: "", message: "", thanks: "", logoUrl: "" }, { print: true }).includes("window.print"));
});

test("saved signs: edits laid over the built-in ones, custom ones after, junk dropped", async () => {
  const { mergeSigns, parseSigns } = await import("../../src/lib/video/filming-notice");
  const f = { subhead: "", headline: "Quiet please", when: "", where: "", message: "", thanks: "", writeIn: "" };
  const builtIn = [{ id: "quiet", label: "Quiet please", custom: false, kind: "sign" as const, fields: f }];
  const saved = parseSigns(JSON.stringify([
    { id: "quiet", label: "Quiet please", custom: false, fields: { ...f, headline: "Shh" } },
    { id: "c1", label: "Parking", custom: true, fields: { ...f, headline: "No parking" } },
    { id: "", label: "", custom: true, fields: f },
  ]));
  assert.deepEqual(mergeSigns(builtIn, saved).map((s) => s.fields.headline), ["Shh", "No parking"]);
  assert.deepEqual(parseSigns("nope"), []);
});

test("the release form and the write-in line", async () => {
  const { printableHtml } = await import("../../src/lib/video/filming-notice");
  const n = { headline: "Release", subhead: "Promo", when: "", where: "", message: "I agree", thanks: "Ask us", logoUrl: "/l.png" };
  assert.ok(printableHtml("release", n).includes("Parent or guardian"));
  assert.ok(printableHtml("sign", { ...n, writeIn: "Call or text:" }).includes("Call or text:"));
  assert.ok(!printableHtml("sign", n).includes('class="writein"'));
});
