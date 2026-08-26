/**
 * The notification address book.
 *
 *   GET    /api/admin/notify/contacts        list
 *   POST   /api/admin/notify/contacts        add    { name, email, role? }
 *   PATCH  /api/admin/notify/contacts        edit   { id, name?, email?, role? }
 *   DELETE /api/admin/notify/contacts?id=…   remove
 *
 * Separate from the send route because it outlives any one message:
 * these are the people who get told about things, and the point of
 * keeping them is not retyping six addresses every time and missing one.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEmail, MAX_ADDRESS_CHARS } from "@/lib/notify/recipients";

export const runtime = "nodejs";

const MAX_NAME = 120;
const MAX_ROLE = 120;
/** A bound on the book itself, so it stays a list of colleagues. */
const MAX_CONTACTS = 500;

async function admin(): Promise<{ id?: string } | null> {
  try {
    const s = await requireRole("admin");
    return s.user as { id?: string };
  } catch {
    return null;
  }
}

const DENIED = () =>
  NextResponse.json({ error: "You need to be signed in as an admin." }, { status: 403 });

const SELECT = { id: true, name: true, email: true, role: true } as const;

export async function GET() {
  if (!(await admin())) return DENIED();
  const contacts = await prisma.notifyContact.findMany({
    select: SELECT,
    orderBy: [{ name: "asc" }],
  });
  return NextResponse.json({ ok: true, contacts });
}

export async function POST(req: NextRequest) {
  const me = await admin();
  if (!me) return DENIED();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name ?? "").trim().slice(0, MAX_NAME);
  // Lowercased on write. The alternative — storing as typed and
  // comparing with mode:"insensitive" — compiles to ILIKE with the
  // address bound raw, and `_` is a LIKE wildcard that passes isEmail:
  // adding jane_doe@uhn.ca then matches jane.doe@uhn.ca and is refused
  // as a duplicate of somebody else. Normalising also promotes the
  // @unique index into a real atomic backstop, which case-sensitive
  // equality could never be.
  const email = String(body.email ?? "").trim().slice(0, MAX_ADDRESS_CHARS).toLowerCase();
  const role = String(body.role ?? "").trim().slice(0, MAX_ROLE) || null;

  if (name.length < 2) {
    return NextResponse.json({ error: "Give them a name — it goes in the greeting." }, { status: 400 });
  }
  if (!isEmail(email)) {
    return NextResponse.json({ error: `That is not an email address: ${email}` }, { status: 400 });
  }

  // Exact equality on an already-lowercased address. The unique index
  // is the real backstop for the race between this check and the insert.
  const clash = await prisma.notifyContact.findFirst({
    where: { email },
    select: SELECT,
  });
  if (clash) {
    return NextResponse.json({ error: `${clash.email} is already in the list.` }, { status: 409 });
  }

  if ((await prisma.notifyContact.count()) >= MAX_CONTACTS) {
    return NextResponse.json(
      { error: `The list is full at ${MAX_CONTACTS}. Remove somebody first.` },
      { status: 400 },
    );
  }

  try {
    const contact = await prisma.notifyContact.create({
      data: { name, email, role, addedById: me.id ?? null },
      select: SELECT,
    });
    return NextResponse.json({ ok: true, contact });
  } catch {
    return NextResponse.json({ error: "That address is already in the list." }, { status: 409 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await admin())) return DENIED();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Which contact?" }, { status: 400 });

  const data: { name?: string; email?: string; role?: string | null } = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, MAX_NAME);
    if (name.length < 2) {
      return NextResponse.json({ error: "Give them a name — it goes in the greeting." }, { status: 400 });
    }
    data.name = name;
  }
  if (body.email !== undefined) {
    const email = String(body.email).trim().slice(0, MAX_ADDRESS_CHARS).toLowerCase();
    if (!isEmail(email)) {
      return NextResponse.json({ error: `That is not an email address: ${email}` }, { status: 400 });
    }
    const clash = await prisma.notifyContact.findFirst({
      where: { email, NOT: { id } },
      select: { email: true },
    });
    if (clash) {
      return NextResponse.json({ error: `${clash.email} is already in the list.` }, { status: 409 });
    }
    data.email = email;
  }
  if (body.role !== undefined) {
    data.role = String(body.role).trim().slice(0, MAX_ROLE) || null;
  }

  try {
    const contact = await prisma.notifyContact.update({ where: { id }, data, select: SELECT });
    return NextResponse.json({ ok: true, contact });
  } catch {
    return NextResponse.json({ error: "No such contact." }, { status: 404 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await admin())) return DENIED();

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Which contact?" }, { status: 400 });

  try {
    await prisma.notifyContact.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    // Already gone is the outcome the caller wanted.
    return NextResponse.json({ ok: true });
  }
}
