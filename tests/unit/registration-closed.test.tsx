import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import {
  REGISTRATION_CLOSED_ERROR,
  inviteAllowsRegistration,
  inviteTokenFromPath,
  isRegistrationOpen,
  registrationClosedResponse,
} from "../../src/lib/auth/registration";
import { inviteTokenFromPath as clientInviteTokenFromPath } from "../../src/lib/auth/invite-path";
// Type-only: the gate module pulls in lib/prisma, so its code is loaded
// dynamically below, after the Prisma stand-in is installed.
import type { RegistrationGateDeps } from "../../src/lib/auth/registration-gate";
import { campaignAuthUrl } from "../../src/lib/campaign/attribution";
import { traineeWelcomeBody } from "../../src/components/admin/AccessRequestsClient";
import { RegistrationClosed } from "../../src/components/auth/RegistrationClosed";
import { RegistrationStatusProvider, useRegistrationOpen } from "../../src/components/auth/RegistrationStatus";

/**
 * Public sign-up is closed by default. Three promises are tested here:
 * the switch only opens on purpose, a closed endpoint turns people away
 * before it touches the database (or, for LTI, before it creates anyone),
 * and the pages say so instead of offering sign-up — except to the
 * people the exceptions are for.
 */

// ── A Prisma client that records every call ──────────────────────────
// lib/prisma reuses globalThis.prisma outside production, so installing
// this before the routes are first imported means they get it instead of
// a real client. Any call not explicitly allowed fails the request.
type Handler = (...args: unknown[]) => unknown;
const calls: string[] = [];
let allowed: Record<string, Handler> = {};

const prismaTrap = new Proxy(
  {},
  {
    get(_target, model) {
      if (typeof model !== "string" || model === "then") return undefined;
      return new Proxy(
        {},
        {
          get(_inner, op) {
            if (typeof op !== "string" || op === "then") return undefined;
            return (...args: unknown[]) => {
              const key = `${model}.${op}`;
              calls.push(key);
              const fn = allowed[key];
              return fn ? fn(...args) : Promise.reject(new Error(`prisma.${key} must not be called`));
            };
          },
        },
      );
    },
  },
);
Reflect.set(globalThis, "prisma", prismaTrap);
// Belt and braces: if a real client were ever built here it would have
// nowhere to connect (.env points at the live database).
process.env.DATABASE_URL = "postgresql://blocked:blocked@127.0.0.1:9/blocked";
process.env.DIRECT_URL = "postgresql://blocked:blocked@127.0.0.1:9/blocked";

/**
 * Static imports run before the lines above, so a module that imports
 * lib/prisma must only ever be loaded dynamically. This fails loudly if
 * one slipped in and lib/prisma built a real client.
 */
async function assertPrismaIsTrapped() {
  const { prisma } = await import("../../src/lib/prisma");
  assert.equal(prisma, prismaTrap, "lib/prisma was loaded before the stand-in; import it dynamically");
}

const loadRegisterRoute = () => import("../../src/app/api/auth/register/route");
const loadGate = () => import("../../src/lib/auth/registration-gate");
const loadConvertRoute = () => import("../../src/app/api/scripts/collaborator/convert/route");
const loadRegisterPage = () => import("../../src/app/(auth)/register/page");
const loadRegisterForm = () => import("../../src/app/(auth)/register/RegisterForm");
const loadLtiRoute = () => import("../../src/app/api/lti/launch/route");
const loadLoginPage = () => import("../../src/app/(auth)/login/page");

const ENV_KEYS = ["REGISTRATION_OPEN", "NEXT_PUBLIC_DEMO_MODE"] as const;
type EnvKey = (typeof ENV_KEYS)[number];

async function withEnv(env: Partial<Record<EnvKey, string>>, fn: () => void | Promise<void>) {
  const prev = ENV_KEYS.map((k) => [k, process.env[k]] as const);
  for (const k of ENV_KEYS) {
    const v = env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await assertPrismaIsTrapped();
  calls.length = 0;
  allowed = {};
  try {
    await fn();
  } finally {
    for (const [k, v] of prev) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    allowed = {};
  }
}

const closed = (fn: () => void | Promise<void>) => withEnv({}, fn);
const open = (fn: () => void | Promise<void>) => withEnv({ REGISTRATION_OPEN: "true" }, fn);

const TOKEN = "a".repeat(64);
const DAY = 24 * 60 * 60 * 1000;
const liveInvite = (over: Partial<{ email: string; status: string; expiresAt: Date }> = {}) => ({
  token: TOKEN,
  email: "new.teammate@acme.bio",
  status: "pending",
  expiresAt: new Date(Date.now() + 7 * DAY),
  company: { name: "Acme Bio" },
  ...over,
});

function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const signup = (over: Record<string, unknown> = {}) => ({
  name: "Jane Smith",
  email: "jane@example.com",
  password: "a-Long-and-unusual-passphrase-42",
  newsletter: "no",
  ...over,
});

// ── The switch ───────────────────────────────────────────────────────

test("sign-up is closed unless REGISTRATION_OPEN is exactly 'true'", async () => {
  const table: [Partial<Record<EnvKey, string>>, boolean][] = [
    [{}, false],
    [{ REGISTRATION_OPEN: "" }, false],
    [{ REGISTRATION_OPEN: "false" }, false],
    [{ REGISTRATION_OPEN: "1" }, false],
    [{ REGISTRATION_OPEN: "TRUE" }, false],
    [{ REGISTRATION_OPEN: "yes" }, false],
    [{ REGISTRATION_OPEN: " true" }, false],
    [{ REGISTRATION_OPEN: "true" }, true],
    // The demo deployment keeps sign-up, whatever REGISTRATION_OPEN says.
    [{ NEXT_PUBLIC_DEMO_MODE: "true" }, true],
    [{ NEXT_PUBLIC_DEMO_MODE: "true", REGISTRATION_OPEN: "false" }, true],
    [{ NEXT_PUBLIC_DEMO_MODE: "false" }, false],
    [{ NEXT_PUBLIC_DEMO_MODE: "1", REGISTRATION_OPEN: "1" }, false],
  ];
  for (const [env, expected] of table) {
    await withEnv(env, () => {
      assert.equal(isRegistrationOpen(), expected, JSON.stringify(env));
    });
  }
});

test("the closed response is a 403 with a plain error", async () => {
  const res = registrationClosedResponse();
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "Registration is closed." });
  assert.equal(REGISTRATION_CLOSED_ERROR, "Registration is closed.");
});

test("only an /invite/<token> return path yields a token", () => {
  assert.equal(inviteTokenFromPath, clientInviteTokenFromPath, "one implementation, shared with the client");
  assert.equal(inviteTokenFromPath(`/invite/${TOKEN}`), TOKEN);
  assert.equal(inviteTokenFromPath(`/invite/${TOKEN}/`), TOKEN);
  // A tracked link still counts: campaignAuthUrl() copies utm_* into callbackUrl.
  assert.equal(inviteTokenFromPath(`/invite/${TOKEN}?x=1`), TOKEN);
  assert.equal(inviteTokenFromPath(`/invite/${TOKEN}#top`), TOKEN);
  const tracked = new URL(
    campaignAuthUrl("register", `/invite/${TOKEN}`, { utm_source: "linkedin", gclid: "g1" }),
    "https://x.test",
  ).searchParams.get("callbackUrl");
  assert.match(tracked ?? "", /\?/, "the callback really does carry the tracking query");
  assert.equal(inviteTokenFromPath(tracked), TOKEN);

  for (const path of [
    null,
    undefined,
    "",
    "/dashboard",
    `/invite/${TOKEN}/accept`,
    `/invite/${TOKEN}/accept?x=1`,
    `/dashboard?next=/invite/${TOKEN}`,
    `//evil.example/invite/${TOKEN}`,
    `https://evil.example/invite/${TOKEN}`,
    `?/invite/${TOKEN}`,
    "/invite/short",
    "/invite/not-hex-at-all-but-long-enough",
  ]) {
    assert.equal(inviteTokenFromPath(path), null, String(path));
  }
});

test("an invite opens sign-up only while live, and only for its own address", () => {
  const now = new Date("2026-09-16T12:00:00Z");
  const invite = { email: "New.Teammate@Acme.bio", status: "pending", expiresAt: new Date("2026-09-20T00:00:00Z") };

  assert.equal(inviteAllowsRegistration(invite, "new.teammate@acme.bio", now), true);
  assert.equal(inviteAllowsRegistration(invite, "  NEW.TEAMMATE@ACME.BIO ", now), true, "case and spacing do not matter");

  assert.equal(inviteAllowsRegistration(invite, "someone.else@acme.bio", now), false, "a forwarded link is not a pass");
  assert.equal(inviteAllowsRegistration(invite, "", now), false);
  assert.equal(inviteAllowsRegistration(null, "new.teammate@acme.bio", now), false);
  assert.equal(inviteAllowsRegistration(undefined, "new.teammate@acme.bio", now), false);
  for (const status of ["accepted", "revoked", "expired"]) {
    assert.equal(inviteAllowsRegistration({ ...invite, status }, "new.teammate@acme.bio", now), false, status);
  }
  assert.equal(
    inviteAllowsRegistration({ ...invite, expiresAt: now }, "new.teammate@acme.bio", now),
    false,
    "an invite expiring this instant is already over",
  );
  assert.equal(
    inviteAllowsRegistration({ ...invite, email: "  " }, "  ", now),
    false,
    "a blank invite address matches nobody",
  );
});

// ── POST /api/auth/register ──────────────────────────────────────────

test("closed: the register API refuses before touching the database", async () => {
  const { POST } = await loadRegisterRoute();
  await closed(async () => {
    const bodies: unknown[] = [
      signup(),
      signup({ role: "superadmin" }),
      signup({ inviteToken: "" }),
      {},
      "not json at all",
    ];
    for (const body of bodies) {
      const res = await POST(post("https://bhn-training-platform.vercel.app/api/auth/register", body));
      assert.equal(res.status, 403, JSON.stringify(body));
      assert.deepEqual(await res.json(), { error: "Registration is closed." });
    }
    assert.deepEqual(calls, [], "no Prisma call of any kind");
  });
});

test("closed: a live team invite lets its addressee through the gate", async () => {
  const { POST } = await loadRegisterRoute();
  await closed(async () => {
    allowed["companyInvite.findUnique"] = async () => liveInvite();
    // A too-short name fails validation — which runs only after the gate,
    // so a 400 here proves the gate opened, without creating anybody.
    const res = await POST(
      post("https://x.test/api/auth/register", signup({ name: "J", email: "new.teammate@acme.bio", inviteToken: TOKEN })),
    );
    assert.equal(res.status, 400);
    assert.deepEqual(calls, ["companyInvite.findUnique"], "the invite is read; nothing else is");
  });
});

test("closed: an invite does not open the gate for anyone else, or once it is spent", async () => {
  const { POST } = await loadRegisterRoute();
  const cases: [string, ReturnType<typeof liveInvite> | null, string][] = [
    ["someone else's address", liveInvite(), "intruder@example.com"],
    ["accepted invite", liveInvite({ status: "accepted" }), "new.teammate@acme.bio"],
    ["revoked invite", liveInvite({ status: "revoked" }), "new.teammate@acme.bio"],
    ["expired invite", liveInvite({ expiresAt: new Date(Date.now() - DAY) }), "new.teammate@acme.bio"],
    ["unknown token", null, "new.teammate@acme.bio"],
  ];
  for (const [label, invite, email] of cases) {
    await closed(async () => {
      allowed["companyInvite.findUnique"] = async () => invite;
      const res = await POST(post("https://x.test/api/auth/register", signup({ email, inviteToken: TOKEN })));
      assert.equal(res.status, 403, label);
      assert.deepEqual(calls, ["companyInvite.findUnique"], `${label}: no write, no user lookup`);
    });
  }
});

test("open: the register API goes on to validate as before", async () => {
  const { POST } = await loadRegisterRoute();
  for (const env of [{ REGISTRATION_OPEN: "true" }, { NEXT_PUBLIC_DEMO_MODE: "true" }]) {
    await withEnv(env, async () => {
      const res = await POST(post("https://x.test/api/auth/register", signup({ name: "J" })));
      assert.equal(res.status, 400, JSON.stringify(env));
      const bad = await POST(post("https://x.test/api/auth/register", "not json at all"));
      assert.equal(bad.status, 400, "a malformed body is a 400, not a crash");
      assert.deepEqual(calls, []);
    });
  }
});

// ── The closed gate's exceptions ─────────────────────────────────────

function gateDeps(role: string | (() => Promise<string>), invite: ReturnType<typeof liveInvite> | null = null) {
  const looked: string[] = [];
  const deps: RegistrationGateDeps = {
    callerRole: typeof role === "string" ? async () => role : role,
    findInvite: async (token) => {
      looked.push(token);
      return invite;
    },
  };
  return { deps, looked };
}

test("closed gate: a signed-in admin or superadmin gets through, without an invite lookup", async () => {
  await assertPrismaIsTrapped();
  const { closedRegistrationAllows } = await loadGate();
  for (const role of ["admin", "superadmin"]) {
    const { deps, looked } = gateDeps(role);
    assert.equal(await closedRegistrationAllows("anyone@example.com", undefined, deps), true, role);
    assert.deepEqual(looked, [], `${role}: no invite read needed`);
  }
});

test("closed gate: any other role, or no session, is refused", async () => {
  await assertPrismaIsTrapped();
  const { closedRegistrationAllows } = await loadGate();
  for (const role of ["", "trainee", "learner", "instructor", "employer", "hr", "nonsense"]) {
    const { deps, looked } = gateDeps(role);
    assert.equal(await closedRegistrationAllows("anyone@example.com", undefined, deps), false, role || "signed out");
    assert.equal(await closedRegistrationAllows("anyone@example.com", "", deps), false, role || "signed out");
    assert.deepEqual(looked, []);
  }
});

test("closed gate: a session that cannot be read counts as signed out", async () => {
  await assertPrismaIsTrapped();
  const { closedRegistrationAllows } = await loadGate();
  const failures: (() => Promise<string>)[] = [
    async () => {
      throw new Error("headers() outside a request");
    },
    (() => {
      throw new Error("thrown before any promise");
    }) as () => Promise<string>,
  ];
  for (const role of failures) {
    const { deps } = gateDeps(role);
    assert.equal(await closedRegistrationAllows("anyone@example.com", undefined, deps), false);
    // ...and a live invite still works for its addressee.
    const withInvite = gateDeps(role, liveInvite());
    assert.equal(await closedRegistrationAllows("new.teammate@acme.bio", TOKEN, withInvite.deps), true);
    assert.deepEqual(withInvite.looked, [TOKEN]);
  }
});

test("closed gate: a non-admin needs a live invite addressed to them", async () => {
  await assertPrismaIsTrapped();
  const { closedRegistrationAllows } = await loadGate();
  const ok = gateDeps("trainee", liveInvite());
  assert.equal(await closedRegistrationAllows("new.teammate@acme.bio", TOKEN, ok.deps), true);
  assert.equal(await closedRegistrationAllows("intruder@example.com", TOKEN, ok.deps), false);
  assert.equal(await closedRegistrationAllows(42, TOKEN, ok.deps), false, "a non-string email");
  assert.equal(await closedRegistrationAllows("new.teammate@acme.bio", 42, ok.deps), false, "a non-string token");
});

async function withGateRole(role: string, fn: () => Promise<void>) {
  const { registrationGateDeps } = await loadGate();
  const prev = registrationGateDeps.callerRole;
  registrationGateDeps.callerRole = async () => role;
  try {
    await fn();
  } finally {
    registrationGateDeps.callerRole = prev;
  }
}

test("closed: /admin/users Create User still reaches validation for an admin", async () => {
  const { POST } = await loadRegisterRoute();
  for (const role of ["admin", "superadmin"]) {
    await closed(() =>
      withGateRole(role, async () => {
        // What UserActionsBar posts: no invite token. A too-short name
        // fails validation, which proves the gate opened without
        // creating anybody.
        const res = await POST(post("https://x.test/api/auth/register", { name: "J", email: "new@x.test", password: "x" }));
        assert.equal(res.status, 400, role);
        assert.deepEqual(calls, [], `${role}: no Prisma call before validation`);
      }),
    );
  }
});

test("closed: a signed-in non-admin is still refused by the register API", async () => {
  const { POST } = await loadRegisterRoute();
  for (const role of ["trainee", "instructor", "employer"]) {
    await closed(() =>
      withGateRole(role, async () => {
        const res = await POST(post("https://x.test/api/auth/register", signup()));
        assert.equal(res.status, 403, role);
        assert.deepEqual(calls, []);
      }),
    );
  }
});

// ── POST /api/lti/launch ─────────────────────────────────────────────
// The id_token is not signature-checked yet, so a forged launch must not
// be a way to create an account while sign-up is closed.

const LTI_CONFIG = { id: "lti-1", issuer: "https://lms.example", clientId: "client-1", active: true };

function ltiLaunch(claims: Record<string, unknown>) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");
  const form = new FormData();
  form.set("id_token", `${b64({ alg: "RS256" })}.${b64(claims)}.forged`);
  form.set("state", "anything");
  return new NextRequest("https://x.test/api/lti/launch", { method: "POST", body: form });
}

const ltiClaims = { iss: LTI_CONFIG.issuer, aud: LTI_CONFIG.clientId, email: "stranger@example.com", name: "Stranger" };

test("closed: an LTI launch for an unknown email is refused and creates nobody", async () => {
  const { POST } = await loadLtiRoute();
  await closed(async () => {
    allowed["ltiConfig.findFirst"] = async () => LTI_CONFIG;
    allowed["user.findUnique"] = async () => null;
    const res = await POST(ltiLaunch(ltiClaims));
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: "Registration is closed." });
    assert.deepEqual(calls, ["ltiConfig.findFirst", "user.findUnique"], "no user.create, no enrollment");
  });
});

test("closed: an LTI launch still lets an existing account in", async () => {
  const { POST } = await loadLtiRoute();
  await closed(async () => {
    allowed["ltiConfig.findFirst"] = async () => LTI_CONFIG;
    allowed["user.findUnique"] = async () => ({ id: "u-existing", email: ltiClaims.email });
    const res = await POST(ltiLaunch(ltiClaims));
    assert.equal(res.status, 307);
    assert.equal(new URL(res.headers.get("location") ?? "").pathname, "/dashboard");
    assert.deepEqual(calls, ["ltiConfig.findFirst", "user.findUnique"]);
  });
});

test("open: an LTI launch provisions an unknown email as before", async () => {
  const { POST } = await loadLtiRoute();
  await open(async () => {
    allowed["ltiConfig.findFirst"] = async () => LTI_CONFIG;
    allowed["user.findUnique"] = async () => null;
    allowed["user.create"] = async () => ({ id: "u-new" });
    const res = await POST(ltiLaunch(ltiClaims));
    assert.equal(res.status, 307);
    assert.deepEqual(calls, ["ltiConfig.findFirst", "user.findUnique", "user.create"]);
  });
});

// ── POST /api/scripts/collaborator/convert ───────────────────────────

test("closed: the script-collaborator conversion refuses before reading anything", async () => {
  const { POST } = await loadConvertRoute();
  await closed(async () => {
    const req = post("https://x.test/api/scripts/collaborator/convert", {
      email: "collab@example.com",
      password: "a-Long-and-unusual-passphrase-42",
      scriptId: "script-1",
      scriptUrl: "https://x.test/scripts/tok",
    });
    const res = await POST(req);
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: "Registration is closed." });
    assert.equal(req.bodyUsed, false, "the body is never read");
    assert.deepEqual(calls, []);
  });
});

test("open: the conversion goes on to validate as before", async () => {
  const { POST } = await loadConvertRoute();
  await open(async () => {
    const res = await POST(post("https://x.test/api/scripts/collaborator/convert", { email: "not-an-email" }));
    assert.equal(res.status, 400);
    assert.deepEqual(calls, []);
  });
});

// ── /register ────────────────────────────────────────────────────────

const pageProps = (query: Record<string, string | string[] | undefined>) => ({
  searchParams: Promise.resolve(query),
});

test("closed: /register renders the closed state, not the form", async () => {
  const { default: RegisterPage } = await loadRegisterPage();
  await closed(async () => {
    const el = await RegisterPage(pageProps({ callbackUrl: "/credits/apply", utm_source: "google", gclid: "abc123" }));
    const html = renderToStaticMarkup(el);

    assert.match(html, /<h1[^>]*>Registration is closed<\/h1>/);
    assert.match(html, /data-registration-closed/);
    assert.doesNotMatch(html, /<form/i, "no sign-up form");
    assert.doesNotMatch(html, /type="password"/);
    assert.doesNotMatch(html, /Create account/i);
    assert.doesNotMatch(html, /href="\/register/, "no link back into sign-up");
    assert.match(html, /mailto:support@biohubnet\.ca/);

    // Sign in keeps where they were going and the campaign they came from.
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    const signIn = hrefs.map((h) => new URL(h, "https://x.test")).find((u) => u.pathname === "/login" && u.search);
    assert.ok(signIn, `no Sign in link with a query in ${hrefs.join(", ")}`);
    assert.equal(signIn.searchParams.get("utm_source"), "google");
    assert.equal(signIn.searchParams.get("gclid"), "abc123");
    assert.ok(signIn.searchParams.get("callbackUrl")?.startsWith("/credits/apply"));

    assert.deepEqual(calls, [], "no invite in the query, so no lookup");
  });
});

test("closed: an unsafe callbackUrl is not carried into the Sign in link", async () => {
  const { default: RegisterPage } = await loadRegisterPage();
  await closed(async () => {
    const html = renderToStaticMarkup(await RegisterPage(pageProps({ callbackUrl: "https://evil.example/x" })));
    assert.doesNotMatch(html, /evil\.example/);
    assert.match(html, /Registration is closed/);
  });
});

test("closed: /register shows the form to a live team invitee, fixed to their address", async () => {
  const { default: RegisterPage } = await loadRegisterPage();
  const { RegisterForm } = await loadRegisterForm();
  await closed(async () => {
    allowed["companyInvite.findUnique"] = async () => liveInvite();
    const el = await RegisterPage(pageProps({ callbackUrl: `/invite/${TOKEN}` }));
    assert.equal(el.type, RegisterForm);
    assert.deepEqual(el.props, {
      invite: { token: TOKEN, email: "new.teammate@acme.bio", companyName: "Acme Bio" },
    });
    assert.deepEqual(calls, ["companyInvite.findUnique"]);
  });
});

test("closed: a spent or unknown invite gets the closed state", async () => {
  const { default: RegisterPage } = await loadRegisterPage();
  for (const invite of [null, liveInvite({ status: "accepted" }), liveInvite({ expiresAt: new Date(Date.now() - DAY) })]) {
    await closed(async () => {
      allowed["companyInvite.findUnique"] = async () => invite;
      const html = renderToStaticMarkup(await RegisterPage(pageProps({ callbackUrl: `/invite/${TOKEN}` })));
      assert.match(html, /Registration is closed/, JSON.stringify(invite?.status ?? null));
      // The Sign in link still returns them to the invite page.
      assert.match(html, new RegExp(`callbackUrl=${encodeURIComponent(`/invite/${TOKEN}`)}`));
    });
  }
});

test("open: /register is the plain sign-up form", async () => {
  const { default: RegisterPage } = await loadRegisterPage();
  const { RegisterForm } = await loadRegisterForm();
  await open(async () => {
    const el = await RegisterPage(pageProps({ callbackUrl: `/invite/${TOKEN}` }));
    assert.equal(el.type, RegisterForm);
    assert.equal(el.props.invite, undefined, "open sign-up needs no invite");
    assert.deepEqual(calls, []);
  });
});

test("the closed card names the way in", () => {
  const html = renderToStaticMarkup(<RegistrationClosed signInHref="/login?callbackUrl=%2Fdashboard" />);
  assert.match(html, /href="\/login\?callbackUrl=%2Fdashboard"/);
  assert.match(html, /invite-only/);
  assert.match(html, /support@biohubnet\.ca/);
});

// ── The client-side view of the switch ───────────────────────────────

function Probe() {
  return <span>{useRegistrationOpen() ? "open" : "closed"}</span>;
}

test("client pages read the server's answer, and default to closed without it", async () => {
  await assertPrismaIsTrapped();
  assert.equal(renderToStaticMarkup(<Probe />), "<span>closed</span>");
  assert.equal(
    renderToStaticMarkup(
      <RegistrationStatusProvider open={false}>
        <Probe />
      </RegistrationStatusProvider>,
    ),
    "<span>closed</span>",
  );
  assert.equal(
    renderToStaticMarkup(
      <RegistrationStatusProvider open>
        <Probe />
      </RegistrationStatusProvider>,
    ),
    "<span>open</span>",
  );
});

// ── /login ───────────────────────────────────────────────────────────

const fakeRouter = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };

async function renderLogin(query: string, registrationOpen: boolean) {
  await assertPrismaIsTrapped();
  const { default: LoginPage } = await loadLoginPage();
  return renderToStaticMarkup(
    <AppRouterContext.Provider value={fakeRouter as never}>
      <SearchParamsContext.Provider value={new URLSearchParams(query)}>
        <RegistrationStatusProvider open={registrationOpen}>
          <LoginPage />
        </RegistrationStatusProvider>
      </SearchParamsContext.Provider>
    </AppRouterContext.Provider>,
  );
}

const registerLinks = (html: string) =>
  [...html.matchAll(/href="(\/register[^"]*)"/g)].map((m) => new URL(m[1].replace(/&amp;/g, "&"), "https://x.test"));

test("closed: /login offers no sign-up and makes no free-account promise", async () => {
  const html = await renderLogin("callbackUrl=%2Fcredits%2Fapply", false);
  assert.deepEqual(registerLinks(html), []);
  assert.match(html, /data-registration-closed/);
  assert.match(html, /mailto:support@biohubnet\.ca/);
  assert.doesNotMatch(html, /Create your/);
  assert.doesNotMatch(html, /Free to start/);
  assert.doesNotMatch(html, /join the next round/);
});

test("closed: /login keeps a sign-up link for a team invitee", async () => {
  for (const callback of [`/invite/${TOKEN}`, `/invite/${TOKEN}?utm_source=linkedin`]) {
    const html = await renderLogin(
      `callbackUrl=${encodeURIComponent(callback)}&utm_source=linkedin`,
      false,
    );
    const links = registerLinks(html);
    assert.equal(links.length, 1, callback);
    // /register decides from this callback, so it must still name the invite.
    assert.equal(inviteTokenFromPath(links[0].searchParams.get("callbackUrl")), TOKEN, callback);
    assert.match(html, /Create your account for this invite/);
    assert.doesNotMatch(html, /data-registration-closed/, "no \"invite-only\" dead end for the invitee");
    assert.doesNotMatch(html, /Free to start/);
  }
});

test("open: /login offers sign-up as before", async () => {
  const html = await renderLogin("callbackUrl=%2Fcredits%2Fapply", true);
  const links = registerLinks(html);
  assert.equal(links.length, 1);
  assert.equal(links[0].searchParams.get("callbackUrl"), "/credits/apply");
  assert.match(html, /Create your free account/);
  assert.match(html, /Free to start/);
  assert.doesNotMatch(html, /data-registration-closed/);
});

// ── Admin → Access requests ──────────────────────────────────────────

test("the trainee welcome draft links to this deployment, and to sign-in while closed", async () => {
  await assertPrismaIsTrapped();
  const site = "https://preview-123.vercel.app";
  const closedDraft = traineeWelcomeBody(false, site);
  assert.match(closedDraft, /https:\/\/preview-123\.vercel\.app\/login/);
  assert.doesNotMatch(closedDraft, /\/register/);
  assert.doesNotMatch(closedDraft, /bhn-training-platform\.vercel\.app|example\.com/);
  const openDraft = traineeWelcomeBody(true, site);
  assert.match(openDraft, /https:\/\/preview-123\.vercel\.app\/register/);
  assert.doesNotMatch(openDraft, /example\.com/);
});
