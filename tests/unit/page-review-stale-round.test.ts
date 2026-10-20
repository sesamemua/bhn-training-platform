import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { overlaySource } from "../../src/lib/page-review/overlay-source";

const endpoint = "https://review.test/api/public/page-review/token";
const source = overlaySource(endpoint, "October newsletter");
const parsed = ts.createSourceFile("overlay.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const functions: string[] = [];
const functionNames = ["renderComposer", "submitComment", "isLocked"];
function collect(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && functionNames.includes(node.name?.text ?? "")) functions.push(node.getText(parsed));
  ts.forEachChild(node, collect);
}
collect(parsed);
assert.equal(functions.length, functionNames.length, "exercise the generated overlay's real functions");

type ElementStub = {
  textContent: string;
  children: ElementStub[];
  click?: () => void;
  appendChild: (child: ElementStub) => void;
};
function element(text = ""): ElementStub {
  const children: ElementStub[] = [];
  return { textContent: text, children, appendChild: (child) => { children.push(child); } };
}

function harness(pageRound = 3) {
  const state = {
    review: { round: 4, status: "open" }, pageRound,
    comparison: null, comparisonRound: null as number | null, comparisonError: "",
    saving: false, error: "", draft: "A comment on the displayed version",
    selected: { anchorQuote: "Displayed headline", anchorKey: "headline", anchorPath: "h1", anchorBlock: "main" },
    replyTo: null, replyDraft: "", expandedThreads: {} as Record<string, boolean>,
  };
  const posted: Array<Record<string, unknown>> = [];
  const events = { renders: 0, reloads: 0, refreshes: 0 };
  const context = vm.createContext({
    state, endpoint, credential: "signed-viewer",
    render() { events.renders++; },
    make(_tag: string, _className: string, text: string) { return element(text); },
    addButton(label: string, _className: string, click: () => void) { return { ...element(label), click }; },
    window: { location: { reload() { events.reloads++; } } },
    loadComments: async (silent: boolean) => { assert.equal(silent, false); events.refreshes++; },
    fetch: async (url: string, options: { method: string; headers: Record<string, string>; body: string }) => {
      assert.equal(url, endpoint);
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer signed-viewer");
      posted.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ ok: true, comment: { id: "saved-comment" } }) };
    },
  });
  vm.runInContext(functions.join("\n"), context);
  return {
    state, posted, events,
    submit(parentId: string | null = null) {
      context.parentId = parentId;
      return vm.runInContext("submitComment('  Review comment  ', parentId, parentId ? null : state.selected)", context) as Promise<void>;
    },
    renderComposer() {
      const container = element();
      context.container = container;
      vm.runInContext("renderComposer(container)", context);
      return container;
    },
  };
}

for (const comparisonState of ["missing", "pending", "failed"] as const) {
  test(`stale pages cannot post new comments when comparison is ${comparisonState} and offer reload`, async () => {
    const fixture = harness();
    fixture.state.comparisonRound = comparisonState === "missing" ? null : 4;
    fixture.state.comparisonError = comparisonState === "failed" ? "Could not load comparison. Retry" : "";

    await fixture.submit();

    assert.equal(fixture.posted.length, 0, "a stale textarea cannot post into the newer round");
    assert.equal(fixture.state.saving, false);
    assert.equal(fixture.state.draft, "A comment on the displayed version", "keep the unsaved draft");
    assert.match(fixture.state.error, /Reload the current version/);
    assert.equal(fixture.events.refreshes, 0);
    const container = fixture.renderComposer();
    assert.equal(container.children.length, 1);
    assert.match(container.children[0].textContent, /new round was saved.*Reload to comment/i);
    const reload = container.children[0].children[0];
    assert.equal(reload.textContent, "Reload current version");
    assert.ok(reload.click);
    reload.click();
    assert.equal(fixture.events.reloads, 1);
  });
}

test("matching-round pages still post new anchored comments and refresh the list", async () => {
  const fixture = harness(4);
  await fixture.submit();
  assert.deepEqual(fixture.posted, [{
    body: "Review comment", parentId: null,
    anchorQuote: "Displayed headline", anchorKey: "headline", anchorPath: "h1", anchorBlock: "main",
  }]);
  assert.equal(fixture.state.error, "");
  assert.equal(fixture.state.saving, false);
  assert.equal(fixture.state.draft, "");
  assert.equal(fixture.events.refreshes, 1);
});

test("stale pages still allow replies to an existing thread without new page anchors", async () => {
  const fixture = harness();
  await fixture.submit("existing-thread");
  assert.deepEqual(fixture.posted, [{ body: "Review comment", parentId: "existing-thread" }]);
  assert.equal(fixture.state.error, "");
  assert.equal(fixture.state.expandedThreads["existing-thread"], true);
  assert.equal(fixture.events.refreshes, 1);
});
