import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Runtime hooks are newer than the repository Node types.
import { registerHooks } from "node:module";

test("both dashboards count only Ignited direct-form bookings without adding seats twice", async () => {
  let selected: unknown;
  const booking = (id: string, slug: string | null, status = "confirmed") => ({
    id, status, withdrawnAt: null, user: null,
    submission: slug ? { email: `${id}@example.test`, data: {}, form: { slug } } : null,
  });
  const workshops = [
    { id: "ignited", slug: "innovation-showcase-2026", title: "Innovation Ignited", capacity: 100, startDateTime: new Date("2026-10-28T14:00:00Z"), bookings: [
      booking("direct", "innovation-ignited-2026"),
      booking("declined-direct", "innovation-ignited-2026", "cancelled"),
      booking("training", "training-week-2026-v2"),
      booking("manual", null),
    ] },
    { id: "other", slug: "another-workshop", title: "Workshop", capacity: 12, startDateTime: new Date("2026-10-26T14:00:00Z"), bookings: [] },
  ];
  Reflect.set(globalThis, "capacityDirectLinkPrisma", {
    bhnEvent: { findMany: async () => [{ id: "week", _count: { workshops: 2 } }] },
    workshop: { findMany: async (args: unknown) => { selected = args; return workshops; } },
    platformSetting: { findUnique: async () => null },
  });
  const hooks = registerHooks({ resolve(specifier, context, next) {
    return ["server-only", "@/lib/prisma", "./internal-server", "@/lib/allocation/seat-suggestions-server"].includes(specifier)
      ? { url: new URL("../fixtures/capacity-direct-link.cjs", import.meta.url).href, shortCircuit: true }
      : next(specifier, context);
  } });
  try {
    const { loadCapacityMonitor } = await import("../../src/lib/training-week/capacity-server");
    const [ignited, other] = await loadCapacityMonitor();
    assert.equal(ignited.directLinkRegistrations, 2, "Includes all statuses like the displayed registration total");
    assert.equal(ignited.cap.records, 4);
    assert.equal(ignited.cap.confirmed, 3);
    assert.equal(ignited.cap.remaining, 97);
    assert.equal(other.directLinkRegistrations, undefined);
    assert.match(JSON.stringify(selected), /"form":\{"select":\{"slug":true\}\}/);
    workshops[0].bookings = [];
    assert.equal((await loadCapacityMonitor())[0].directLinkRegistrations, 0);
  } finally {
    hooks.deregister();
    Reflect.deleteProperty(globalThis, "capacityDirectLinkPrisma");
  }
});
