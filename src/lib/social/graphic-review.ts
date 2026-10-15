"use server";

/**
 * Comments pinned on a social post's graphic, on the Social page itself.
 *
 * Design Review already does what commenting on a picture needs —
 * pinned comments, replies, resolve, rounds — so the social queue reuses
 * its records and its viewer rather than growing a second way to do it.
 * The review happens inside the post's card; nobody has to leave Social.
 * Every post's graphic is one artwork in the "Social graphics" project,
 * tied to its post by `sourceName = social:<postId>`
 * (no new column, and nothing written into the post's assetSpec, which
 * is the image renderer's contract). Sending a new version replaces the
 * artwork's picture: comments stay, marks and approval start again.
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteR2ObjectByUrl, putR2Object, r2PublicUrl } from "@/lib/r2";
import { imageSize } from "@/lib/images/size";
import { PagesSchema, pagesOf } from "@/lib/design-review/types";
import { socialSource } from "./graphic-source";

const PROJECT = "Social graphics";
const BASE = (process.env.NEXTAUTH_URL ?? "https://bhn-training-platform.vercel.app").replace(/\/$/, "");

/**
 * Bring a post's current graphic into its review — the first time, or as a
 * new version. Copied on the server: the browser cannot read the image
 * store directly. Only the post's own graphic is ever fetched: its stored
 * address, or the speaker-graphic route for that post.
 */
export async function reviewSocialGraphic(postId: string, assetUrl: string): Promise<{ ok: boolean; problem?: string; artworkId?: string }> {
  const session = await requireRole("admin");
  const me = session.user as { id?: string };
  const post = await prisma.socialPost.findUnique({ where: { id: postId }, select: { id: true, body: true, assetSpec: true, assetUrl: true } });
  if (!post) return { ok: false, problem: "That post no longer exists." };
  const own = `/api/admin/social/posts/${post.id}/image`;
  const bare = (u: string | null) => (u ?? "").split("?")[0];
  if (bare(assetUrl) !== own && bare(assetUrl) !== bare(post.assetUrl)) return { ok: false, problem: "That is not this post's graphic." };

  // A route of ours needs the caller's sign-in; the image store does not.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const url = bare(assetUrl) === own ? `${h.get("x-forwarded-proto") ?? "https"}://${host}${own}` : bare(post.assetUrl);
  const res = await fetch(url, { cache: "no-store", headers: bare(assetUrl) === own ? { cookie: h.get("cookie") ?? "" } : {}, signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!res?.ok) return { ok: false, problem: "The graphic couldn't be read — try again." };
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > 15 * 1024 * 1024) return { ok: false, problem: "That graphic is too large to review here." };
  const size = imageSize(bytes);
  if (!size) return { ok: false, problem: "That graphic isn't a PNG, JPEG, GIF or WebP." };
  const key = `design-review/${randomUUID()}.${size.type.split("/")[1]}`;
  await putR2Object(key, bytes, size.type);
  const pg = PagesSchema.safeParse([{ key, url: r2PublicUrl(key), w: size.w, h: size.h }]);
  if (!pg.success) return { ok: false, problem: "The graphic couldn't be stored." };

  let project = await prisma.designProject.findFirst({ where: { name: PROJECT }, select: { id: true } });
  if (!project) {
    const approver = await prisma.user.findFirst({ where: { name: { startsWith: "Yoo Jin" }, role: { in: ["instructor", "admin", "superadmin"] } }, select: { id: true } });
    project = await prisma.designProject.create({
      data: { name: PROJECT, description: "Graphics for social posts, sent here from Marketing → Social for comments and approval.", approverId: approver?.id ?? null, createdById: me.id ?? null },
      select: { id: true },
    });
  }

  const title = ((post.assetSpec as { title?: unknown } | null)?.title as string | undefined)?.slice(0, 160) || post.body.split("\n")[0].slice(0, 160) || "Social post";
  const description = [`Graphic for a social post. The post: ${BASE}/admin/workspace/marketing/social?post=${post.id}`, "", post.body.slice(0, 700)].join("\n");
  const existing = await prisma.designArtwork.findFirst({ where: { sourceName: socialSource(post.id) }, select: { id: true, pages: true } });
  let artworkId: string;
  if (existing) {
    // A new version of the graphic: comments stay; who has looked, who is OK and the approval start again.
    await prisma.$transaction([
      prisma.designArtwork.update({ where: { id: existing.id }, data: { title, description, pages: pg.data, approval: "pending", approvalNote: "", approvalById: null, approvalAt: null } }),
      prisma.designReview.deleteMany({ where: { artworkId: existing.id } }),
    ]);
    await Promise.all(pagesOf(existing.pages).map((p) => deleteR2ObjectByUrl(p.url).catch(() => {})));
    artworkId = existing.id;
  } else {
    const last = await prisma.designArtwork.findFirst({ where: { projectId: project.id }, orderBy: { order: "desc" }, select: { order: true } });
    const row = await prisma.designArtwork.create({
      data: { projectId: project.id, title, description, pages: pg.data, sourceName: socialSource(post.id), order: (last?.order ?? -1) + 1, createdById: me.id ?? null },
      select: { id: true },
    });
    artworkId = row.id;
  }
  revalidatePath("/admin/workspace/marketing/social");
  return { ok: true, artworkId };
}
