exports.loadPrintStore = async () => {
  globalThis.printCalls.push("load");
  return { snapshot: { version: null, board: { guests: [], jobs: [] }, people: [] } };
};
exports.changePrintStore = async (version, change, actor) => {
  globalThis.printCalls.push({ version, change, actor });
  return { conflict: !!globalThis.printConflict, snapshot: { version: "2026-10-16T15:00:00.000Z" } };
};
exports.uploadPrintTemplate = async () => ({ conflict: false, snapshot: {} });
exports.printJobPdf = async () => globalThis.printPdf ?? null;
