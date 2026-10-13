import { prisma } from "@/lib/prisma";
import { CardOrderSchema, DEFAULT_CARD_ORDER, type DashboardCard, type DashboardLayout } from "./card-order";

const KEY = "admin.dashboard.cardOrder.v1";
export async function loadDashboardLayout(): Promise<DashboardLayout> {
  const row = await prisma.platformSetting.findUnique({ where: { key: KEY } });
  return { order: row ? CardOrderSchema.parse(JSON.parse(row.value)) : [...DEFAULT_CARD_ORDER], version: row?.updatedAt.toISOString() ?? null };
}
export async function saveDashboardLayout(order: DashboardCard[], version: string | null) {
  CardOrderSchema.parse(order);
  const updatedAt = new Date(Math.max(Date.now(), version ? Date.parse(version) + 1 : 0));
  const value = JSON.stringify(order);
  if (version === null) {
    try { await prisma.platformSetting.create({ data: { key: KEY, value, updatedAt } }); }
    catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      return { conflict: true, layout: await loadDashboardLayout() };
    }
  } else {
    const result = await prisma.platformSetting.updateMany({ where: { key: KEY, updatedAt: new Date(version) }, data: { value, updatedAt } });
    if (result.count !== 1) return { conflict: true, layout: await loadDashboardLayout() };
  }
  return { conflict: false, layout: { order, version: updatedAt.toISOString() } };
}
