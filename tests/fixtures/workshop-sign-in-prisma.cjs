exports.prisma = { workshop: { findUnique: async (query) => {
  globalThis.signInQueries.push(query);
  return globalThis.signInWorkshop;
} } };
