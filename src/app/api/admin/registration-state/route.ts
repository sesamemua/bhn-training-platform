/**
 * GET/POST /api/admin/registration-state — the kill switch.
 *
 *   GET  → { state, at, by, forms }
 *   POST { state } → the same, after moving it
 *
 * Admin only. Moving the switch writes the state AND every version of
 * the Training Week registration in one transaction: v1 is frozen
 * against edits to its questions, which is not the same as being
 * exempt from "nobody can register right now". A switch that left one
 * version open would be a switch that does not switch anything.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { REGISTRATION_FORM_SLUG, REGISTRATION_FORM_WHERE } from "@/lib/allocation/symposium-2026";
import { versionRoot } from "@/lib/formbuilder/versions";
import {
  parseSwitch, REGISTRATION_STATE_KEY, REGISTRATION_STATES,
  serialiseSwitch, type RegistrationState, type RegistrationSwitch,
} from "@/lib/registration/state";

export const dynamic = "force-dynamic";

async function admin() {
  const session = (await requireRole("admin").catch(() => null)) as
    | { user?: { id?: string; name?: string | null; email?: string | null } }
    | null;
  return session?.user ? session : null;
}
const DENIED = () => NextResponse.json({ error: "Admins only." }, { status: 403 });

/** Every version of the Training Week registration, v1 included. */
async function registrationForms() {
  const rows = await prisma.eventForm.findMany({
    where: REGISTRATION_FORM_WHERE,
    select: { id: true, slug: true, title: true, active: true },
    orderBy: { slug: "asc" },
  });
  return rows.filter((f) => versionRoot(f.slug) === REGISTRATION_FORM_SLUG);
}

async function current(): Promise<RegistrationSwitch & { forms: { slug: string; active: boolean }[] }> {
  const [row, forms] = await Promise.all([
    prisma.platformSetting.findUnique({ where: { key: REGISTRATION_STATE_KEY } }),
    registrationForms(),
  ]);
  // Before the switch has ever been touched, the forms themselves are
  // the answer — anything else would offer to open what is already open.
  const fallback: RegistrationState = forms.some((f) => f.active) ? "open" : "closed";
  return {
    ...parseSwitch(row?.value, fallback),
    forms: forms.map((f) => ({ slug: f.slug, active: f.active })),
  };
}

export async function GET() {
  if (!(await admin())) return DENIED();
  return NextResponse.json(await current());
}

export async function POST(req: NextRequest) {
  const session = await admin();
  if (!session) return DENIED();

  const body = (await req.json().catch(() => ({}))) as { state?: unknown };
  const state = REGISTRATION_STATES.find((s) => s === body.state);
  if (!state) return NextResponse.json({ error: "Open, paused or closed." }, { status: 400 });

  const who = session.user?.name || session.user?.email || null;
  const value = serialiseSwitch({ state, at: new Date().toISOString(), by: who });
  const forms = await registrationForms();

  await prisma.$transaction([
    prisma.platformSetting.upsert({
      where: { key: REGISTRATION_STATE_KEY },
      create: { key: REGISTRATION_STATE_KEY, value },
      update: { value },
    }),
    // The boolean everything else already obeys, kept in step with the
    // word a coordinator pressed.
    prisma.eventForm.updateMany({
      where: { id: { in: forms.map((f) => f.id) } },
      data: { active: state === "open" },
    }),
  ]);

  return NextResponse.json(await current());
}
