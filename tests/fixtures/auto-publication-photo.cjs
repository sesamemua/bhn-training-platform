exports.freezePublicationPhoto = async (url) => {
  if (globalThis.failAutoPublicationPhoto) throw new Error("Headshot unavailable");
  return url ? "https://images.example.org/people-publication/frozen.jpg" : null;
};
