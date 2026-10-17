exports.requireRole = async () => {
  if (!global.socialDashboardAdmin) throw new Error("Forbidden");
  return { user: { id: "admin", role: "admin" } };
};
exports.linkedinSnapshot = async () => ({ followers: 2500, posts: [] });
exports.siteMetrics = async () => ({ connected: false });
