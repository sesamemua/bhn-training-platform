/** URLs inside Workspace → Video Production. One place, so tabs and actions agree. */
export const VIDEO_BASE = "/admin/workspace/marketing/video";
export const projectPath = (projectId: string) => `${VIDEO_BASE}/${projectId}`;
export const callSheetsPath = (projectId: string) => `${projectPath(projectId)}/call-sheets`;
export const productionCostPath = (projectId: string) => `${projectPath(projectId)}/production-cost`;
