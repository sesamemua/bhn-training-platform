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
