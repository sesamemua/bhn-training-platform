exports.R2_PUBLIC_URL = "https://images.example.org";
exports.R2_PUBLIC_URL_PREFIXES = ["https://images.example.org"];
exports.r2PublicUrl = (key) => "https://images.example.org/" + key;
exports.putR2Object = async (key, bytes) => { globalThis.headshotUploads.push({ key, bytes }); };
exports.deleteR2ObjectByUrl = async (url) => { globalThis.headshotDeletes.push(url); };
