import { prisma } from "@/lib/prisma";
import { changeLinkedinBoard, LINKEDIN_BOARD_KEY, LinkedinBoard, type LinkedinAction, type LinkedinSnapshot } from "./linkedin";

export async function loadLinkedinBoard(): Promise<LinkedinSnapshot> {
  const row = await prisma.platformSetting.findUnique({ where: { key: LINKEDIN_BOARD_KEY } });
  return { board: row ? LinkedinBoard.parse(JSON.parse(row.value)) : { entries: [], checkedAt: null, coverage: "Not yet checked." }, version: row?.updatedAt.toISOString() ?? null };
}

export async function saveLinkedinBoard(version: string | null, action: LinkedinAction, actor: string) {
  const current = await loadLinkedinBoard();
  if (version !== current.version) return { conflict: true, snapshot: current };
  const updatedAt = new Date(Math.max(Date.now(), version ? Date.parse(version) + 1 : 0));
  const board = changeLinkedinBoard(current.board, action, actor, updatedAt.toISOString());
  const value = JSON.stringify(board);
  if (version === null) {
    try { await prisma.platformSetting.create({ data: { key: LINKEDIN_BOARD_KEY, value, updatedAt } }); }
    catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      return { conflict: true, snapshot: await loadLinkedinBoard() };
    }
  } else {
    const result = await prisma.platformSetting.updateMany({ where: { key: LINKEDIN_BOARD_KEY, updatedAt: new Date(version) }, data: { value, updatedAt } });
    if (!result.count) return { conflict: true, snapshot: await loadLinkedinBoard() };
  }
  return { conflict: false, snapshot: { board, version: updatedAt.toISOString() } };
}
