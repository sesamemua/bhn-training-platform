exports.requireRole = async (role) => {
  if (role !== "admin") throw new Error("Expected admin gate");
  return globalThis.peopleActor;
};
