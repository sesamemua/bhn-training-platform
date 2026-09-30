/** URLs inside Workspace → Video Production. One place, so tabs and actions agree. */
export const VIDEO_BASE = "/admin/workspace/marketing/video";
export const projectPath = (projectId: string) => `${VIDEO_BASE}/${projectId}`;
export const callSheetsPath = (projectId: string) => `${projectPath(projectId)}/call-sheets`;
export const productionCostPath = (projectId: string) => `${projectPath(projectId)}/production-cost`;
export const scriptPath = (projectId: string, scriptId: string) => `${projectPath(projectId)}/scripts/${scriptId}`;
/** Scripts opens the script itself when there is exactly one, else the list. */
export const scriptsHref = (projectId: string, scriptIds: string[]) =>
  scriptIds.length === 1 ? scriptPath(projectId, scriptIds[0]) : projectPath(projectId);
export const filmingPath = (projectId: string) => `${projectPath(projectId)}/filming`;
export const printoutPath = (projectId: string) => `${projectPath(projectId)}/printout`;
export const logisticsPath = (projectId: string) => `${projectPath(projectId)}/logistics`;
export const prepPath = (projectId: string) => `${projectPath(projectId)}/prep`;
export const beforePath = (projectId: string) => `${projectPath(projectId)}/before`;
export const peoplePath = (projectId: string) => `${projectPath(projectId)}/people`;
