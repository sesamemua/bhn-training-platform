import { PAGE_REVIEW_HASH_KEY, PAGE_REVIEW_VIEWER_KEY } from "./access";

export function loaderSource(appOrigin: string): string {
  const base = appOrigin.replace(/\/$/, "");

  return `(function(){
  var KEY = ${JSON.stringify(PAGE_REVIEW_HASH_KEY)};
  var VIEWER_KEY = ${JSON.stringify(PAGE_REVIEW_VIEWER_KEY)};
  var params;
  try { params = new URLSearchParams(window.location.hash.slice(1)); }
  catch (_) { return; }

  var token = params.get(KEY);
  if (!token) return;
  var viewer = params.get(VIEWER_KEY) || "";

  params.delete(KEY);
  params.delete(VIEWER_KEY);
  var remaining = params.toString();
  var cleanUrl = window.location.pathname + window.location.search + (remaining ? "#" + remaining : "");
  window.history.replaceState(window.history.state, "", cleanUrl);

  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) return;

  var existing = document.getElementById("bhn-review-loader-script");
  if (existing) existing.remove();

  var script = document.createElement("script");
  script.id = "bhn-review-loader-script";
  script.src = ${JSON.stringify(base)} + "/api/public/page-review/" + encodeURIComponent(token) + "/overlay.js?t=" + Date.now();
  if (viewer) script.dataset.viewer = viewer;
  script.crossOrigin = "anonymous";
  script.referrerPolicy = "no-referrer";
  (document.head || document.body).appendChild(script);
})();`;
}
