exports.requireRole = async (role) => {
  if (role !== "admin" || !globalThis.workshopAdmin) throw new Error("Forbidden");
  return { user: { id: "admin" } };
};
exports.revalidatePath = (path) => globalThis.workshopRevalidated.push(path);
