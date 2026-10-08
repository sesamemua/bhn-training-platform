"use server";

/**
 * Design review: everything the pages change. Every action re-checks the
 * role — a server action is a public endpoint — and that the thing it
 * touches exists. Staff (instructor and up) can do all of it, except that
 * only a project's approver records the approval, and a comment is edited
 * or deleted by its author (or an admin).
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteR2ObjectByUrl } from "@/lib/r2";
import { mailConfigured, sendMail } from "@/lib/mail";
import { ArtworkInput, PagesSchema, PinInput, ProjectInput, isApproval, pagesOf } from "@/lib/design-review/types";

const PAGE = "/admin/workspace/design-review";
type Result = { ok: true; id?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
const done = (id?: string): Result => { revalidatePath(PAGE); return { ok: true, id }; };

async function me() {
  const session = await requireRole("instructor");
  const u = session.user as { id?: string; name?: string | null; email?: string | null; role?: string };
  return { id: u.id ?? "", name: u.name || u.email || "Team member", admin: u.role === "admin" || u.role === "superadmin" };
}
/** Stored page images go with the artwork; a missing object is no reason to keep the row. */
async function dropPages(pages: unknown) {
  await Promise.all(pagesOf(pages).map((p) => deleteR2ObjectByUrl(p.url).catch(() => {})));
}

// ── projects ─────────────────────────────────────────────────────────
export async function createDesignProject(input: unknown): Promise<Result> {
  const u = await me();
  const p = ProjectInput.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Check the fields.");
  const row = await prisma.designProject.create({ data: { ...p.data, createdById: u.id }, select: { id: true } });
  return done(row.id);
}

export async function updateDesignProject(id: string, input: unknown): Promise<Result> {
  await me();
  const p = ProjectInput.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Check the fields.");
  const row = await prisma.designProject.update({ where: { id }, data: p.data }).catch(() => null);
  return row ? done(id) : fail("That project no longer exists.");
}

export async function deleteDesignProject(id: string): Promise<Result> {
  await me();
  const row = await prisma.designProject.findUnique({ where: { id }, select: { artworks: { select: { pages: true } } } });
  if (!row) return fail("That project is already gone.");
  await prisma.designProject.delete({ where: { id } });
  await Promise.all(row.artworks.map((a) => dropPages(a.pages)));
  return done();
}

// ── artworks ─────────────────────────────────────────────────────────
export async function createDesignArtwork(projectId: string, input: unknown, pages: unknown, sourceName: string): Promise<Result> {
  const u = await me();
  const p = ArtworkInput.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Check the fields.");
  const pg = PagesSchema.safeParse(pages);
  if (!pg.success) return fail("The artwork's pages didn't upload properly — try again.");
  const last = await prisma.designArtwork.findFirst({ where: { projectId }, orderBy: { order: "desc" }, select: { order: true } });
  const project = await prisma.designProject.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return fail("That project no longer exists.");
  const row = await prisma.designArtwork.create({
    data: { projectId, ...p.data, pages: pg.data, sourceName: String(sourceName ?? "").slice(0, 200), order: (last?.order ?? -1) + 1, createdById: u.id },
    select: { id: true },
  });
  return done(row.id);
}

export async function updateDesignArtwork(id: string, input: unknown): Promise<Result> {
  await me();
  const p = ArtworkInput.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Check the fields.");
  const row = await prisma.designArtwork.update({ where: { id }, data: p.data }).catch(() => null);
  return row ? done(id) : fail("That artwork no longer exists.");
}

/**
 * A new version of the artwork: its pages are replaced, and — because it is
 * a different picture now — everyone's Seen / OK and the approval start again.
 * Comments stay, so what was asked for can be checked against the new version.
 */
export async function replaceDesignArtworkPages(id: string, pages: unknown, sourceName: string): Promise<Result> {
  await me();
  const pg = PagesSchema.safeParse(pages);
  if (!pg.success) return fail("The new pages didn't upload properly — try again.");
  const old = await prisma.designArtwork.findUnique({ where: { id }, select: { pages: true } });
  if (!old) return fail("That artwork no longer exists.");
  await prisma.$transaction([
    prisma.designArtwork.update({ where: { id }, data: { pages: pg.data, sourceName: String(sourceName ?? "").slice(0, 200), approval: "pending", approvalNote: "", approvalById: null, approvalAt: null } }),
    prisma.designReview.deleteMany({ where: { artworkId: id } }),
  ]);
  await dropPages(old.pages);
  return done(id);
}

export async function moveDesignArtwork(id: string, direction: -1 | 1): Promise<Result> {
  await me();
  const a = await prisma.designArtwork.findUnique({ where: { id }, select: { projectId: true } });
  if (!a) return fail("That artwork no longer exists.");
  const all = await prisma.designArtwork.findMany({ where: { projectId: a.projectId }, orderBy: [{ order: "asc" }, { createdAt: "asc" }], select: { id: true } });
  const i = all.findIndex((x) => x.id === id), j = i + direction;
  if (j < 0 || j >= all.length) return done(id);
  [all[i], all[j]] = [all[j], all[i]];
  await prisma.$transaction(all.map((x, order) => prisma.designArtwork.update({ where: { id: x.id }, data: { order } })));
  return done(id);
}

export async function deleteDesignArtwork(id: string): Promise<Result> {
  await me();
  const row = await prisma.designArtwork.findUnique({ where: { id }, select: { pages: true } });
  if (!row) return fail("That artwork is already gone.");
  await prisma.designArtwork.delete({ where: { id } });
  await dropPages(row.pages);
  return done();
}

// ── seen, OK, approval ───────────────────────────────────────────────
/** Called from the open page once it is actually on screen — never from a render. */
export async function markDesignSeen(artworkId: string): Promise<Result> {
  const u = await me();
  if (!u.id) return fail("No account.");
  await prisma.designReview.upsert({
    where: { artworkId_userId: { artworkId, userId: u.id } },
    create: { artworkId, userId: u.id, userName: u.name, viewedAt: new Date() },
    update: { userName: u.name, viewedAt: new Date() },
  }).catch(() => null);
  return { ok: true };
}

export async function setDesignOk(artworkId: string, ok: boolean): Promise<Result> {
  const u = await me();
  await prisma.designReview.upsert({
    where: { artworkId_userId: { artworkId, userId: u.id } },
    create: { artworkId, userId: u.id, userName: u.name, viewedAt: new Date(), okAt: ok ? new Date() : null },
    update: { userName: u.name, okAt: ok ? new Date() : null },
  });
  return done(artworkId);
}

export async function setDesignApproval(artworkId: string, approval: unknown, note: string): Promise<Result> {
  const u = await me();
  if (!isApproval(approval)) return fail("Pick a decision.");
  const a = await prisma.designArtwork.findUnique({ where: { id: artworkId }, select: { project: { select: { approverId: true } } } });
  if (!a) return fail("That artwork no longer exists.");
  if (a.project.approverId !== u.id) return fail("Only this project's approver can record the approval.");
  await prisma.designArtwork.update({
    where: { id: artworkId },
    data: { approval, approvalNote: String(note ?? "").trim().slice(0, 600), approvalById: approval === "pending" ? null : u.id, approvalAt: approval === "pending" ? null : new Date() },
  });
  return done(artworkId);
}

/** Ask a teammate to review an artwork: an email with the link, and "Asked" beside their name. */
export async function requestDesignReview(artworkId: string, userId: string, note: string): Promise<Result> {
  const u = await me();
  const [a, who] = await Promise.all([
    prisma.designArtwork.findUnique({ where: { id: artworkId }, select: { title: true, project: { select: { name: true } } } }),
    prisma.user.findFirst({ where: { id: String(userId), role: { in: ["instructor", "admin", "superadmin"] } }, select: { id: true, name: true, email: true } }),
  ]);
  if (!a) return fail("That artwork no longer exists.");
  if (!who?.email) return fail("That person isn't on the team.");
  if (!mailConfigured()) return fail("Email isn't set up, so the request can't be sent.");
  const link = `${(process.env.NEXTAUTH_URL ?? "https://bhn-training-platform.vercel.app").replace(/\/$/, "")}${PAGE}?a=${artworkId}`;
  const extra = String(note ?? "").trim().slice(0, 600);
  try {
    await sendMail({
      to: who.email,
      subject: `${u.name} asked you to review: ${a.title}`.replace(/[\r\n]+/g, " "),
      text: `Hello ${(who.name ?? "").split(/\s+/)[0] || "there"},\n\n${u.name} would like your review of “${a.title}” (${a.project.name}).\n\n${extra ? `${extra}\n\n` : ""}Open it, click anywhere on the artwork to comment, and press “I'm OK with this” when you are happy:\n${link}`,
    });
  } catch {
    return fail("The email didn't send — try again.");
  }
  await prisma.designReview.upsert({
    where: { artworkId_userId: { artworkId, userId: who.id } },
    create: { artworkId, userId: who.id, userName: who.name ?? who.email, requestedAt: new Date(), requestedByName: u.name },
    update: { requestedAt: new Date(), requestedByName: u.name },
  });
  return done(artworkId);
}

// ── rounds ───────────────────────────────────────────────────────────
/** Copying the feedback hands the round over: it locks, so the list being worked from cannot change. */
export async function lockDesignRound(artworkId: string): Promise<Result> {
  await me();
  const r = await prisma.designArtwork.updateMany({ where: { id: artworkId, lockedAt: null }, data: { lockedAt: new Date() } });
  return r.count || (await prisma.designArtwork.count({ where: { id: artworkId } })) ? done(artworkId) : fail("That artwork no longer exists.");
}

/** The next round: comments open again. Anything still open carries over. */
export async function startDesignRound(artworkId: string): Promise<Result> {
  await me();
  const r = await prisma.designArtwork.updateMany({ where: { id: artworkId, lockedAt: { not: null } }, data: { lockedAt: null, round: { increment: 1 } } });
  return r.count ? done(artworkId) : fail("This round is still open.");
}

const LOCKED = "This round is locked — start the next round to comment again.";
/** The artwork's round, or why it cannot take a change. */
async function openRound(artworkId: string) {
  const a = await prisma.designArtwork.findUnique({ where: { id: artworkId }, select: { pages: true, round: true, lockedAt: true } });
  if (!a) return { error: "That artwork no longer exists." } as const;
  if (a.lockedAt) return { error: LOCKED } as const;
  return { a } as const;
}

// ── comments pinned on the artwork ───────────────────────────────────
export async function addDesignPin(artworkId: string, input: unknown): Promise<Result> {
  const u = await me();
  const p = PinInput.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Check the comment.");
  const o = await openRound(artworkId);
  if (o.error !== undefined) return fail(o.error);
  if (p.data.page >= pagesOf(o.a.pages).length) return fail("That page isn't part of this artwork.");
  const row = await prisma.designPin.create({ data: { artworkId, ...p.data, round: o.a.round, authorId: u.id, authorName: u.name }, select: { id: true } });
  return done(row.id);
}

export async function replyDesignPin(parentId: string, body: string): Promise<Result> {
  const u = await me();
  const text = String(body ?? "").trim().slice(0, 2000);
  if (!text) return fail("Write the reply.");
  const parent = await prisma.designPin.findUnique({ where: { id: parentId }, select: { artworkId: true, page: true, x: true, y: true, parentId: true } });
  if (!parent || parent.parentId) return fail("That comment is gone.");
  const o = await openRound(parent.artworkId);
  if (o.error !== undefined) return fail(o.error);
  const row = await prisma.designPin.create({ data: { round: o.a.round, artworkId: parent.artworkId, page: parent.page, x: parent.x, y: parent.y, parentId, authorId: u.id, authorName: u.name, body: text }, select: { id: true } });
  // A reply reopens a settled thread: there is something new to read.
  await prisma.designPin.update({ where: { id: parentId }, data: { status: "open" } });
  return done(row.id);
}

export async function resolveDesignPin(id: string, resolved: boolean): Promise<Result> {
  await me();
  const row = await prisma.designPin.updateMany({ where: { id, artwork: { lockedAt: null } }, data: { status: resolved ? "resolved" : "open" } });
  return row.count ? done(id) : fail(LOCKED);
}

export async function editDesignPin(id: string, body: string): Promise<Result> {
  const u = await me();
  const text = String(body ?? "").trim().slice(0, 2000);
  if (!text) return fail("Write the comment.");
  const pin = await prisma.designPin.findUnique({ where: { id }, select: { authorId: true, artwork: { select: { lockedAt: true } } } });
  if (!pin) return fail("That comment is gone.");
  if (pin.artwork.lockedAt) return fail(LOCKED);
  if (pin.authorId !== u.id && !u.admin) return fail("Only its author can edit a comment.");
  await prisma.designPin.update({ where: { id }, data: { body: text } });
  return done(id);
}

export async function deleteDesignPin(id: string): Promise<Result> {
  const u = await me();
  const pin = await prisma.designPin.findUnique({ where: { id }, select: { authorId: true, artwork: { select: { lockedAt: true } } } });
  if (!pin) return fail("That comment is already gone.");
  if (pin.artwork.lockedAt) return fail(LOCKED);
  if (pin.authorId !== u.id && !u.admin) return fail("Only its author can delete a comment.");
  await prisma.designPin.delete({ where: { id } });
  return done();
}
