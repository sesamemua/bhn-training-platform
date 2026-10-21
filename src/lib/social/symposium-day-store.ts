import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { SYMPOSIUM_DAY_PREFIX } from "./symposium-day";
import type { SocialOrder } from "./order";

const KEY = "admin.social.symposiumDay2026.order.v1";
export const SymposiumDayOrderSchema = z.array(z.string().min(1).max(160)).max(200).refine(order => new Set(order).size === order.length, "Include each post once.");

export async function loadSymposiumDayOrder(): Promise<SocialOrder> {
  const [saved, posts] = await Promise.all([
    prisma.platformSetting.findUnique({ where: { key: KEY } }),
    prisma.socialPost.findMany({ where: { key: { startsWith: SYMPOSIUM_DAY_PREFIX }, status: { not: "skipped" } }, orderBy: [{ scheduledFor: "asc" }, { id: "asc" }], select: { id: true } }),
  ]);
  const ids = posts.map(p => p.id);
  const previous = saved ? SymposiumDayOrderSchema.parse(JSON.parse(saved.value)).filter(id => ids.includes(id)) : [];
  return { order: [...previous, ...ids.filter(id => !previous.includes(id))], version: saved?.updatedAt.toISOString() ?? null };
}

export async function saveSymposiumDayOrder(order: string[], version: string | null) {
  SymposiumDayOrderSchema.parse(order);
  const current = await loadSymposiumDayOrder();
  if (version !== current.version || order.length !== current.order.length || order.some(id => !current.order.includes(id))) return { conflict: true, layout: current };
  const updatedAt = new Date(Math.max(Date.now(), version ? Date.parse(version) + 1 : 0));
  const value = JSON.stringify(order);
  if (version === null) {
    try { await prisma.platformSetting.create({ data: { key: KEY, value, updatedAt } }); }
    catch (e) { if ((e as { code?: string }).code !== "P2002") throw e; return { conflict: true, layout: await loadSymposiumDayOrder() }; }
  } else {
    const changed = await prisma.platformSetting.updateMany({ where: { key: KEY, updatedAt: new Date(version) }, data: { value, updatedAt } });
    if (changed.count !== 1) return { conflict: true, layout: await loadSymposiumDayOrder() };
  }
  return { conflict: false, layout: { order, version: updatedAt.toISOString() } };
}
