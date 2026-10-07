exports.R2_PUBLIC_URL = "https://images.example.org";
exports.R2_PUBLIC_URL_PREFIXES = ["https://images.example.org"];
exports.putR2Object = async (key, bytes, mime) => {
  globalThis.publicationImageWrites.push({ key, bytes: Buffer.from(bytes), mime });
};
exports.r2PublicUrl = (key) => "https://images.example.org/" + key;
