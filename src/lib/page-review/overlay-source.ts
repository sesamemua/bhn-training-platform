import { mentionNotificationsSource } from "./mention-notifications-source";
import { mentionToolsSource } from "./mention-tools-source";
import { reportToolsSource } from "./report-tools-source";
import { findReportTarget } from "../symposium-report/comment-anchors";
import { comparisonSource } from "./comparison-source";
import { contextualSource } from "./contextual-source";
import { createHtmlReviewTargets } from "./html-targets";
import { commentCopySource } from "./comment-copy-source";
import { inlineTextSource } from "./inline-text-source";
import { editableTextNodes, planTextBlockEdits } from "./editable-text";
import { htmlActionsSource } from "./html-actions-source";
import { htmlImageSource } from "./html-image-source";
import { textEditorSource } from "./text-editor-source";
import { inPlaceTextSource } from "./in-place-text-source";
import { textCheckpointSource } from "./text-checkpoint-source";
import { renderTextMarks } from "./text-marks";
import { surfaceAdaptersSource } from "./surface-adapters-source";
import type { ReviewMediaTools } from "./media-tools";

/** JavaScript source for the live-page review overlay. */
export function overlaySource(endpoint: string, title: string, accountRequired = false, reportCommentEndpoint: string | null = null, staffSurface: "report" | "social" = "report", options: { contextualHtml?: boolean; website?: boolean } = {}): string {
  const mediaTools: ReviewMediaTools = {};
  return `(function(){
  var ID = "bhn-review-overlay";
  if (window.__bhnReviewCleanup) window.__bhnReviewCleanup();

  var script = document.currentScript;
  var reportCommentEndpoint = ${JSON.stringify(reportCommentEndpoint)};
  var staffSurface = ${JSON.stringify(staffSurface)};
  var pageSelector = staffSurface === "social" ? "[data-copy-page]" : "[data-print-page]";
  var scopeSelector = (staffSurface === "social" ? "[data-social-review] " : "[data-report-paper] ") + pageSelector;
  var reportReview = !!reportCommentEndpoint && staffSurface === "report";
  var htmlReview = ${JSON.stringify(!!options.contextualHtml)};
  var websiteReview = ${JSON.stringify(!!options.website)};
  var contextualReview = !!reportCommentEndpoint || htmlReview || websiteReview;
  var reviewMediaTools = ${JSON.stringify(mediaTools)};
  var htmlTargets = (function(__name){return (${createHtmlReviewTargets.toString()})(document);})(function(value){return value;});
  var editableTextNodes = ${editableTextNodes.toString()};
  var planTextBlockEdits = (function(__name){return (${planTextBlockEdits.toString()});})(function(value){return value;});
  var renderTextMarks = ${renderTextMarks.toString()};
  var originalTextNodes=htmlReview?editableTextNodes(document):[];
  var originalTextValues=originalTextNodes.map(function(node){return node.data;});
  var originalReviewImages=htmlReview?Array.from(document.querySelectorAll('img')).filter(function(node){return !node.closest('[data-bhn-review-ui],#bhn-review-overlay');}):[];
  var reportTargets = "h1,h2,h3,h4,p,li,blockquote,figcaption,img,td,th,dt,dd,svg,figure,header > span,footer > span,aside > strong";
  var credential = script && script.dataset ? (script.dataset.viewer || "") : "";
  var endpoint = ${JSON.stringify(endpoint)};
  // Pasted documents load this overlay directly, without the website loader.
  if (!credential && !reportCommentEndpoint) {
    var fragment = new URLSearchParams(window.location.hash.slice(1));
    if (fragment.get("bhn-review") === endpoint.split("/").pop()) {
      credential = fragment.get("bhn-reviewer") || "";
    }
  }
  // Somebody who arrived on a share link has no credential in the tag.
  // They can earn one by giving a name — see joinAsGuest below. Kept in
  // sessionStorage so a reload does not ask again in the same sitting.
  try {
    if (!credential && !reportCommentEndpoint) credential = sessionStorage.getItem("bhn-review-viewer:" + endpointKey()) || "";
  } catch (e) { /* storage can be blocked; joining still works. */ }
  var initialTitle = ${JSON.stringify(title)};
  var accountRequired = ${JSON.stringify(accountRequired)};
  var state = {
    review: { title: initialTitle, round: 1, status: "open" },
    viewer: null,
    joining: false,
    comments: [],
    selected: null,
    pickingElement: false,
    insertingSection: false,
    confirmCopy: false,
    confirmedCopy: false,
    copiedRound: null,
    mentionNotice: "",
    draft: "",
    replyTo: null,
    replyDraft: "",
    editingId: null,
    editDraft: "",
    deletingId: null,
    locateFailedId: null,
    error: "",
    loading: true,
    saving: false,
    pendingRender: false,
    panelCollapsed: false,
    historyExpanded: false,
    comparison: null,
    comparisonRound: null,
    comparisonError: "",
    pageRound: script && script.dataset.round ? Number(script.dataset.round) : reportCommentEndpoint || htmlReview ? 0 : null,
    copyText: "",
    expandedThreads: {}
  };
  var mentionDeepLink = new URLSearchParams(window.location.search).get("comment");
  var markers = [];
  var pollTimer = null;
  var positionFrame = null;
  var threadHighlight = null;
  var highlightedNode = null;
  var panelPosition = null;
  var panelDrag = null;
  var panelResize = null;
  var comparisonDialog = null;
  var comparisonCleanup = null;
  // Width is the reviewer's choice and sticks per browser. The default
  // matches the CSS; MIN keeps the two-line meta readable, MAX stops the
  // panel swallowing the page it is meant to be reviewing.
  var PANEL_WIDTH_KEY = "bhn-review-panel-width";
  var PANEL_WIDTH_DEFAULT = 304;
  var PANEL_WIDTH_MIN = 240;
  var panelWidth = readStoredWidth();

  var style = document.createElement("style");
  style.id = ID + "-styles";
  style.textContent = [
    "#" + ID + "{position:fixed;right:10px;bottom:10px;z-index:2147483647;width:min(304px,calc(100vw - 20px));max-height:calc(100vh - 20px);font:12px/1.35 -apple-system,BlinkMacSystemFont,Segoe UI,system-ui,sans-serif;color:#17212b;transition:width .16s ease;}",
    "#" + ID + ".bhn-rv-root-collapsed{width:106px;}",
    "#" + ID + " *{box-sizing:border-box;letter-spacing:0;}",
    "#" + ID + " button,#" + ID + " textarea{font:inherit;}",
    "#" + ID + " button{cursor:pointer;}",
    ".bhn-rv-resize{position:absolute;top:0;left:-4px;width:10px;height:100%;z-index:3;cursor:ew-resize;touch-action:none;background:transparent;border:0;padding:0;}.bhn-rv-resize:hover::after,.bhn-rv-root-resizing .bhn-rv-resize::after{content:'';position:absolute;top:10px;bottom:10px;left:4px;width:3px;border-radius:3px;background:rgba(23,104,121,.55);}.bhn-rv-root-resizing{user-select:none;-webkit-user-select:none;}#" + ID + ".bhn-rv-root-resizing{transition:none;}",
    ".bhn-rv-shell{position:relative;display:flex;max-height:calc(100vh - 20px);flex-direction:column;overflow:hidden;border:1px solid rgba(151,166,176,.72);border-radius:7px;background:rgba(247,249,250,.8);box-shadow:0 12px 34px rgba(7,27,39,.2);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);}",
    ".bhn-rv-head{display:flex;align-items:center;gap:5px;padding:7px;background:rgba(11,53,88,.88);color:#fff;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;}.bhn-rv-root-dragging .bhn-rv-head{cursor:grabbing;}.bhn-rv-drag-handle{width:10px;height:14px;flex:0 0 auto;background:radial-gradient(circle,rgba(255,255,255,.72) 1px,transparent 1.5px) 0 0/4px 4px;opacity:.8;}.bhn-rv-head-copy{min-width:0;flex:1;}.bhn-rv-kicker{font-size:8px;font-weight:800;text-transform:uppercase;opacity:.68;}.bhn-rv-title{overflow:hidden;font-size:12px;font-weight:780;text-overflow:ellipsis;white-space:nowrap;}.bhn-rv-meta{overflow:hidden;margin-top:1px;font-size:9px;opacity:.76;text-overflow:ellipsis;white-space:nowrap;}",
    ".bhn-rv-icon-btn{display:grid;height:26px;min-width:26px;flex:0 0 auto;place-items:center;border:0;border-radius:5px;background:rgba(255,255,255,.11);padding:0 6px;color:#fff;font-weight:800;line-height:1;}.bhn-rv-icon-btn:hover{background:rgba(255,255,255,.2);}.bhn-rv-collapse{font-size:11px;}.bhn-rv-shell-collapsed .bhn-rv-head{padding:5px;}.bhn-rv-shell-collapsed .bhn-rv-head-copy,.bhn-rv-shell-collapsed .bhn-rv-body{display:none;}",
    ".bhn-rv-locked{border-color:#e2cf9a;background:rgba(255,250,235,.92);color:#6b551f;}.bhn-rv-body{overflow:auto;padding:6px;overscroll-behavior:contain;}.bhn-rv-notice{padding:7px;border:1px solid #d8e0e5;border-radius:5px;background:rgba(255,255,255,.84);color:#4a5864;font-size:11px;}.bhn-rv-error{border-color:#f0b7b7;background:rgba(255,243,243,.9);color:#8c2020;}",
    ".bhn-rv-compose{margin-bottom:6px;padding:7px;border:1px solid #9bc6d2;border-radius:6px;background:rgba(237,248,250,.88);}.bhn-rv-compose-label{font-size:10px;font-weight:800;color:#245866;}.bhn-rv-quote{max-height:132px;overflow:auto;overscroll-behavior:contain;margin:4px 0 6px;padding-left:6px;border-left:2px solid #2c7587;color:#41515c;font-size:10px;line-height:1.3;}.bhn-rv-textarea{display:block;width:100%;min-height:58px;max-height:260px;overflow-y:auto;resize:vertical;border:1px solid #b9c5cc;border-radius:5px;background:rgba(255,255,255,.92);padding:6px;color:#17212b;outline:none;}.bhn-rv-textarea:focus{border-color:#2c7587;box-shadow:0 0 0 2px rgba(44,117,135,.14);}",
    ".bhn-rv-actions{display:flex;align-items:center;justify-content:flex-end;gap:5px;margin-top:5px;}.bhn-rv-btn{min-height:27px;border:1px solid #c6d0d6;border-radius:5px;background:rgba(255,255,255,.88);padding:4px 8px;color:#34434e;font-size:10px;font-weight:750;}.bhn-rv-btn:hover{background:#f0f4f6;}.bhn-rv-btn-primary{border-color:#176879;background:#176879;color:#fff;}.bhn-rv-btn-primary:hover{background:#105565;}.bhn-rv-btn-danger{border-color:#b64a4a;background:#a53b3b;color:#fff;}.bhn-rv-btn-danger:hover{background:#8d2f2f;}.bhn-rv-btn:disabled{cursor:not-allowed;opacity:.55;}",
    "body:has(#" + ID + "[data-picking-element=true]) [data-report-paper] [data-print-page],body:has(#" + ID + "[data-picking-element=true]) [data-report-paper] [data-print-page] *{cursor:crosshair!important;}body:has(#" + ID + "[data-report-commenting=true]) [data-report-paper] [data-print-page] figcaption,body:has(#" + ID + "[data-report-commenting=true]) [data-report-paper]:not([data-photo-editable]) [data-print-page] img{cursor:crosshair;pointer-events:auto;}body:has(#" + ID + "[data-report-commenting=true]) [data-report-paper] [data-print-page]::before,body:has(#" + ID + "[data-report-commenting=true]) [data-report-paper] [data-print-page]::after{pointer-events:none;}.bhn-rv-element-pick{width:100%;margin:6px 0;}.bhn-rv-element-pick[aria-pressed=true]{border-color:#176879;background:#176879;color:#fff;}",
    ".bhn-rv-list{display:grid;gap:5px;}.bhn-rv-empty{padding:11px 7px;text-align:center;color:#667580;font-size:10px;}.bhn-rv-thread{border:1px solid rgba(189,201,209,.85);border-radius:6px;background:rgba(255,255,255,.84);overflow:hidden;}.bhn-rv-thread-active{border-color:#2c7587;box-shadow:0 0 0 2px rgba(44,117,135,.12);}.bhn-rv-thread-summary{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:stretch;}.bhn-rv-thread-toggle{display:grid;width:100%;min-width:0;grid-template-columns:20px minmax(0,1fr) auto;align-items:start;gap:6px;border:0;background:transparent;padding:6px;text-align:left;color:#17212b;}.bhn-rv-thread-toggle:hover{background:rgba(227,239,243,.72);}.bhn-rv-thread-locate{min-width:50px;border:0;border-left:1px solid rgba(205,216,222,.82);background:rgba(244,248,249,.74);padding:4px 6px;color:#176879;font-size:9px;font-weight:800;white-space:nowrap;}.bhn-rv-thread-locate:hover,.bhn-rv-thread-locate:focus-visible{background:rgba(218,235,239,.88);outline:0;}.bhn-rv-thread-locate:disabled{color:#8a5e23;cursor:default;}.bhn-rv-number{display:grid;width:20px;height:20px;place-items:center;border-radius:50%;background:#176879;color:#fff;font-size:9px;font-weight:800;}.bhn-rv-thread-main{min-width:0;}.bhn-rv-thread-line{display:flex;min-width:0;align-items:center;gap:5px;}.bhn-rv-author{min-width:0;overflow:hidden;flex:1;color:#1c2b35;font-size:10px;font-weight:800;text-overflow:ellipsis;white-space:nowrap;}.bhn-rv-time{color:#84919a;font-size:8px;font-weight:550;white-space:nowrap;}.bhn-rv-status{border-radius:999px;background:#e9f6ed;padding:1px 4px;color:#2e6f42;font-size:8px;font-weight:800;text-transform:uppercase;}.bhn-rv-status-resolved{background:#eef1f3;color:#64717a;}.bhn-rv-thread-preview{overflow:hidden;margin-top:2px;color:#3b4b55;font-size:10px;text-overflow:ellipsis;white-space:nowrap;}.bhn-rv-disclosure{padding-top:2px;color:#71808a;font-size:12px;}",
    ".bhn-rv-thread-details{border-top:1px solid rgba(220,228,232,.8);padding-top:6px;}.bhn-rv-thread-body{padding:0 7px 6px;white-space:pre-wrap;color:#2f3e48;font-size:11px;}.bhn-rv-thread-quote{max-height:132px;overflow:auto;overscroll-behavior:contain;margin:0 7px 6px;padding:4px 6px;border-left:2px solid #b7c8d1;background:rgba(245,248,249,.82);color:#60707b;font-size:9px;}.bhn-rv-thread-tools{display:flex;justify-content:flex-end;gap:2px;padding:0 7px 5px;}.bhn-rv-link-btn{border:0;background:transparent;padding:2px 4px;color:#176879;font-size:10px;font-weight:800;}.bhn-rv-link-btn:hover{text-decoration:underline;}.bhn-rv-link-btn-danger{color:#9b3030;}.bhn-rv-edit-compose{margin:0 7px 6px;}.bhn-rv-delete-confirm{margin:0 7px 6px;border-top:1px solid #ead4d4;padding-top:5px;}.bhn-rv-delete-copy{color:#7d3030;font-size:10px;}",
    ".bhn-rv-replies{margin:0 7px 6px 28px;border-left:2px solid #dce4e8;padding-left:6px;}.bhn-rv-reply{padding:4px 0;border-top:1px solid #edf0f2;}.bhn-rv-reply:first-child{border-top:0;}.bhn-rv-reply-head{display:flex;align-items:center;gap:4px;}.bhn-rv-reply-meta{min-width:0;flex:1;color:#6c7982;font-size:9px;font-weight:750;}.bhn-rv-reply-tools{display:flex;flex:0 0 auto;}.bhn-rv-reply-body{margin-top:1px;white-space:pre-wrap;color:#34434e;font-size:10px;}.bhn-rv-reply .bhn-rv-edit-compose,.bhn-rv-reply .bhn-rv-delete-confirm{margin:4px 0 0;}.bhn-rv-reply-compose{margin:0 7px 6px 28px;}",
    ".bhn-review-highlight{position:fixed;z-index:2147483645;display:none;pointer-events:none;border:2px solid #2c7587;border-radius:3px;background:rgba(44,117,135,.12);}.bhn-review-highlight-flash{animation:bhn-review-flash .16s linear 5;}@keyframes bhn-review-flash{0%,100%{border-color:#2c7587;background:rgba(44,117,135,.12);box-shadow:0 0 0 0 rgba(238,166,54,0)}50%{border-color:#eea636;background:rgba(238,166,54,.34);box-shadow:0 0 0 6px rgba(238,166,54,.3)}}",
    ".bhn-review-marker{position:fixed;z-index:2147483646;display:grid;width:25px;height:25px;place-items:center;border:2px solid #fff;border-radius:50%;background:#176879;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.28);font:800 11px/1 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;}.bhn-review-marker:hover{transform:scale(1.08);}.bhn-review-marker-resolved{background:#74818a;}",
    "@media(max-width:540px){#" + ID + "{right:8px;bottom:8px;max-height:calc(100vh - 16px);}.bhn-rv-shell{max-height:calc(100vh - 16px);}}"
  ].join("");
  document.head.appendChild(style);

  var root = document.createElement("aside");
  root.id = ID;
  root.setAttribute("aria-label", reportCommentEndpoint ? (staffSurface === "social" ? "Social post comments" : "Event report comments") : "BioHubNet website review");
  document.body.appendChild(root);
  root.addEventListener("keydown", function(event){
    if (state.pickingElement && event.key === "Escape") {
      event.preventDefault();
      state.pickingElement = false;
      render();
      root.querySelector(".bhn-rv-element-pick")?.focus({ preventScroll: true });
    }
  });

  style.textContent += "#" + ID + " .bhn-rv-history{margin-top:8px;border-top:1px solid #c6d0d6;padding-top:8px;}#" + ID + " .bhn-rv-history>summary{cursor:pointer;font-weight:750;padding:5px 0;}#" + ID + " .bhn-rv-history .bhn-rv-list{margin-top:5px;}#" + ID + " .bhn-rv-compare-open{width:100%;margin-bottom:8px;}" +
    "#" + ID + "-compare{box-sizing:border-box;width:calc(100vw - 24px);max-width:1600px;height:calc(100vh - 24px);max-height:none;margin:auto;padding:0;border:1px solid #b9c5cc;border-radius:8px;background:#f0f4f6;color:#17212b;font:14px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,system-ui,sans-serif;}#" + ID + "-compare[open]{display:flex;flex-direction:column;}#" + ID + "-compare::backdrop{background:rgba(7,27,39,.55);}#" + ID + "-compare .bhn-rv-compare-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;}#" + ID + "-compare h2{font:inherit;font-size:16px;font-weight:700;color:#17212b;margin:0;}#" + ID + "-compare button{font:inherit;cursor:pointer;padding:6px 12px;border:1px solid #b9c5cc;border-radius:5px;background:#fff;color:#17212b;}#" + ID + "-compare .bhn-rv-compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 12px 12px;flex:1;min-height:0;overflow:auto;}#" + ID + "-compare section{display:flex;flex-direction:column;min-width:0;min-height:0;}#" + ID + "-compare h3{font-size:13px;margin:0 0 8px;}#" + ID + "-compare iframe{width:100%;flex:1;min-height:0;border:1px solid #d8e0e5;background:#fff;}@media(max-width:600px){#" + ID + "-compare .bhn-rv-compare-grid{grid-template-columns:repeat(2,minmax(280px,1fr));}}";

  style.textContent += "#" + ID + "-compare .bhn-rv-compare-legend{display:flex;gap:14px;flex-wrap:wrap;padding:0 16px 10px;font-size:12px;font-weight:700;}#" + ID + "-compare .bhn-rv-diff-removed{background:#ffe4e6;color:#881337;padding:2px 6px;}#" + ID + "-compare .bhn-rv-diff-added{background:#dcfce7;color:#14532d;padding:2px 6px;}#" + ID + "-compare .bhn-rv-compare-grid{grid-template-rows:max-content;align-items:start;align-content:start;}#" + ID + "-compare section{display:block;}#" + ID + "-compare h3{position:sticky;top:0;z-index:1;background:#f0f4f6;padding:5px 0;}#" + ID + "-compare iframe{display:block;flex:none;height:150px;border:0;outline:1px solid #d8e0e5;}";
  if (reportCommentEndpoint) style.textContent += "@media(prefers-reduced-motion:reduce){.bhn-review-highlight-flash{animation:none;}}";
  style.textContent += "#" + ID + "-compare{overflow:hidden;}#" + ID + "-compare .bhn-rv-compare-controls{display:flex;align-items:end;gap:12px;flex-wrap:wrap;padding:0 16px 12px;}#" + ID + "-compare fieldset{border:0;margin:0;padding:0;display:flex;gap:10px;flex-wrap:wrap;}#" + ID + "-compare legend{font-weight:700;margin-bottom:6px;}#" + ID + "-compare label{display:flex;align-items:center;gap:5px;min-height:32px;}#" + ID + "-compare button:disabled{opacity:.45;cursor:default;}#" + ID + "-compare .bhn-rv-compare-notice{margin:0;font-size:12px;}#" + ID + "-compare .bhn-rv-version-canvas{overflow:hidden;position:relative;width:100%;}#" + ID + "-compare iframe{transform-origin:top left;}@media(max-width:700px){#" + ID + "-compare .bhn-rv-compare-grid{grid-template-columns:1fr!important;}}";

  var highlight = document.createElement("div");
  highlight.setAttribute("class", "bhn-review-highlight");
  document.body.appendChild(highlight);

  function make(tag, classValue, text) {
    var node = document.createElement(tag);
    if (classValue) node.setAttribute("class", classValue);
    if (typeof text === "string") node.textContent = text;
    return node;
  }

  function readStoredWidth() {
    try {
      var raw = parseInt(window.localStorage.getItem(PANEL_WIDTH_KEY), 10);
      return isNaN(raw) ? null : raw;
    } catch (_) { return null; }
  }

  function maxPanelWidth() {
    var margin = window.innerWidth <= 540 ? 8 : 10;
    return Math.max(PANEL_WIDTH_MIN, Math.min(720, window.innerWidth - (margin * 2)));
  }

  /** Width the panel should occupy right now, collapsed state included. */
  function effectivePanelWidth() {
    if (state.panelCollapsed) return Math.min(106, window.innerWidth - 20);
    var w = panelWidth === null ? PANEL_WIDTH_DEFAULT : panelWidth;
    return Math.min(Math.max(PANEL_WIDTH_MIN, w), maxPanelWidth());
  }

  function applyPanelWidth() {
    if (reportReview && root.hasAttribute("data-docked")) return;
    if (state.panelCollapsed || panelWidth === null) {
      root.style.width = "";   // fall back to the stylesheet
      return;
    }
    root.style.width = effectivePanelWidth() + "px";
  }

  function movePanelResize(event) {
    if (!panelResize || event.pointerId !== panelResize.pointerId) return;
    // The left edge is the grab point, so the right edge must stay put:
    // dragging left widens by exactly the distance travelled.
    var next = Math.min(Math.max(PANEL_WIDTH_MIN, panelResize.startWidth + (panelResize.startX - event.clientX)), maxPanelWidth());
    panelWidth = next;
    applyPanelWidth();
    // Size any prefilled box (an edit draft, a restored reply) now that it is
    // in the document — scrollHeight reads 0 while the node is detached.
    Array.prototype.forEach.call(root.querySelectorAll(".bhn-rv-textarea"), autoGrow);
    // When the panel has been dragged it is anchored by left, so left has
    // to follow the width to keep the right edge still.
    if (panelPosition) {
      panelPosition.left = panelResize.startRight - next;
      constrainPanel();
    }
    event.preventDefault();
  }

  function stopPanelResize(event) {
    if (!panelResize || (event && event.pointerId !== panelResize.pointerId)) return;
    window.removeEventListener("pointermove", movePanelResize);
    window.removeEventListener("pointerup", stopPanelResize);
    window.removeEventListener("pointercancel", stopPanelResize);
    panelResize = null;
    root.classList.remove("bhn-rv-root-resizing");
    try { window.localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth)); } catch (_) {}
  }

  function startPanelResize(event) {
    if (event.button !== undefined && event.button !== 0) return;
    var rect = root.getBoundingClientRect();
    panelResize = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: rect.width,
      startRight: rect.right
    };
    root.classList.add("bhn-rv-root-resizing");
    window.addEventListener("pointermove", movePanelResize, { passive: false });
    window.addEventListener("pointerup", stopPanelResize);
    window.addEventListener("pointercancel", stopPanelResize);
    event.preventDefault();
    event.stopPropagation();
  }

  function constrainPanel() {
    if (reportReview && root.hasAttribute("data-docked")) return;
    if (!panelPosition) return;
    var margin = window.innerWidth <= 540 ? 8 : 10;
    var targetWidth = Math.min(effectivePanelWidth(), window.innerWidth - (margin * 2));
    var rect = root.getBoundingClientRect();
    var maxLeft = Math.max(margin, window.innerWidth - targetWidth - margin);
    var maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    panelPosition.left = Math.min(Math.max(margin, panelPosition.left), maxLeft);
    panelPosition.top = Math.min(Math.max(margin, panelPosition.top), maxTop);
    root.style.right = "auto";
    root.style.bottom = "auto";
    root.style.left = panelPosition.left + "px";
    root.style.top = panelPosition.top + "px";
  }

  function movePanel(event) {
    if (!panelDrag || event.pointerId !== panelDrag.pointerId) return;
    panelPosition.left = event.clientX - panelDrag.offsetX;
    panelPosition.top = event.clientY - panelDrag.offsetY;
    constrainPanel();
    event.preventDefault();
  }

  function stopPanelDrag(event) {
    if (!panelDrag || (event && event.pointerId !== panelDrag.pointerId)) return;
    window.removeEventListener("pointermove", movePanel);
    window.removeEventListener("pointerup", stopPanelDrag);
    window.removeEventListener("pointercancel", stopPanelDrag);
    panelDrag = null;
    root.classList.remove("bhn-rv-root-dragging");
  }

  function startPanelDrag(event) {
    if (reportReview && root.hasAttribute("data-docked")) return;
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target && event.target.closest && event.target.closest("button")) return;
    var rect = root.getBoundingClientRect();
    panelPosition = { left: rect.left, top: rect.top };
    panelDrag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    root.classList.add("bhn-rv-root-dragging");
    constrainPanel();
    window.addEventListener("pointermove", movePanel, { passive: false });
    window.addEventListener("pointerup", stopPanelDrag);
    window.addEventListener("pointercancel", stopPanelDrag);
    event.preventDefault();
  }

  function cleanText(value) {
    return String(value || "").trim().replace(/\\s+/g, " ");
  }

  function classTokens(node) {
    return node && node.classList ? Array.prototype.slice.call(node.classList).filter(Boolean) : [];
  }

  function cssIdent(value) {
    var raw = String(value || "");
    if (!raw) return "";
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(raw);
    return /^-?[_a-zA-Z]+[_a-zA-Z0-9-]*$/.test(raw) ? raw : "";
  }

  function cssPath(node, structureOnly) {
    var parts = [], guard = 0;
    while (node && node.nodeType === 1 && node !== document.body && guard++ < 9) {
      var segment = node.tagName.toLowerCase();
      var escapedId = cssIdent(node.id);
      if (escapedId) { parts.unshift(segment + "#" + escapedId); break; }
      var classes = structureOnly ? [] : classTokens(node).map(cssIdent).filter(Boolean).slice(0, 2);
      if (classes.length) segment += "." + classes.join(".");
      var siblings = node.parentNode ? Array.prototype.filter.call(node.parentNode.children, function(child){ return child.tagName === node.tagName; }) : [];
      if (siblings.length > 1) segment += ":nth-of-type(" + (siblings.indexOf(node) + 1) + ")";
      parts.unshift(segment);
      node = node.parentNode;
    }
    return parts.join(" > ");
  }

  function keyOf(node) {
    var escapedId = cssIdent(node.id);
    if (escapedId) return "#" + escapedId;
    var classes = classTokens(node).map(cssIdent).filter(Boolean);
    var pick = classes.filter(function(value){ return value.length > 6; })[0] || classes[0];
    var selector = pick ? node.tagName.toLowerCase() + "." + pick : node.tagName.toLowerCase();
    try { return document.querySelectorAll(selector).length === 1 ? selector : null; }
    catch (_) { return null; }
  }

  function blockOf(node) {
    var blocks = Array.prototype.slice.call(document.querySelectorAll(".wpb_raw_html, .vc_raw_html"));
    var guard = 0;
    while (node && node.nodeType === 1 && guard++ < 12) {
      var index = blocks.indexOf(node);
      if (index > -1) return "vc_raw_html #" + (index + 1);
      node = node.parentNode;
    }
    return null;
  }

  function inOverlay(node) {
    return !node || (reportCommentEndpoint && !node.closest?.(scopeSelector)) || root.contains(node) || node.closest?.("[data-bhn-review-ui],.bhn-rv-mention-popup,.bhn-rv-tag-history,.bhn-rv-tag-launcher") || (comparisonDialog && comparisonDialog.contains(node)) || node === highlight || (node.closest && node.closest(".bhn-review-marker"));
  }

  function anchorsFor(node) {
    if (htmlReview) return htmlTargets.capture(node);
    var quote = cleanText(node.innerText || node.textContent || node.getAttribute?.("alt")).slice(0, 600);
    if (reportCommentEndpoint) {
      var page = node.closest(pageSelector);
      var selection = window.getSelection();
      var selected = selection && node.contains(selection.anchorNode) && node.contains(selection.focusNode) ? cleanText(selection.toString()).slice(0, 600) : "";
      return { anchorQuote: selected || (node === page ? null : quote || node.getAttribute("alt") || null), anchorKey: "#" + page.parentElement.id,
        anchorPath: cssPath(node, reportReview), anchorBlock: (page.getAttribute("aria-label") || "").slice(0, 200) };
    }
    return {
      anchorQuote: quote || null,
      anchorKey: keyOf(node),
      anchorPath: cssPath(node),
      anchorBlock: blockOf(node)
    };
  }

  function anchorTextMatches(node, quote) {
    if (!quote) return true;
    var text = cleanText(node.innerText || node.textContent || (reportReview && node.getAttribute("alt")));
    return text === quote || (quote.length > 20 && text.indexOf(quote) > -1);
  }

  function safeQuery(selector, quote) {
    if (!selector) return null;
    try {
      var nodes = Array.prototype.slice.call(document.querySelectorAll(selector)).filter(function(node){ return !inOverlay(node); });
      for (var i = 0; i < nodes.length; i++) {
        if (anchorTextMatches(nodes[i], quote)) return nodes[i];
      }
      return !quote && nodes.length === 1 ? nodes[0] : null;
    } catch (_) { return null; }
  }

  var findReportTarget = ${findReportTarget.toString()};
  function findAnchor(comment) {
    if (htmlReview) return comment.anchorKey && comment.anchorKey.startsWith("bhn-html:")
      ? htmlTargets.find(comment) : htmlTargets.findLegacy(comment, comment.round === state.pageRound);
    var quote = cleanText(comment.anchorQuote);
    if (reportCommentEndpoint) {
      var verifiedTarget = reportReview && findReportTarget(document, comment.anchorTarget);
      if (verifiedTarget) return verifiedTarget;
      var reportMatch = safeQuery(comment.anchorPath, quote);
      if (reportMatch && (!comment.anchorKey || reportMatch.closest(pageSelector).parentElement.id === comment.anchorKey.slice(1))) return reportMatch;
      var sheet = comment.anchorKey && document.getElementById(comment.anchorKey.slice(1));
      if(!sheet&&reportReview&&/^#report-frame-publication-team-/.test(comment.anchorKey||''))sheet=document.getElementById('report-frame-publication-leadership-0');
      var passage = pageSelector + " :is(" + (reportReview ? reportTargets : "h1,h2,h3,h4,p,li,blockquote,figcaption,td") + ")";
      if (quote) {
        var find = function (root) {
          return Array.from(root.querySelectorAll(passage)).find(function(node){
            if (reportReview && comment.anchorKey) {
              var section = /^#report-frame-(.+)-\\d+$/.exec(comment.anchorKey);
              var frame = node.closest(pageSelector).parentElement.id;
              if (section && !frame.startsWith('report-frame-' + section[1].replace(/^publication-team$/, 'publication-leadership') + '-')) return false;
            }
            var text = cleanText(node.textContent || (reportReview && node.getAttribute("alt")));
            // Editorial line breaks replace the old dot separators in mentor profiles.
            var comparable = function(value){ return value.replace(/[·\\s]+/g, " ").trim().toLocaleLowerCase(); };
            return text === quote || (reportReview && comparable(text) === comparable(quote)) || (quote.length > 20 && (text.includes(quote) || (reportReview && comparable(text).includes(comparable(quote)))));
          });
        };
        var match = (sheet && find(sheet)) || find(document);
        if (match) return match;
      }
      return quote ? null : safeQuery(comment.anchorPath, "") || (sheet && sheet.querySelector(pageSelector));
    }
    var node = safeQuery(comment.anchorPath, quote) || safeQuery(comment.anchorKey, quote);
    if (node) return node;
    if (quote) {
      var candidates = document.querySelectorAll("h1,h2,h3,h4,h5,p,a,button,li,label,blockquote,figcaption");
      for (var i = 0; i < candidates.length; i++) {
        if (!inOverlay(candidates[i]) && anchorTextMatches(candidates[i], quote)) return candidates[i];
      }
    }
    return quote ? null : safeQuery(comment.anchorPath, "") || safeQuery(comment.anchorKey, "");
  }

  function showHighlight(node) {
    if (!node || !node.isConnected) {
      highlightedNode = null;
      highlight.style.display = "none";
      return;
    }
    highlightedNode = node;
    // Scaled photographs are clipped by their mat: highlight the visible crop, not the enlarged bitmap.
    var photoFrame = node.tagName === "IMG" && node.closest("figure[data-report-photo]");
    var rect = (photoFrame ? photoFrame.firstElementChild : node).getBoundingClientRect();
    highlight.style.display = "block";
    highlight.style.top = rect.top + "px";
    highlight.style.left = rect.left + "px";
    highlight.style.width = rect.width + "px";
    highlight.style.height = rect.height + "px";
  }

  function flashHighlight(node) {
    if (!node) return;
    showHighlight(node);
    highlight.classList.remove("bhn-review-highlight-flash");
    void highlight.offsetWidth;
    highlight.classList.add("bhn-review-highlight-flash");
  }

  function focusPageElement(node) {
    var needsTabIndex = !node.matches("a[href],button,input,select,textarea,[tabindex]");
    if (needsTabIndex) node.setAttribute("tabindex", "-1");
    try { node.focus({ preventScroll: true }); }
    catch (_) { try { node.focus(); } catch (_) {} }
    if (needsTabIndex) {
      window.setTimeout(function(){
        if (node.isConnected && node.getAttribute("tabindex") === "-1") node.removeAttribute("tabindex");
      }, 1500);
    }
  }

  function bringCommentIntoView(comment) {
    var anchor = findAnchor(comment);
    if (!anchor) return false;
    threadHighlight = anchor;
    highlight.classList.remove("bhn-review-highlight-flash");
    showHighlight(anchor);
    try { anchor.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" }); }
    catch (_) { anchor.scrollIntoView(); }

    var startedAt = Date.now();
    var lastPosition = "";
    var stableFrames = 0;
    function finishWhenSettled() {
      if (!anchor.isConnected) {
        showHighlight(null);
        return;
      }
      var rect = anchor.getBoundingClientRect();
      var position = Math.round(rect.left) + ":" + Math.round(rect.top);
      stableFrames = position === lastPosition ? stableFrames + 1 : 0;
      lastPosition = position;
      if (stableFrames >= 3 || Date.now() - startedAt > 1200) {
        focusPageElement(anchor);
        flashHighlight(anchor);
        return;
      }
      window.requestAnimationFrame(finishWhenSettled);
    }
    window.requestAnimationFrame(finishWhenSettled);
    return true;
  }

  function topComments() {
    return state.comments.filter(function(comment){ return !comment.parentId; });
  }

  ${comparisonSource()}

  function comparisonKey() {
    return "bhn-review-comparison-dismissed:" + endpointKey() + ":" + state.review.round;
  }

  function openComparison() {
    if (!state.comparison) return;
    try { sessionStorage.removeItem(comparisonKey()); } catch (_) {}
    if (comparisonDialog) { comparisonDialog.showModal(); return; }
    var dialog = make("dialog");
    comparisonDialog = dialog;
    dialog.id = ID + "-compare";
    dialog.setAttribute("aria-labelledby", ID + "-compare-title");
    var head = make("div", "bhn-rv-compare-head");
    var title = make("h2", "", "Round " + state.review.round + " · Before / after");
    title.id = ID + "-compare-title";
    head.appendChild(title);
    head.appendChild(addButton("Close comparison", "", function(){ dialog.close(); }));
    dialog.appendChild(head);
    var controls = make("form", "bhn-rv-compare-controls");
    var picker = make("fieldset");
    picker.appendChild(make("legend", "", "Select 2–4 saved rounds"));
    var selectedVersions = state.comparison.versions || [
      { round: state.review.round - 1, html: state.comparison.beforeHtml },
      { round: state.review.round, html: state.comparison.afterHtml }
    ];
    var availableRounds = state.comparison.availableRounds || selectedVersions.map(function(version){ return version.round; });
    var inputs = [];
    availableRounds.forEach(function(round){
      var label = make("label");
      var input = make("input"); input.type = "checkbox"; input.value = String(round);
      input.checked = selectedVersions.some(function(version){ return version.round === round; });
      label.appendChild(input); label.appendChild(document.createTextNode("Round " + round));
      picker.appendChild(label); inputs.push(input);
    });
    controls.appendChild(picker);
    var compare = make("button", "", "Compare selected rounds"); compare.type = "submit";
    controls.appendChild(compare);
    var notice = make("p", "bhn-rv-compare-notice"); notice.setAttribute("role", "status");
    controls.appendChild(notice);
    function updatePicker() {
      var count = inputs.filter(function(input){ return input.checked; }).length;
      compare.disabled = count < 2 || count > 4;
      inputs.forEach(function(input){ input.disabled = !input.checked && count >= 4; });
    }
    picker.addEventListener("change", updatePicker); updatePicker();
    controls.addEventListener("submit", async function(event){
      event.preventDefault();
      var rounds = inputs.filter(function(input){ return input.checked; }).map(function(input){ return Number(input.value); });
      if (rounds.length < 2 || rounds.length > 4) return;
      picker.disabled = true; compare.disabled = true; notice.textContent = "Loading selected rounds…";
      try {
        var response = await fetch(endpoint + "?comparison=1&rounds=" + rounds.join(","), { headers: { "Authorization": "Bearer " + credential } });
        var data = await response.json().catch(function(){ return {}; });
        if (!response.ok || !data.ok || !data.comparison) throw new Error(data.error || "Could not load these rounds.");
        if (state.review.round !== data.review.round || comparisonDialog !== dialog) throw new Error("The review changed. Close and reopen comparison.");
        state.comparison = data.comparison;
        if (comparisonCleanup) comparisonCleanup();
        dialog.remove(); comparisonDialog = null; comparisonCleanup = null;
        openComparison();
      } catch (error) { notice.textContent = error.message; picker.disabled = false; updatePicker(); }
    });
    dialog.appendChild(controls);
    var legend = make("div", "bhn-rv-compare-legend");
    legend.appendChild(make("span", "bhn-rv-diff-removed", "− Removed between first and last selected round"));
    legend.appendChild(make("span", "bhn-rv-diff-added", "+ Added since first selected round"));
    dialog.appendChild(legend);
    var grid = make("div", "bhn-rv-compare-grid");
    grid.setAttribute("tabindex", "0");
    grid.setAttribute("role", "region");
    grid.setAttribute("aria-label", "Selected rounds; one shared scroll area");
    grid.style.gridTemplateColumns = "repeat(" + selectedVersions.length + ",minmax(0,1fr))";
    if (reportCommentEndpoint) grid.style.setProperty("grid-template-columns", "repeat(" + selectedVersions.length + ",minmax(270px,1fr))", "important");
    var versions = selectedVersions.map(function(version, index){
      return index === 0 ? comparisonDocuments(version.html, selectedVersions[selectedVersions.length - 1].html)[0] : comparisonDocuments(selectedVersions[0].html, version.html)[1];
    });
    var frames = [];
    var canvases = [], sizes = [];
    var reportImages = new Map();
    async function reportFrameHtml(html) {
      // The sandbox cannot send staff cookies. Fetch same-origin report thumbnails in the parent.
      var doc = new DOMParser().parseFromString(html, "text/html");
      await Promise.all(Array.from(doc.images).map(async function(img){
        var asset = new URL(img.src);
        if (asset.origin !== window.location.origin || !asset.pathname.startsWith(endpoint.slice(0, -7) + "/assets/")) {
          img.removeAttribute("src");
          return;
        }
        if (!reportImages.has(asset.href)) reportImages.set(asset.href, (async function(){
          var response = await fetch(asset.href, { redirect: "error", signal: AbortSignal.timeout(5000) });
          if (!response.ok) return null;
          var bitmap = await createImageBitmap(await response.blob());
          try {
            var canvas = document.createElement("canvas");
            var ratio = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
            canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
            canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
            canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL("image/jpeg", .8);
          } finally { bitmap.close(); }
        })().catch(function(){ return null; }));
        var thumbnail = await reportImages.get(asset.href);
        if (thumbnail) img.src = thumbnail;
        else img.removeAttribute("src");
      }));
      return "<!doctype html>" + doc.documentElement.outerHTML;
    }
    selectedVersions.forEach(function(version, index){
      var label = (index === 0 ? "Before" : "After") + " · Round " + version.round;
      var pane = make("section");
      pane.appendChild(make("h3", "", label));
      var frame = make("iframe");
      frame.title = label;
      // Opaque origin; CSP permits only our sizing bridge, never newsletter scripts.
      frame.setAttribute("sandbox", "allow-scripts");
      frame.setAttribute("referrerpolicy", "no-referrer");
      frame.setAttribute("scrolling", "no");
      frame.style.width = reportCommentEndpoint ? "100%" : "640px";
      if (reportCommentEndpoint && staffSurface === "report") {
        reportFrameHtml(versions[index].html).then(function(html){
          if (frame.isConnected) frame.srcdoc = html;
        });
      } else frame.srcdoc = versions[index].html;
      frames.push(frame);
      var canvas = make("div", "bhn-rv-version-canvas");
      sizes.push({ width: 640, height: 150 }); canvases.push(canvas);
      canvas.appendChild(frame); pane.appendChild(canvas);
      grid.appendChild(pane);
    });
    function fitComparison() {
      frames.forEach(function(frame, index){
        var scale = reportCommentEndpoint ? 1 : Math.min(1, canvases[index].clientWidth / sizes[index].width);
        frame.style.transform = "scale(" + scale + ")";
        frame.style.height = sizes[index].height + "px";
        canvases[index].style.height = (sizes[index].height * scale) + "px";
      });
    }
    function resizeComparison(event) {
      var data = event.data;
      frames.forEach(function(frame, index){
        if (event.source !== frame.contentWindow || !data || data.type !== "bhn-review-height" || data.key !== versions[index].key) return;
        if (Number.isFinite(data.height) && data.height > 0 && data.height <= 200000) {
          sizes[index].height = data.height;
          if (!reportCommentEndpoint && Number.isFinite(data.width) && data.width >= 640 && data.width <= 4000) {
            sizes[index].width = data.width; frame.style.width = data.width + "px";
          }
          fitComparison();
        }
      });
    }
    // Both full-height snapshots share this one scroll container, so they cannot drift apart.
    window.addEventListener("message", resizeComparison);
    var comparisonObserver = new ResizeObserver(fitComparison);
    canvases.forEach(function(canvas){ comparisonObserver.observe(canvas); });
    comparisonCleanup = function(){ window.removeEventListener("message", resizeComparison); comparisonObserver.disconnect(); };
    dialog.appendChild(grid);
    var key = comparisonKey();
    dialog.addEventListener("close", function(){
      try { sessionStorage.setItem(key, "1"); } catch (_) {}
      var reopen = root.querySelector(".bhn-rv-compare-open");
      if (reopen) reopen.focus();
    });
    document.body.appendChild(dialog);
    dialog.showModal();
  }

  async function loadComparison() {
    var round = state.review.round;
    if (state.comparisonRound === round) return;
    state.comparisonRound = round;
    state.comparison = null;
    state.comparisonError = "";
    if (comparisonCleanup) { comparisonCleanup(); comparisonCleanup = null; }
    if (comparisonDialog) { comparisonDialog.remove(); comparisonDialog = null; }
    if (round < 2) return;
    try {
      var response = await fetch(endpoint + "?comparison=1", { headers: { "Authorization": "Bearer " + credential } });
      var data = await response.json().catch(function(){ return {}; });
      if (!response.ok || !data.ok) throw new Error("Could not load comparison.");
      if (state.review.round !== round || data.review.round !== round) {
        if (state.comparisonRound === round) state.comparisonRound = null;
        return;
      }
      state.comparison = data.comparison;
      render();
      var dismissed = false;
      try { dismissed = sessionStorage.getItem(comparisonKey()) === "1"; } catch (_) {}
      // The Event Report opens comparison only from its button.
      if (!dismissed && !contextualReview) openComparison();
    } catch (_) {
      if (state.review.round !== round) return;
      state.comparisonError = "Could not load comparison. Retry";
      render();
    }
  }

  function repliesFor(id) {
    return state.comments.filter(function(comment){ return comment.parentId === id; });
  }

  function formatTime(value) {
    try { return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
    catch (_) { return ""; }
  }

  // Anyone can edit anyone's comment, so "edited" alone would leave the
  // author's name standing over someone else's wording. Name the editor
  // whenever it wasn't the author. Older comments have no editor recorded
  // and fall back to a bare "edited".
  function editedSuffix(comment) {
    if (!comment.editedAt) return "";
    if (!comment.editedByName || comment.editedByName === comment.authorName) return " · edited";
    return " · edited by " + comment.editedByName;
  }

  /**
   * Size a textarea to its content so the box matches the amount of text.
   * Height is cleared first because scrollHeight only ever grows while an
   * explicit height is set — without the reset, deleting text leaves the
   * box tall. Past the CSS max-height it scrolls instead, so a long comment
   * can't push the buttons out of the panel.
   */
  function autoGrow(textarea) {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  }

  function addButton(label, classValue, handler) {
    var button = make("button", classValue, label);
    button.setAttribute("type", "button");
    button.addEventListener("click", handler);
    return button;
  }

  /** A round stops accepting writes the moment it is exported. */
  function isLocked() {
    return ((reportCommentEndpoint || htmlReview || websiteReview) && state.pageRound !== state.review.round) || (state.review.status && state.review.status !== "open");
  }

  ${mentionToolsSource()}
  ${mentionNotificationsSource()}
  ${commentCopySource()}

  function renderComposer(container) {
    if (state.pageRound !== state.review.round) {
      var update = make("div", "bhn-rv-notice", "A new round was saved. Reload to comment on the current version.");
      update.appendChild(addButton("Reload current version", "bhn-rv-btn", function(){ window.location.reload(); }));
      container.appendChild(update);
      if(htmlReview && (state.draft || state.replyDraft || state.editDraft)){
        var retained=make("textarea","bhn-rv-textarea");retained.readOnly=true;retained.value=state.draft||state.replyDraft||state.editDraft;retained.setAttribute("aria-label","Unsaved feedback to copy before reloading");container.appendChild(retained);
      }
      return;
    }
    if (isLocked()) {
      if (reportReview) return; // The prominent lock card explains the report state.
      container.appendChild(make("div", "bhn-rv-notice bhn-rv-locked",
        state.review.status === "approved" ? "This round was approved. Earlier comments remain available." :
        state.review.status === "closed" ? "This review is closed. Previous comments remain available." :
        reportReview ? "Round " + state.review.round + " is locked while revisions are underway. Wait until this round’s revisions are complete. Then an administrator can start Round " + (state.review.round + 1) + " to resume editing and commenting." :
          "Round " + state.review.round + " was exported and is locked. It reopens when the next round starts."));
      return;
    }
    if (!state.selected) return;
    var box = make("section", "bhn-rv-compose");
    box.appendChild(make("div", "bhn-rv-compose-label", state.selected.general ? "Comment on the newsletter" : state.selected.drawing ? "Comment on drawn " + state.selected.drawing.shape : state.selected.insertion ? "Request a section insertion" : "Comment on selected element"));
    if (state.selected.anchorQuote) {
      box.appendChild(make("div", "bhn-rv-quote", state.selected.anchorQuote.slice(0, 180)));
    }
    var textarea = make("textarea", "bhn-rv-textarea");
    textarea.addEventListener("input", function(){ autoGrow(textarea); });
    textarea.setAttribute("placeholder", "What should change?");
    textarea.setAttribute("aria-label", "New review comment");
    textarea.maxLength = htmlReview ? 4000 : state.selected.insertion ? 7800 : 8000;
    textarea.value = state.draft;
    textarea.addEventListener("input", function(){ state.draft = textarea.value; reportDraftStatus(); });
    box.appendChild(textarea);
    attachReviewMentions(textarea, box);
    var actions = make("div", "bhn-rv-actions");
    actions.appendChild(addButton("Cancel", "bhn-rv-btn", function(){ clearWebsiteSuggestionCheckpoint();state.selected = null; state.draft = ""; render(); if(contextualReview&&reportCommentTarget)focusPageElement(reportCommentTarget); }));
    var submit = addButton(state.saving ? "Adding..." : "Add comment", "bhn-rv-btn bhn-rv-btn-primary", function(){ submitComment(textarea.value, null, state.selected); });
    submit.disabled = state.saving;
    actions.appendChild(submit);
    box.appendChild(actions);
    container.appendChild(box);
    window.setTimeout(function(){
      if (!reportReview) { textarea.focus(); return; }
      // Reveal the report composer within its own panel without jumping the report to the top.
      textarea.focus({preventScroll:true});
      var scrollBody=textarea.closest('.bhn-rv-body');
      if(scrollBody)scrollBody.scrollTop=box.offsetTop-scrollBody.offsetTop;
    }, 0);
  }

  function renderReplyComposer(card, thread) {
    if (isLocked() || (htmlReview && thread.round !== state.pageRound)) return;
    if (state.replyTo !== thread.id) return;
    var wrap = make("div", "bhn-rv-reply-compose");
    var textarea = make("textarea", "bhn-rv-textarea");
    textarea.addEventListener("input", function(){ autoGrow(textarea); });
    textarea.setAttribute("placeholder", "Reply to this thread");
    textarea.setAttribute("aria-label", "Reply to " + thread.authorName);
    textarea.value = state.replyDraft;
    textarea.addEventListener("input", function(){ state.replyDraft = textarea.value; reportDraftStatus(); });
    wrap.appendChild(textarea);
    attachReviewMentions(textarea, wrap);
    var actions = make("div", "bhn-rv-actions");
    actions.appendChild(addButton("Cancel", "bhn-rv-btn", function(){ state.replyTo = null; state.replyDraft = ""; render(); }));
    var submit = addButton(state.saving ? "Replying..." : "Reply", "bhn-rv-btn bhn-rv-btn-primary", function(){ submitComment(textarea.value, thread.id, null); });
    submit.disabled = state.saving;
    actions.appendChild(submit);
    wrap.appendChild(actions);
    card.appendChild(wrap);
    window.setTimeout(function(){
      if (!reportReview) { textarea.focus(); return; }
      textarea.focus({preventScroll:true});
      var scrollBody=textarea.closest('.bhn-rv-body');
      if(scrollBody)scrollBody.scrollTop=wrap.offsetTop-scrollBody.offsetTop;
    }, 0);
  }

  function beginEdit(comment) {
    state.editingId = comment.id;
    state.editDraft = comment.body;
    state.deletingId = null;
    state.replyTo = null;
    state.replyDraft = "";
    state.expandedThreads[comment.parentId || comment.id] = true;
    render();
  }

  function beginDelete(comment) {
    state.deletingId = comment.id;
    state.editingId = null;
    state.editDraft = "";
    state.replyTo = null;
    state.replyDraft = "";
    state.expandedThreads[comment.parentId || comment.id] = true;
    render();
  }

  // A review is a shared workspace: every reviewer can edit and delete every
  // comment, so a correction lands in the text itself rather than as a reply
  // nobody reads. Whoever edits is recorded and shown next to the comment.
  function appendCommentTools(container, comment) {
    if (isLocked() || (htmlReview && comment.round !== state.pageRound)) return;
    var edit = addButton("Edit", "bhn-rv-link-btn", function(){ beginEdit(comment); });
    edit.setAttribute("aria-label", "Edit " + (comment.parentId ? "reply" : "comment") + " by " + comment.authorName);
    container.appendChild(edit);
    var remove = addButton("Delete", "bhn-rv-link-btn bhn-rv-link-btn-danger", function(){ beginDelete(comment); });
    remove.setAttribute("aria-label", "Delete " + (comment.parentId ? "reply" : "comment") + " by " + comment.authorName);
    container.appendChild(remove);
  }

  function renderEditComposer(container, comment) {
    if (state.editingId !== comment.id) return;
    var wrap = make("div", "bhn-rv-edit-compose");
    var textarea = make("textarea", "bhn-rv-textarea");
    textarea.addEventListener("input", function(){ autoGrow(textarea); });
    textarea.setAttribute("aria-label", "Edit " + (comment.parentId ? "reply" : "comment") + " by " + comment.authorName);
    textarea.value = state.editDraft;
    textarea.addEventListener("input", function(){ state.editDraft = textarea.value; });
    wrap.appendChild(textarea);
    attachReviewMentions(textarea, wrap);
    var actions = make("div", "bhn-rv-actions");
    actions.appendChild(addButton("Cancel", "bhn-rv-btn", function(){ state.editingId = null; state.editDraft = ""; render(); }));
    var save = addButton(state.saving ? "Saving..." : "Save", "bhn-rv-btn bhn-rv-btn-primary", function(){ updateComment(comment.id, textarea.value); });
    save.disabled = state.saving;
    actions.appendChild(save);
    wrap.appendChild(actions);
    container.appendChild(wrap);
    window.setTimeout(function(){ textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length); }, 0);
  }

  function renderDeleteConfirmation(container, comment) {
    if (state.deletingId !== comment.id) return;
    var wrap = make("div", "bhn-rv-delete-confirm");
    // Name the author when you're about to remove someone else's.
    var whose = comment.isMine ? "this" : comment.authorName + "'s";
    wrap.appendChild(make("div", "bhn-rv-delete-copy",
      comment.parentId
        ? "Delete " + whose + " reply?"
        : "Delete " + whose + " thread and its replies?"));
    var actions = make("div", "bhn-rv-actions");
    actions.appendChild(addButton("Cancel", "bhn-rv-btn", function(){ state.deletingId = null; render(); }));
    var remove = addButton(state.saving ? "Deleting..." : "Delete", "bhn-rv-btn bhn-rv-btn-danger", function(){ deleteComment(comment); });
    remove.disabled = state.saving;
    actions.appendChild(remove);
    wrap.appendChild(actions);
    container.appendChild(wrap);
  }

  function renderThread(comment, index) {
    var card = make("article", "bhn-rv-thread");
    card.setAttribute("data-thread-id", comment.id);
    var hasFlashed = false;
    var expanded = !!state.expandedThreads[comment.id] || state.replyTo === comment.id || state.editingId === comment.id || state.deletingId === comment.id;
    var summary = make("div", "bhn-rv-thread-summary");
    var toggle = make("button", "bhn-rv-thread-toggle");
    toggle.setAttribute("type", "button");
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-label", (expanded ? "Collapse" : "Expand") + " comment " + (index + 1));
    toggle.appendChild(make("span", "bhn-rv-number", String(index + 1)));
    var main = make("span", "bhn-rv-thread-main");
    var line = make("span", "bhn-rv-thread-line");
    line.appendChild(make("span", "bhn-rv-author", comment.authorName));
    line.appendChild(make("span", "bhn-rv-time", "R" + comment.round + " · " + formatTime(comment.createdAt) + editedSuffix(comment)));
    line.appendChild(make("span", "bhn-rv-status" + (comment.status === "open" ? "" : " bhn-rv-status-resolved"), comment.status));
    main.appendChild(line);
    if (!expanded) main.appendChild(make("span", "bhn-rv-thread-preview", cleanText(comment.body).slice(0, 100)));
    toggle.appendChild(main);
    toggle.appendChild(make("span", "bhn-rv-disclosure", expanded ? "⌄" : "›"));
    toggle.addEventListener("click", function(){
      state.expandedThreads[comment.id] = !expanded;
      if (expanded && state.replyTo === comment.id) {
        state.replyTo = null;
        state.replyDraft = "";
      }
      render();
    });
    summary.appendChild(toggle);
    var missing = state.locateFailedId === comment.id;
    var locate = addButton(missing ? "Not found" : "Show me", "bhn-rv-thread-locate", function(){
      // Accordion: jumping to an element opens that thread and closes the
      // others, so the panel shows the one thing you just looked at rather
      // than a growing stack of everything visited. A half-typed reply on
      // another thread goes with it.
      var wasExpanded = state.expandedThreads[comment.id];
      state.expandedThreads = {};
      state.expandedThreads[comment.id] = true;
      if (!wasExpanded && state.replyTo && state.replyTo !== comment.id) {
        state.replyTo = null;
        state.replyDraft = "";
      }
      // The "not found" flag lives in state, not on this node: render()
      // rebuilds the panel, so anything written onto the button directly
      // would be thrown away with the old DOM.
      var found = bringCommentIntoView(comment);
      state.locateFailedId = found ? null : comment.id;
      render();
      if (found) return;
      window.setTimeout(function(){
        if (state.locateFailedId !== comment.id) return;
        state.locateFailedId = null;
        render();
      }, 1800);
    });
    locate.disabled = missing;
    locate.setAttribute("aria-label", "Show comment " + (index + 1) + " on page");
    locate.setAttribute("title", missing
      ? "The commented element is no longer on this page"
      : "Bring the commented element into view");
    if (!((staffSurface === "social" || htmlReview) && !comment.anchorKey && !comment.anchorPath && !comment.anchorQuote)) summary.appendChild(locate);
    card.appendChild(summary);

    if (expanded) {
      var details = make("div", "bhn-rv-thread-details");
      if (state.editingId === comment.id) renderEditComposer(details, comment);
      else details.appendChild(make("div", "bhn-rv-thread-body", comment.body));
      if (reportReview && comment.anchorTarget && findReportTarget(document, comment.anchorTarget) && !cleanText(comment.anchorTarget.quote).includes(cleanText(comment.anchorQuote))) details.appendChild(make("p", "bhn-rv-notice", "This passage has been revised. Showing its current location; the original quoted text is preserved below."));
      if (comment.anchorQuote) details.appendChild(make("div", "bhn-rv-thread-quote", comment.anchorQuote.slice(0, 180)));

      var replies = repliesFor(comment.id);
      if (replies.length) {
        var replyList = make("div", "bhn-rv-replies");
        replies.forEach(function(reply){
          var row = make("div", "bhn-rv-reply");
          var replyHead = make("div", "bhn-rv-reply-head");
          replyHead.appendChild(make("div", "bhn-rv-reply-meta", reply.authorName + " · " + formatTime(reply.createdAt) + editedSuffix(reply)));
          var replyTools = make("div", "bhn-rv-reply-tools");
          appendCommentTools(replyTools, reply);
          replyHead.appendChild(replyTools);
          row.appendChild(replyHead);
          if (state.editingId === reply.id) renderEditComposer(row, reply);
          else row.appendChild(make("div", "bhn-rv-reply-body", reply.body));
          renderDeleteConfirmation(row, reply);
          replyList.appendChild(row);
        });
        details.appendChild(replyList);
      }

      // Reply is appended here rather than inside appendCommentTools, so it
      // needs the lock check of its own.
      if (!isLocked() && (!htmlReview || comment.round === state.pageRound)) {
        var tools = make("div", "bhn-rv-thread-tools");
        if (reportCommentEndpoint || htmlReview || (websiteReview && state.viewer?.canResolve && comment.round === state.pageRound)) tools.appendChild(addButton(comment.status === "open" ? "Resolve" : "Reopen", "bhn-rv-link-btn", async function(){
          if (state.saving) return;
          state.saving = true;
          try {
            var response = !reportCommentEndpoint ? await fetch(endpoint,{method:"PATCH",headers:{"Authorization":"Bearer "+credential,"Content-Type":"application/json"},body:JSON.stringify({id:comment.id,expectedRound:state.pageRound,status:comment.status==="open"?"resolved":"open"})}) : await writeReportComment(comment.status === "open" ? "setStatus" : "reopenComment", { commentId: comment.id, status: "resolved" });
            var data = await response.json();
            if (!response.ok || !data.ok) throw new Error(data.error || "Could not update this thread.");
            await loadComments(false);
          } catch (error) { state.error = error.message || "Could not update this thread."; render(); }
          finally { state.saving = false; render(); }
        }));
        tools.appendChild(addButton("Reply", "bhn-rv-link-btn", function(){
          state.replyTo = comment.id;
          state.replyDraft = "";
          state.expandedThreads[comment.id] = true;
          render();
        }));
        appendCommentTools(tools, comment);
        details.appendChild(tools);
      }
      renderDeleteConfirmation(details, comment);
      renderReplyComposer(details, comment);
      card.appendChild(details);
    }

    function highlightCommentAnchor() {
      threadHighlight = findAnchor(comment);
      if (!threadHighlight) {
        showHighlight(null);
        return;
      }
      if (!hasFlashed) {
        hasFlashed = true;
        flashHighlight(threadHighlight);
      } else {
        showHighlight(threadHighlight);
      }
    }
    card.addEventListener("mouseenter", highlightCommentAnchor);
    card.addEventListener("mousemove", highlightCommentAnchor);
    card.addEventListener("mouseleave", function(){
      hasFlashed = false;
      threadHighlight = null;
      highlight.classList.remove("bhn-review-highlight-flash");
      showHighlight(null);
    });
    return card;
  }

  ${reportToolsSource()}

  function render() {
    var previousBody = root.querySelector(".bhn-rv-body");
    var previousScroll = previousBody ? previousBody.scrollTop : 0;
    root.setAttribute("data-report-draw-mode", reportReview && reportDrawMode ? reportDrawMode : "");
    root.setAttribute("data-report-commenting", String(reportReview && !!state.viewer && !isLocked()));
    root.setAttribute("data-picking-element", String(reportReview && state.pickingElement && !isLocked()));
    root.textContent = "";
    root.setAttribute("class", (state.panelCollapsed ? "bhn-rv-root-collapsed" : "") + (panelDrag ? " bhn-rv-root-dragging" : ""));
    var shell = make("div", "bhn-rv-shell" + (state.panelCollapsed ? " bhn-rv-shell-collapsed" : ""));
    var head = make("header", "bhn-rv-head");
    head.setAttribute("title", "Drag review panel");
    head.addEventListener("pointerdown", startPanelDrag);
    var dragHandle = make("span", "bhn-rv-drag-handle");
    dragHandle.setAttribute("aria-hidden", "true");
    head.appendChild(dragHandle);
    var copy = make("div", "bhn-rv-head-copy");
    copy.appendChild(make("div", "bhn-rv-kicker", "BioHubNet review"));
    copy.appendChild(make("div", "bhn-rv-title", state.review.title || initialTitle));
    var identity = state.viewer ? state.viewer.name : "Training Platform account required";
    copy.appendChild(make("div", "bhn-rv-meta", "Round " + state.review.round + " · " + identity));
    head.appendChild(copy);
    var commentCount = topComments().filter(function(comment){ return comment.round === state.review.round; }).length;
    var collapseLabel = state.panelCollapsed ? "Expand " + commentCount + " comments" : "Collapse comments";
    var collapse = addButton(state.panelCollapsed ? "R" + state.review.round + " · ☰ " + commentCount : "−", "bhn-rv-icon-btn bhn-rv-collapse", function(){
      state.panelCollapsed = !state.panelCollapsed;
      threadHighlight = null;
      showHighlight(null);
      render();
    });
    collapse.setAttribute("aria-label", collapseLabel);
    collapse.setAttribute("title", collapseLabel);
    head.appendChild(collapse);
    shell.appendChild(head);

    var body = make("div", "bhn-rv-body");
    body.tabIndex = 0; body.setAttribute("aria-label", "Review comments");
    if (state.error) body.appendChild(make("div", "bhn-rv-notice bhn-rv-error", state.error));
    if (state.mentionNotice) { var mentionStatus=make("p","bhn-rv-notice",state.mentionNotice);mentionStatus.setAttribute("role","status");mentionStatus.setAttribute("aria-label","Mention notifications");body.appendChild(mentionStatus); }
    if (state.loading) {
      body.appendChild(make("div", "bhn-rv-notice", "Loading team comments..."));
    } else if (reportCommentEndpoint && !state.viewer) {
      body.appendChild(make("div", "bhn-rv-notice", "Staff sign-in is required. Reload this page after signing in."));
    } else if (!reportCommentEndpoint && (!credential || !state.viewer) && accountRequired) {
      var accountNotice = make("div", "bhn-rv-notice", "Open Newsletter Review to use your signed-in platform account.");
      var accountLink = make("a", "bhn-rv-btn", "Open Newsletter Review");
      accountLink.href = new URL(endpoint).origin + "/admin/workspace/marketing/newsletter/review";
      accountLink.target = "_blank";
      accountLink.rel = "noopener noreferrer";
      accountNotice.appendChild(accountLink);
      body.appendChild(accountNotice);
    } else if (!reportCommentEndpoint && (!credential || !state.viewer)) {
      /*
       * This used to be a dead end — "open this from the training
       * platform" — which made the share link useless to anybody
       * without an account, the exact people it exists for. Now it
       * asks for a name and lets them in.
       */
      var join = make("div", "bhn-rv-notice");
      join.appendChild(make("div", "", "Add your name to comment on this page. No account needed."));
      var nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.placeholder = "Your name";
      nameInput.maxLength = 80;
      nameInput.setAttribute("class", "bhn-rv-input");
      nameInput.style.cssText = "width:100%;margin-top:8px;padding:6px 8px;border:1px solid rgba(0,0,0,.2);border-radius:6px;font:inherit;";
      var go = make("button", "bhn-rv-btn", state.joining ? "Joining..." : "Start reviewing");
      go.style.cssText = "margin-top:8px;";
      go.disabled = !!state.joining;
      function submit() {
        var v = (nameInput.value || "").trim();
        if (v.length < 2) { state.error = "Give a name so the team knows whose comments these are."; render(); return; }
        joinAsGuest(v);
      }
      go.addEventListener("click", submit);
      nameInput.addEventListener("keydown", function(e){ if (e.key === "Enter") submit(); });
      join.appendChild(nameInput);
      join.appendChild(go);
      body.appendChild(join);
      setTimeout(function(){ try { nameInput.focus(); } catch (e) {} }, 0);
    } else {
      var copyFlow = reportReview ? make("div", "bhn-report-copy-flow") : body;
      if (reportReview) {
        copyFlow.setAttribute("data-stage", state.confirmCopy && !isLocked() ? "confirm" : state.copiedRound === state.review.round ? "copied" : "ready");
        body.appendChild(copyFlow);
      }
      if (reportReview) {
        copyFlow.appendChild(addButton(state.copiedRound === state.review.round ? "Comments copied" : reportReview ? "Copy comments and lock round" : "Copy review comments", "bhn-rv-btn bhn-rv-copy-comments", async function(){
          var confirmed = state.confirmedCopy;
          state.confirmedCopy = false;
          try {
            if (reportReview && (reportAnnotationDraft() || state.saving || state.draft.trim() || state.replyTo !== null || state.editingId !== null)) throw new Error("Finish or cancel your comment or reply before copying and locking this round.");
            if (reportReview && document.querySelector('[data-report-unsaved="true"]')) throw new Error("Wait for autosave, or finish the open photo edit, before copying and locking this round.");
            if (reportReview && reportHasPageDrafts()) throw new Error("Finish or cancel your page feedback before copying and locking this round.");
            if (reportReview && !isLocked() && !confirmed) { state.confirmCopy = true; render(); commentActionDock.querySelector('.bhn-rv-copy-confirm button').focus(); return; }
            this.disabled = true;
            var response = reportReview
              ? await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "export", expectedRound: state.pageRound }) })
              : await fetch(endpoint + "?brief=1");
            var data = await response.json();
            if (!response.ok || !data.ok) throw new Error(data.error || "Could not copy the comments. Try again.");
            if (reportReview) {
              state.review = data.review;
              state.pickingElement = false;
              window.dispatchEvent(new CustomEvent("bhn-report-review-state", { detail: data.review }));
            }
            try { await navigator.clipboard.writeText(data.brief); }
            catch (_) { throw new Error(reportReview ? "This round is locked, but clipboard access failed. Copy the comments again to retry." : "Could not copy the comments. Try again."); }
            state.error = "";
            state.copiedRound = state.review.round;
            state.confirmCopy = false;
            if (reportReview) render();
            else this.textContent = "Comments copied";
          } catch (error) {
            state.error = error.message || "Could not copy the comments. Try again.";
            render();
          }
        }));
      }
      if (reportReview && state.confirmCopy && !isLocked()) {
        var confirm = make("section", "bhn-rv-notice bhn-rv-locked bhn-rv-copy-confirm");
        confirm.setAttribute("role", "group"); confirm.setAttribute("aria-label", "Confirm copy and lock");
        confirm.appendChild(make("strong", "", "Copy comments and lock Round " + state.review.round + "?"));
        confirm.appendChild(make("p", "", "Editing and commenting will pause. Wait until revisions are complete before starting the next round."));
        confirm.appendChild(addButton("Cancel copy", "bhn-rv-btn", function(){ state.confirmCopy = false; state.confirmedCopy = false; render(); commentActionDock.querySelector('.bhn-rv-copy-comments').focus(); }));
        confirm.appendChild(addButton("Copy comments and lock round", "bhn-rv-btn bhn-rv-btn-primary", function(){ state.confirmedCopy = true; commentActionDock.querySelector('.bhn-rv-copy-comments').click(); }));
        copyFlow.appendChild(confirm);
      }
      if (reportReview && state.copiedRound === state.review.round) {
        var copiedNotice = make("p", "bhn-rv-notice", "Round " + state.review.round + " is locked. Wait until revisions are complete; an administrator can then start the next round.");
        copiedNotice.setAttribute("role", "status");
        copiedNotice.setAttribute("aria-label", "Review comments copied");
        copyFlow.appendChild(copiedNotice);
      }
      var commonTools=make("div","bhn-rv-common-tools");
      if (contextualReview && !isLocked()) {
        var pick = addButton("Comment on an element", "bhn-rv-btn bhn-rv-element-pick", function(){
          if(reviewTextSession)return;
          reportDrawMode=null; state.pickingElement = true;
          state.insertingSection = false;
          showHighlight(null);
          render();
          root.querySelector(".bhn-rv-element-pick")?.focus({ preventScroll: true });
          if(htmlReview)document.querySelectorAll("h1,h2,h3,h4,h5,p,a,li,img").forEach(function(node){if(!inOverlay(node)&&!node.hasAttribute("tabindex")){node.setAttribute("tabindex","0");node.setAttribute("data-bhn-review-focus","");}});
        });
        pick.setAttribute("aria-pressed", String(state.pickingElement));
        pick.disabled = reviewChangesPending() || state.saving || !!state.draft.trim() || state.replyTo !== null || state.editingId !== null;
        if (state.replyTo !== null || state.editingId !== null) pick.setAttribute("title", "Finish or cancel your current reply or edit first.");
        commonTools.appendChild(pick);
        if(contextualReview){
          var general=addButton("General comment","bhn-rv-btn",function(){if(reviewTextSession)return;state.selected={general:true};state.pickingElement=false;state.panelCollapsed=false;render();});
          general.disabled=reviewChangesPending()||state.saving||!!state.draft.trim()||state.replyTo!==null||state.editingId!==null;
          commonTools.appendChild(general);
        }

      }
      if ((!state.pickingElement || contextualReview) && (state.comparison || state.comparisonError)) {
        (contextualReview?commonTools:body).appendChild(addButton(state.comparisonError || "Before / after comparison", "bhn-rv-btn bhn-rv-compare-open", function(){
          if (state.comparisonError) { state.comparisonRound = null; loadComparison(); }
          else openComparison();
        }));
      }
      if(commonTools.childNodes.length){commonTools.setAttribute("role","group");commonTools.setAttribute("aria-label","Review controls");body.appendChild(commonTools);}
      if (!state.pickingElement || contextualReview) {
        renderComposer(body);
        var list = make("div", "bhn-rv-list");
        var threads = topComments();
        var current = threads.filter(function(comment){ return comment.round === state.review.round; });
        var previous = threads.filter(function(comment){ return comment.round < state.review.round; });
        if (!current.length) list.appendChild(make("div", "bhn-rv-empty", "No comments in Round " + state.review.round + " yet." + (state.pageRound === state.review.round && !isLocked() ? (reportReview ? (reportDrawMode ? " Drag on a report page to draw, then add your comment." : state.pickingElement ? " Choose an element to comment." : " Click text or a photo to edit. Use the nearby comment icon for feedback.") : " Click any page element to start a thread.") : "")));
        current.forEach(function(comment){ list.appendChild(renderThread(comment, threads.indexOf(comment))); });
        body.appendChild(list);
        if (previous.length) {
          var history = make("details", "bhn-rv-history");
          history.open = state.historyExpanded;
          history.appendChild(make("summary", "", "Previous rounds · " + previous.length + " threads"));
          var historyList = make("div", "bhn-rv-list");
          previous.forEach(function(comment){ historyList.appendChild(renderThread(comment, threads.indexOf(comment))); });
          history.appendChild(historyList);
          history.addEventListener("toggle", function(){ if (history.isConnected) { state.historyExpanded = history.open; syncMarkers(); } });
          body.appendChild(history);
        }
      }
    }
    shell.appendChild(body);
    root.appendChild(shell);
    // On root, not in the shell: .bhn-rv-shell is overflow:hidden and would
    // clip both the grip and its hit area. Nothing to widen when collapsed.
    if (!state.panelCollapsed && !reportReview) {
      var grip = make("button", "bhn-rv-resize");
      grip.setAttribute("type", "button");
      grip.setAttribute("aria-label", "Drag to resize the review panel");
      grip.setAttribute("title", "Drag to resize");
      grip.addEventListener("pointerdown", startPanelResize);
      root.appendChild(grip);
    }
    if (reportReview) renderReportTools(body);
    if (reportReview && !state.loading && state.viewer && !isLocked()) {
      var openCard = make("section", "bhn-rv-open-state");
      openCard.setAttribute("role", "status");
      openCard.setAttribute("aria-label", "Round " + state.review.round + " open for review");
      openCard.appendChild(make("strong", "", "Round " + state.review.round + " is open for review"));
      openCard.appendChild(make("p", "", "Edit text and photos, add comments, and @mention colleagues."));
      body.prepend(openCard);
    }
    if (reportReview && !state.loading && state.viewer && isLocked()) {
      var lockCard = make("section", "bhn-rv-lock-state");
      lockCard.setAttribute("role", "status"); lockCard.setAttribute("aria-label", "Round " + state.review.round + " commenting locked");
      var lockIcon = make("span", "bhn-rv-lock-icon", "🔒"); lockIcon.setAttribute("aria-hidden", "true"); lockCard.appendChild(lockIcon);
      lockCard.appendChild(make("strong", "", "Round " + state.review.round + " is locked"));
      lockCard.appendChild(make("p", "", state.review.nextRoundReady
        ? "Round " + (state.review.round + 1) + " is ready for review. An administrator must click Start Round " + (state.review.round + 1) + " review to enable comments and edits."
        : state.review.status === "closed" ? "This report review is closed. Earlier comments remain available."
        : "Round " + state.review.round + " is locked while revisions are underway. Wait until the revisions are complete; an administrator can then start Round " + (state.review.round + 1) + " review."));
      body.prepend(lockCard);
    }
    applyPanelWidth();
    constrainPanel();
    fitReviewPanel();
    body.scrollTop = previousScroll;
    renderCommentCopy();
    if(reportReview && copyFlow){commentActionDock.querySelector('.bhn-report-copy-flow')?.remove();commentActionDock.appendChild(copyFlow);}
    syncInlineText();
    syncMarkers();
  }

  style.textContent += ".bhn-rv-head{flex-shrink:0;}.bhn-rv-body{flex:1 1 auto;min-height:0;overscroll-behavior:auto;} .bhn-rv-lock-state{text-align:center;padding:20px 16px;margin:0 0 14px;border:2px solid #b7c7d1;border-radius:10px;background:#edf2f6;color:#263f52;}.bhn-rv-lock-icon{display:block;font-size:64px;line-height:1.15;margin-bottom:10px;}.bhn-rv-lock-state strong{display:block;font-size:21px;line-height:1.25;}.bhn-rv-lock-state p{margin:10px 0 0;font-size:13px;line-height:1.5;}";

  style.textContent += ".bhn-rv-open-state{padding:12px 14px;margin:0 0 12px;border:1px solid #8eb7a4;border-left:4px solid #26724c;border-radius:8px;background:#edf7f1;color:#204c3a;}.bhn-rv-open-state strong{display:block;font-size:16px;line-height:1.3;}.bhn-rv-open-state p{margin:5px 0 0;font-size:12px;line-height:1.5;}";

  function commentsSignature(comments) {
    return comments.map(function(comment){ return [comment.id, comment.body, comment.status, comment.editedAt, comment.editedByName, comment.anchorQuote, comment.anchorKey, comment.anchorPath, JSON.stringify(comment.anchorTarget)].join(":"); }).join("|");
  }

  function endpointKey() {
    // The review's own share token, which is the last path segment of
    // the endpoint. Keeps one page's pass from unlocking another.
    var parts = String(endpoint).split("/");
    return parts[parts.length - 1] || "review";
  }

  async function joinAsGuest(name) {
    state.joining = true; state.error = ""; render();
    try {
      var response = await fetch(endpoint + "/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name })
      });
      var data = await response.json().catch(function(){ return {}; });
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not join this review.");
      credential = data.viewer;
      try { sessionStorage.setItem("bhn-review-viewer:" + endpointKey(), credential); } catch (e) {}
      state.joining = false;
      await loadComments();
    } catch (err) {
      state.joining = false;
      state.error = err && err.message ? err.message : "Could not join this review.";
      render();
    }
  }

  async function loadComments(silent) {
    if (!credential && !reportCommentEndpoint) {
      // Not an error any more — the panel offers a way in.
      state.loading = false;
      render();
      return;
    }
    try {
      var response = await fetch(endpoint, { headers: { "Authorization": "Bearer " + credential } });
      var data = await response.json().catch(function(){ return {}; });
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not load team comments.");
      if (reportReview) data.review.nextRoundReady = data.review.status === "exported" && !(data.comments || []).some(function(c){ return !c.parentId && c.status === "open"; });
      var roundChanged = state.review.round !== data.review.round;
      var changed = roundChanged || state.review.status !== data.review.status || state.review.nextRoundReady !== data.review.nextRoundReady || commentsSignature(state.comments) !== commentsSignature(data.comments || []);
      if (roundChanged) { state.historyExpanded = false; state.expandedThreads = {}; }
      state.review = data.review;
      if (reportReview) window.dispatchEvent(new CustomEvent("bhn-report-review-state", { detail: data.review }));
      if ((roundChanged && !state.loading) || isLocked()) state.pickingElement = false;
      if (state.pageRound === null) state.pageRound = data.review.round;
      state.viewer = data.viewer;
      loadInlineText();
      if(contextualReview)enableReviewTargetFocus();
      state.comments = data.comments || [];
      if (changed) markerAnchorCache.clear();
      loadMentionNotifications();
      var mentionedComment = mentionDeepLink && state.comments.find(function(c){return c.id===mentionDeepLink;});
      if(mentionedComment){mentionDeepLink=null;state.expandedThreads[mentionedComment.parentId||mentionedComment.id]=true;window.requestAnimationFrame(function(){bringCommentIntoView(mentionedComment);});}
      state.error = "";
      state.loading = false;
      loadComparison();
      var active = document.activeElement;
      if (silent && (changed || state.pendingRender) && active && root.contains(active) && active.tagName === "TEXTAREA") {
        state.pendingRender = true;
        return;
      }
      if (!silent || changed || state.pendingRender) {
        state.pendingRender = false;
        render();
      } else {
        syncMarkers();
      }
    } catch (error) {
      state.loading = false;
      state.error = error && error.message ? error.message : "Could not load team comments.";
      render();
    }
  }

  async function submitComment(value, parentId, anchors) {
    if((htmlReview && inlineDirty()) || (typeof socialEdits!=="undefined" && socialEdits.size)){state.error="Save or discard your edits before adding feedback.";render();return false;}
    if ((!parentId || htmlReview) && state.pageRound !== state.review.round) {
      state.error = "Reload the current version before adding a new comment.";
      render();
      return;
    }
    var body = String(value || "").trim();
    if (body.length < 2 || state.saving) return false;
    if (anchors && anchors.insertion) body = "[Section insertion request]\\nInsert a new section " + anchors.insertion + " the quoted element.\\n\\n" + body;
    state.saving = true;
    state.error = "";
    render();
    try {
      var payload = { body: body, parentId: parentId || null, expectedRound: state.pageRound };
      if (anchors) {
        payload.anchorQuote = anchors.anchorQuote;
        payload.anchorKey = anchors.anchorKey;
        payload.anchorPath = anchors.anchorPath;
        payload.anchorBlock = anchors.anchorBlock;
      }
      var response = await (reportCommentEndpoint ? writeReportComment("addComment", payload) : fetch(endpoint, {
        method: "POST",
        headers: { "Authorization": "Bearer " + credential, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }));
      var data = await response.json().catch(function(){ return {}; });
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not save the comment.");
      if(data.mentions)state.mentionNotice=data.mentions.warning||(data.mentions.sent?'Notified '+data.mentions.sent+' colleague(s) on this review page.':'');
      if(!parentId&&anchors)clearWebsiteSuggestionCheckpoint();
      if (parentId) state.expandedThreads[parentId] = true;
      else if (data.comment && data.comment.id) state.expandedThreads[data.comment.id] = true;
      else if (reportCommentEndpoint && data.review && Array.isArray(data.review.comments)) {
        var added = data.review.comments.slice().reverse().find(function(comment){
          return !comment.parentId && comment.round === state.pageRound && comment.body === body &&
            comment.anchorKey === payload.anchorKey && !state.comments.some(function(existing){ return existing.id === comment.id; });
        });
        if (added) state.expandedThreads[added.id] = true;
      }
      state.selected = null;
      state.draft = "";
      state.replyTo = null;
      state.replyDraft = "";
      state.saving = false;
      await loadComments(false);
      return true;
    } catch (error) {
      state.saving = false;
      state.error = error && error.message ? error.message : "Could not save the comment.";
      render();
      return false;
    }
  }

  async function updateComment(commentId, value) {
    var body = String(value || "").trim();
    if (body.length < 2 || state.saving) return;
    state.saving = true;
    state.error = "";
    render();
    try {
      var response = await (reportCommentEndpoint ? writeReportComment("editComment", { commentId: commentId, body: body }) : fetch(endpoint, {
        method: "PATCH",
        headers: { "Authorization": "Bearer " + credential, "Content-Type": "application/json" },
        body: JSON.stringify({ id: commentId, body: body, expectedRound: state.pageRound })
      }));
      var data = await response.json().catch(function(){ return {}; });
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not update the comment.");
      if(data.mentions)state.mentionNotice=data.mentions.warning||(data.mentions.sent?'Notified '+data.mentions.sent+' colleague(s) on this review page.':'');
      state.editingId = null;
      state.editDraft = "";
      state.saving = false;
      await loadComments(false);
    } catch (error) {
      state.saving = false;
      state.error = error && error.message ? error.message : "Could not update the comment.";
      render();
    }
  }

  async function deleteComment(comment) {
    if (!comment || state.saving) return;
    state.saving = true;
    state.error = "";
    render();
    try {
      var response = await (reportCommentEndpoint ? writeReportComment("deleteComment", { commentId: comment.id }) : fetch(endpoint, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + credential, "Content-Type": "application/json" },
        body: JSON.stringify({ id: comment.id, expectedRound: state.pageRound })
      }));
      var data = await response.json().catch(function(){ return {}; });
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not delete the comment.");
      if (!comment.parentId) delete state.expandedThreads[comment.id];
      state.deletingId = null;
      state.saving = false;
      await loadComments(false);
    } catch (error) {
      state.saving = false;
      state.error = error && error.message ? error.message : "Could not delete the comment.";
      render();
    }
  }

  function removeMarkers() {
    markers.forEach(function(marker){ marker.remove(); });
    markers = [];
    markerRecords.clear();
  }

  function writeReportComment(action, payload) {
    return fetch(reportCommentEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({}, payload, { action: action, expectedRound: state.pageRound }))
    });
  }

  function fitReviewPanel() {
    if (!reportReview || !root.hasAttribute("data-docked")) return;
    var shell = root.querySelector(".bhn-rv-shell"); if (!shell) return;
    var top = Math.max(12, root.getBoundingClientRect().top);
    var available = Math.max(120, window.innerHeight - top - 12);
    var cap = window.innerWidth <= 900 ? window.innerHeight * .72 : window.innerHeight - 56;
    var height = Math.floor(Math.min(available, cap)) + "px";
    if(shell.style.maxHeight !== height) shell.style.maxHeight = height;
  }

  function focusThread(comment, anchor) {
    showHighlight(anchor);
    if (!state.expandedThreads[comment.id]) {
      state.expandedThreads[comment.id] = true;
      render();
    }
    var card = root.querySelector('[data-thread-id="' + comment.id + '"]');
    if (card) {
      card.setAttribute("class", "bhn-rv-thread bhn-rv-thread-active");
      var body = card.closest(".bhn-rv-body");
      if (body) {
        var cardRect = card.getBoundingClientRect(), bodyRect = body.getBoundingClientRect();
        if (cardRect.top < bodyRect.top || cardRect.bottom > bodyRect.bottom) body.scrollTop += cardRect.top - bodyRect.top - 12;
      }
      window.setTimeout(function(){ card.setAttribute("class", "bhn-rv-thread"); }, 1400);
    }
  }

  var markerAnchorCache = new Map();
  var markerRecords = new Map();
  var viewportFrame = null;
  function syncMarkers() {
    // Scroll/resize bursts share one frame. Measure all anchors before changing the DOM.
    if (positionFrame) return;
    positionFrame = window.requestAnimationFrame(function(){
      positionFrame = null;
      var plans = [], placedAnchors = new Map(), wanted = new Set();
      topComments().forEach(function(comment, index){
        if (comment.round < state.review.round && !state.historyExpanded) return;
        var cached = markerAnchorCache.has(comment.id), anchor = markerAnchorCache.get(comment.id);
        if (anchor && !reportReview && !anchorTextMatches(anchor, cleanText(comment.anchorQuote))) { anchor = null; cached = false; }
        // Missing passages are cached too; rescanning the full report on every scroll is expensive.
        // Report content changes and fresh comment targets invalidate both hits and misses.
        if ((!cached || (!reportReview && !anchor)) || (anchor && !anchor.isConnected)) { anchor = findAnchor(comment); markerAnchorCache.set(comment.id, anchor || null); }
        if (!anchor) return;
        var rect = anchor.getBoundingClientRect();
        if ((!rect.width && !rect.height) || rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) return;
        var sharedIndex = placedAnchors.get(anchor) || 0; placedAnchors.set(anchor, sharedIndex + 1);
        var page = reportReview && anchor.closest(pageSelector);
        var pageRect = page && (reportDrawingData(comment) || comment.body.startsWith('[Section insertion request]')) ? page.getBoundingClientRect() : null;
        plans.push({comment:comment,index:index,anchor:anchor,rect:rect,pageRect:pageRect,sharedIndex:sharedIndex});wanted.add(comment.id);
      });
      markerRecords.forEach(function(record,id){if(!wanted.has(id)){record.marker.remove();if(record.drawing)record.drawing.remove();markerRecords.delete(id);}});
      plans.forEach(function(plan){
        var comment=plan.comment,record=markerRecords.get(comment.id),marker=record&&record.marker;
        if(!marker){
          marker=make('button','bhn-review-marker');marker.type='button';
          record={marker:marker,drawing:null,comment:comment,anchor:plan.anchor};markerRecords.set(comment.id,record);
          marker.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();focusThread(record.comment,record.anchor);});
          document.body.appendChild(marker);
        }
        record.comment=comment;record.anchor=plan.anchor;
        var markerClass='bhn-review-marker'+(comment.status==='open'?'':' bhn-review-marker-resolved')+(comment.body.startsWith('[Section insertion request]')?' bhn-report-insertion-bubble':'');
        var markerText=String(plan.index+1),markerLabel='Open comment '+(plan.index+1)+' by '+comment.authorName;
        if(marker.getAttribute('class')!==markerClass)marker.setAttribute('class',markerClass);
        if(marker.textContent!==markerText&&!comment.body.startsWith('[Section insertion request]'))marker.textContent=markerText;
        if(marker.getAttribute('aria-label')!==markerLabel)marker.setAttribute('aria-label',markerLabel);
        var left=Math.max(4,plan.rect.right-13-plan.sharedIndex*29)+'px',top=Math.max(4,plan.rect.top-13)+'px';
        if(marker.style.left!==left)marker.style.left=left;if(marker.style.top!==top)marker.style.top=top;
        if(reportReview){
          reportInsertionMarker(marker,comment,plan.anchor,plan.rect,plan.pageRect);
          record.drawing=reportDrawingMarker(marker,comment,plan.anchor,plan.pageRect,record.drawing);
        }
      });
      markers=[];markerRecords.forEach(function(record){markers.push(record.marker);if(record.drawing)markers.push(record.drawing);});
    });
  }

  function reportTarget(event) {
    var page = event.target.closest(pageSelector);
    if (!page) return null;
    if (event.type === "bhn-report-comment") return page;
    var target = event.target.closest(reportTargets) || (state.pickingElement ? event.target : null);
    return target && page.contains(target) ? target : null;
  }

  function editableReportPage(node) {
    return reportCommentEndpoint && staffSurface === "report" && node &&
      node.closest(pageSelector)?.querySelector('[contenteditable]:not([contenteditable="false"])');
  }

  function onMove(event) {
    if (reportReview && (reportDrawMode || reportDrawDrag || (state.selected && state.selected.drawing))) return;
    if (reportInsertionMove(event)) return;
    if (contextualReview && event.target.closest(".bhn-report-inline-comment")) return;
    if (inOverlay(event.target)) {
      if (threadHighlight) showHighlight(threadHighlight);
      else showHighlight(null);
      return;
    }
    threadHighlight = null;
    var node = contextualReview ? reviewElement(event) : event.target;
    if(contextualReview&&!node){reportInlineComment(null);showHighlight(null);return;}
    if (contextualReview && (htmlActionsMenu||htmlReviewDialog||reviewTextSession)) return;
    if (contextualReview && !state.pickingElement) { reportInlineComment(node); showHighlight(null); return; }
    if (editableReportPage(event.target) && !state.pickingElement && !node?.matches("figcaption")) { showHighlight(null); return; }
    showHighlight(node);
  }

  function onClick(event) {
    if (reportReview && (reportDrawMode || reportDrawSuppressClick || (state.selected && state.selected.drawing)) && event.target.closest(scopeSelector)) { reportDrawSuppressClick=false; event.preventDefault();event.stopPropagation();return; }
    if (inOverlay(event.target)) return;
    if (reportInsertionClick(event)) return;
    if (contextualReview && event.type !== "bhn-report-comment") {
      if(htmlReviewDialog)return;
      if(!state.viewer&&!htmlReview)return;
      if(event.target.closest?.('input,textarea,select,[data-bhn-review-ui]')||(websiteReview&&event.target.closest?.('form,button')&&!state.pickingElement))return;
      if(reviewTextSession?.inPlace){
        if(!reviewTextSession.finish(false)||state.saving||inlineEdit.saving||state.selected){event.preventDefault();event.stopPropagation();return;}
      }
      if(reviewTextSession){event.preventDefault();event.stopPropagation();return;}
      var target=reviewElement(event);if(!target){closeHtmlActions(false);return;}
      if(!state.pickingElement){
        event.preventDefault();event.stopPropagation();
        if(!event.target.closest('a,button')&&reviewActionAdapter(target,event.target).text?.(true,event))return;
        openHtmlActions(target,event);return;
      }
      event.preventDefault();event.stopPropagation();
      if(isLocked()||!state.viewer||reviewChangesPending()||htmlImageSaving()||state.saving||state.selected||state.replyTo!==null||state.editingId!==null)return;
      closeHtmlActions(false);
    }
    if (reportCommentEndpoint && (!state.viewer || isLocked())) return;
    if (reportReview && (state.saving || state.replyTo !== null || state.editingId !== null)) return;
    var node = contextualReview && event.type!=="bhn-report-comment" ? reviewElement(event) : reportReview ? reportTarget(event) : reportCommentEndpoint
      ? (event.target.closest("h1,h2,h3,h4,p,li,blockquote,figcaption,img,td") || event.target.closest(pageSelector)) : event.target;
    if (!node) return;
    // Editable pages: text and photos are edited in place (a photo click opens the photo editor); captions still comment.
    if (event.type !== "bhn-report-comment" && editableReportPage(event.target) && !state.pickingElement && !node.matches("figcaption")) return;
    event.preventDefault();
    event.stopPropagation();
    var pickedElement = state.pickingElement;
    if (contextualReview || !reportReview) state.pickingElement = false;
    state.selected = anchorsFor(node);
    if (!pickedElement && !reportReview) state.draft = "";
    if (contextualReview) state.panelCollapsed = false;
    state.replyTo = null;
    threadHighlight = null;
    showHighlight(node);
    render();
  }

  function onPositionChange(event) {
    if (event && event.type === 'scroll' && event.target instanceof Element && (root.contains(event.target) || event.target.closest('.bhn-rv-tag-history,.bhn-rv-mention-popup'))) return;
    if (viewportFrame) return;
    viewportFrame=window.requestAnimationFrame(function(){
      viewportFrame=null;
      constrainPanel();fitReviewPanel();
      if(contextualReview)reportCommentPosition();
      if(reviewTextSession?.position)reviewTextSession.position();
      if(reportReview){reportMenuPosition();reportDrawRefresh();}
      if(highlightedNode)showHighlight(highlightedNode);
      positionTagHistory();syncMarkers();
    });
  }

  function cleanup() {
    window.removeEventListener('beforeunload',beforeInlineUnload);
    window.removeEventListener('beforeunload',beforeReviewUnload);
    if(commentActionDock)commentActionDock.remove();
    if(contextualReview){if(reviewTextSession)reviewTextSession.close();cleanupHtmlActions();}
    if(htmlReview)cleanupHtmlImageEditor();
    document.removeEventListener('focusin',reportFocusComment);
    document.removeEventListener('keydown',contextualKey,true);
    if(reportCommentButton)reportCommentButton.remove();
    document.querySelectorAll('[data-bhn-review-focus]').forEach(function(node){node.removeAttribute('tabindex');node.removeAttribute('data-bhn-review-focus');});
    cleanupMentionNotifications();
    if (reportReview) cleanupReportTools();
    stopPanelDrag();
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    if (reportCommentEndpoint) document.removeEventListener("bhn-report-comment", onClick);
    window.removeEventListener("scroll", onPositionChange, true);
    window.removeEventListener("resize", onPositionChange);
    if (pollTimer) window.clearInterval(pollTimer);
    if (positionFrame) window.cancelAnimationFrame(positionFrame);
    if (viewportFrame) window.cancelAnimationFrame(viewportFrame);
    removeMarkers();
    if (comparisonCleanup) comparisonCleanup();
    if (comparisonDialog) comparisonDialog.remove();
    highlight.remove();
    root.remove();
    style.remove();
    window.__bhnReviewCleanup = null;
  }

  window.__bhnReviewCleanup = cleanup;
  ${htmlActionsSource()}
  ${inlineTextSource()}
  ${htmlImageSource()}
  ${surfaceAdaptersSource()}
  ${textEditorSource()}
  ${textCheckpointSource()}
  ${inPlaceTextSource()}
  ${contextualSource()}
  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  if (reportCommentEndpoint) document.addEventListener("bhn-report-comment", onClick);
  window.addEventListener("scroll", onPositionChange, {capture:true,passive:true});
  window.addEventListener("resize", onPositionChange);
  pollTimer = window.setInterval(function(){ loadComments(true); }, 5000);
  render();
  loadComments(false);
})();`;
}
