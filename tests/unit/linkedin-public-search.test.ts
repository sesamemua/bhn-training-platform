import assert from "node:assert/strict";
import { test } from "node:test";
import { changeLinkedinBoard, LinkedinInput } from "../../src/lib/events/linkedin";
import { linkedinSearchEntries, searchLinkedinPublicPosts } from "../../src/lib/events/linkedin-public-search";

const now = "2026-11-16T13:00:00.000Z";
const board = { entries: [], checkedAt: "2026-11-10T15:00:00.000Z", coverage: "Manual scan only." };
const ken = {
  author: "Ken Hughes", title: "Visiting Microbix during BioHubNet Training Week",
  url: "https://www.linkedin.com/posts/ken-hughes_microbix-activity-7526007899060391936-WKA0",
};
const company = {
  title: "BioHubNet Training Week at Microbix | BioHubNet",
  url: "https://ca.linkedin.com/posts/biohubnet_tour-activity-7525972587873673216-Abc1",
};

test("public search keeps only relevant direct posts and drafts replies for external authors", () => {
  const search = linkedinSearchEntries(JSON.stringify({ results: [
    ken, company,
    { ...ken, url: "https://www.linkedin.com/in/ken-hughes/" },
    { ...ken, url: ken.url.replace("linkedin.com", "linkedin.com.example.org") },
    { ...ken, title: "Training Week and innovation at a different company" },
    { ...ken, title: "BioHubNet at a different conference" },
  ] }));
  assert.deepEqual(search.map(entry => [entry.author, entry.status, entry.topic]), [
    ["Ken Hughes", "pending", "training_week"], ["BioHubNet", "no_reply", "training_week"],
  ]);
  assert.match(search[0].sourceUrl, /\/feed\/update\/urn:li:activity:7526007899060391936\/$/);
  assert.match(search[0].reply, /Microbix/);
  assert.equal(search[1].reply, "");
});

test("daily search recognizes share and activity aliases and never replaces a saved draft", () => {
  const existing = LinkedinInput.parse({
    sourceUrl: "https://www.linkedin.com/feed/update/urn:li:ugcPost:7526007898393710593/",
    author: "Ken Hughes", kind: "repost", topic: "training_week", sourceText: "Manually verified.", reply: "Colleague draft.", status: "replied",
  });
  const previous = changeLinkedinBoard(board, { action: "add", entry: existing }, "Admin", board.checkedAt);
  const entries = linkedinSearchEntries(JSON.stringify({ results: [ken, company, company] }));
  const saved = changeLinkedinBoard(previous, { action: "public_search", entries }, "Daily search", now);
  assert.equal(saved.entries.length, 2);
  assert.equal(saved.entries[0].author, "BioHubNet");
  assert.deepEqual(saved.entries[1], previous.entries[0]);
  assert.equal(saved.coverage, board.coverage);
  assert.equal(saved.checkedAt, board.checkedAt);
  assert.equal(saved.publicSearchAt, now);
});

test("the search client requests the event window and parses the provider's SSE result", async t => {
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.match(url, /mcp\.exa\.ai/);
    const { params } = JSON.parse(options.body as string);
    assert.equal(params.name, "web_search_advanced_exa");
    assert.deepEqual(params.arguments.includeDomains, ["linkedin.com"]);
    assert.equal(params.arguments.startPublishedDate, "2026-10-26");
    const envelope = { result: { content: [{ type: "text", text: JSON.stringify({ results: [ken] }) }] } };
    return new Response(`event: message\ndata: ${JSON.stringify(envelope)}\n\n`, { headers: { "Content-Type": "text/event-stream" } });
  });
  assert.equal((await searchLinkedinPublicPosts(new Date(now)))[0].author, "Ken Hughes");
});
