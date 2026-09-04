/** JavaScript source for the live-page review overlay. */
export function overlaySource(endpoint: string, title: string): string {
  return `(function(){
  var ID = "bhn-review-overlay";
  if (window.__bhnReviewCleanup) window.__bhnReviewCleanup();

  var script = document.currentScript;
  var credential = script && script.dataset ? (script.dataset.viewer || "") : "";
  // Somebody who arrived on a share link has no credential in the tag.
  // They can earn one by giving a name — see joinAsGuest below. Kept in
  // sessionStorage so a reload does not ask again in the same sitting.
  try {
    if (!credential) credential = sessionStorage.getItem("bhn-review-viewer:" + endpointKey()) || "";
  } catch (e) { /* storage can be blocked; joining still works. */ }
  var endpoint = ${JSON.stringify(endpoint)};
  var initialTitle = ${JSON.stringify(title)};
  var state = {
    review: { title: initialTitle, round: 1, status: "open" },
    viewer: null,
    joining: false,
    comments: [],
    selected: null,
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
    expandedThreads: {}
  };
  var markers = [];
  var pollTimer = null;
  var positionFrame = null;
  var threadHighlight = null;
  var highlightedNode = null;
  var panelPosition = null;
  var panelDrag = null;
  var panelResize = null;
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
    "#" + ID + ".bhn-root-collapsed{width:76px;}",
    "#" + ID + " *{box-sizing:border-box;letter-spacing:0;}",
    "#" + ID + " button,#" + ID + " textarea{font:inherit;}",
    "#" + ID + " button{cursor:pointer;}",
    ".bhn-resize{position:absolute;top:0;left:-4px;width:10px;height:100%;z-index:3;cursor:ew-resize;touch-action:none;background:transparent;border:0;padding:0;}.bhn-resize:hover::after,.bhn-root-resizing .bhn-resize::after{content:'';position:absolute;top:10px;bottom:10px;left:4px;width:3px;border-radius:3px;background:rgba(23,104,121,.55);}.bhn-root-resizing{user-select:none;-webkit-user-select:none;}#" + ID + ".bhn-root-resizing{transition:none;}",
    ".bhn-shell{position:relative;display:flex;max-height:calc(100vh - 20px);flex-direction:column;overflow:hidden;border:1px solid rgba(151,166,176,.72);border-radius:7px;background:rgba(247,249,250,.8);box-shadow:0 12px 34px rgba(7,27,39,.2);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);}",
    ".bhn-head{display:flex;align-items:center;gap:5px;padding:7px;background:rgba(11,53,88,.88);color:#fff;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;}.bhn-root-dragging .bhn-head{cursor:grabbing;}.bhn-drag-handle{width:10px;height:14px;flex:0 0 auto;background:radial-gradient(circle,rgba(255,255,255,.72) 1px,transparent 1.5px) 0 0/4px 4px;opacity:.8;}.bhn-head-copy{min-width:0;flex:1;}.bhn-kicker{font-size:8px;font-weight:800;text-transform:uppercase;opacity:.68;}.bhn-title{overflow:hidden;font-size:12px;font-weight:780;text-overflow:ellipsis;white-space:nowrap;}.bhn-meta{overflow:hidden;margin-top:1px;font-size:9px;opacity:.76;text-overflow:ellipsis;white-space:nowrap;}",
    ".bhn-icon-btn{display:grid;height:26px;min-width:26px;flex:0 0 auto;place-items:center;border:0;border-radius:5px;background:rgba(255,255,255,.11);padding:0 6px;color:#fff;font-weight:800;line-height:1;}.bhn-icon-btn:hover{background:rgba(255,255,255,.2);}.bhn-collapse{font-size:11px;}.bhn-shell-collapsed .bhn-head{padding:5px;}.bhn-shell-collapsed .bhn-head-copy,.bhn-shell-collapsed .bhn-body{display:none;}",
    ".bhn-locked{border-color:#e2cf9a;background:rgba(255,250,235,.92);color:#6b551f;}.bhn-body{overflow:auto;padding:6px;overscroll-behavior:contain;}.bhn-notice{padding:7px;border:1px solid #d8e0e5;border-radius:5px;background:rgba(255,255,255,.84);color:#4a5864;font-size:11px;}.bhn-error{border-color:#f0b7b7;background:rgba(255,243,243,.9);color:#8c2020;}",
    ".bhn-compose{margin-bottom:6px;padding:7px;border:1px solid #9bc6d2;border-radius:6px;background:rgba(237,248,250,.88);}.bhn-compose-label{font-size:10px;font-weight:800;color:#245866;}.bhn-quote{max-height:132px;overflow:auto;overscroll-behavior:contain;margin:4px 0 6px;padding-left:6px;border-left:2px solid #2c7587;color:#41515c;font-size:10px;line-height:1.3;}.bhn-textarea{display:block;width:100%;min-height:58px;max-height:260px;overflow-y:auto;resize:vertical;border:1px solid #b9c5cc;border-radius:5px;background:rgba(255,255,255,.92);padding:6px;color:#17212b;outline:none;}.bhn-textarea:focus{border-color:#2c7587;box-shadow:0 0 0 2px rgba(44,117,135,.14);}",
    ".bhn-actions{display:flex;align-items:center;justify-content:flex-end;gap:5px;margin-top:5px;}.bhn-btn{min-height:27px;border:1px solid #c6d0d6;border-radius:5px;background:rgba(255,255,255,.88);padding:4px 8px;color:#34434e;font-size:10px;font-weight:750;}.bhn-btn:hover{background:#f0f4f6;}.bhn-btn-primary{border-color:#176879;background:#176879;color:#fff;}.bhn-btn-primary:hover{background:#105565;}.bhn-btn-danger{border-color:#b64a4a;background:#a53b3b;color:#fff;}.bhn-btn-danger:hover{background:#8d2f2f;}.bhn-btn:disabled{cursor:not-allowed;opacity:.55;}",
    ".bhn-list{display:grid;gap:5px;}.bhn-empty{padding:11px 7px;text-align:center;color:#667580;font-size:10px;}.bhn-thread{border:1px solid rgba(189,201,209,.85);border-radius:6px;background:rgba(255,255,255,.84);overflow:hidden;}.bhn-thread-active{border-color:#2c7587;box-shadow:0 0 0 2px rgba(44,117,135,.12);}.bhn-thread-summary{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:stretch;}.bhn-thread-toggle{display:grid;width:100%;min-width:0;grid-template-columns:20px minmax(0,1fr) auto;align-items:start;gap:6px;border:0;background:transparent;padding:6px;text-align:left;color:#17212b;}.bhn-thread-toggle:hover{background:rgba(227,239,243,.72);}.bhn-thread-locate{min-width:50px;border:0;border-left:1px solid rgba(205,216,222,.82);background:rgba(244,248,249,.74);padding:4px 6px;color:#176879;font-size:9px;font-weight:800;white-space:nowrap;}.bhn-thread-locate:hover,.bhn-thread-locate:focus-visible{background:rgba(218,235,239,.88);outline:0;}.bhn-thread-locate:disabled{color:#8a5e23;cursor:default;}.bhn-number{display:grid;width:20px;height:20px;place-items:center;border-radius:50%;background:#176879;color:#fff;font-size:9px;font-weight:800;}.bhn-thread-main{min-width:0;}.bhn-thread-line{display:flex;min-width:0;align-items:center;gap:5px;}.bhn-author{min-width:0;overflow:hidden;flex:1;color:#1c2b35;font-size:10px;font-weight:800;text-overflow:ellipsis;white-space:nowrap;}.bhn-time{color:#84919a;font-size:8px;font-weight:550;white-space:nowrap;}.bhn-status{border-radius:999px;background:#e9f6ed;padding:1px 4px;color:#2e6f42;font-size:8px;font-weight:800;text-transform:uppercase;}.bhn-status-resolved{background:#eef1f3;color:#64717a;}.bhn-thread-preview{overflow:hidden;margin-top:2px;color:#3b4b55;font-size:10px;text-overflow:ellipsis;white-space:nowrap;}.bhn-disclosure{padding-top:2px;color:#71808a;font-size:12px;}",
    ".bhn-thread-details{border-top:1px solid rgba(220,228,232,.8);padding-top:6px;}.bhn-thread-body{padding:0 7px 6px;white-space:pre-wrap;color:#2f3e48;font-size:11px;}.bhn-thread-quote{max-height:132px;overflow:auto;overscroll-behavior:contain;margin:0 7px 6px;padding:4px 6px;border-left:2px solid #b7c8d1;background:rgba(245,248,249,.82);color:#60707b;font-size:9px;}.bhn-thread-tools{display:flex;justify-content:flex-end;gap:2px;padding:0 7px 5px;}.bhn-link-btn{border:0;background:transparent;padding:2px 4px;color:#176879;font-size:10px;font-weight:800;}.bhn-link-btn:hover{text-decoration:underline;}.bhn-link-btn-danger{color:#9b3030;}.bhn-edit-compose{margin:0 7px 6px;}.bhn-delete-confirm{margin:0 7px 6px;border-top:1px solid #ead4d4;padding-top:5px;}.bhn-delete-copy{color:#7d3030;font-size:10px;}",
    ".bhn-replies{margin:0 7px 6px 28px;border-left:2px solid #dce4e8;padding-left:6px;}.bhn-reply{padding:4px 0;border-top:1px solid #edf0f2;}.bhn-reply:first-child{border-top:0;}.bhn-reply-head{display:flex;align-items:center;gap:4px;}.bhn-reply-meta{min-width:0;flex:1;color:#6c7982;font-size:9px;font-weight:750;}.bhn-reply-tools{display:flex;flex:0 0 auto;}.bhn-reply-body{margin-top:1px;white-space:pre-wrap;color:#34434e;font-size:10px;}.bhn-reply .bhn-edit-compose,.bhn-reply .bhn-delete-confirm{margin:4px 0 0;}.bhn-reply-compose{margin:0 7px 6px 28px;}",
    ".bhn-review-highlight{position:fixed;z-index:2147483645;display:none;pointer-events:none;border:2px solid #2c7587;border-radius:3px;background:rgba(44,117,135,.12);}.bhn-review-highlight-flash{animation:bhn-review-flash .16s linear 5;}@keyframes bhn-review-flash{0%,100%{border-color:#2c7587;background:rgba(44,117,135,.12);box-shadow:0 0 0 0 rgba(238,166,54,0)}50%{border-color:#eea636;background:rgba(238,166,54,.34);box-shadow:0 0 0 6px rgba(238,166,54,.3)}}",
    ".bhn-review-marker{position:fixed;z-index:2147483646;display:grid;width:25px;height:25px;place-items:center;border:2px solid #fff;border-radius:50%;background:#176879;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.28);font:800 11px/1 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;}.bhn-review-marker:hover{transform:scale(1.08);}.bhn-review-marker-resolved{background:#74818a;}",
    "@media(max-width:540px){#" + ID + "{right:8px;bottom:8px;max-height:calc(100vh - 16px);}.bhn-shell{max-height:calc(100vh - 16px);}}"
  ].join("");
  document.head.appendChild(style);

  var root = document.createElement("aside");
  root.id = ID;
  root.setAttribute("aria-label", "BioHubNet website review");
  document.body.appendChild(root);

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
    if (state.panelCollapsed) return Math.min(76, window.innerWidth - 20);
    var w = panelWidth === null ? PANEL_WIDTH_DEFAULT : panelWidth;
    return Math.min(Math.max(PANEL_WIDTH_MIN, w), maxPanelWidth());
  }

  function applyPanelWidth() {
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
    Array.prototype.forEach.call(root.querySelectorAll(".bhn-textarea"), autoGrow);
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
    root.classList.remove("bhn-root-resizing");
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
    root.classList.add("bhn-root-resizing");
    window.addEventListener("pointermove", movePanelResize, { passive: false });
    window.addEventListener("pointerup", stopPanelResize);
    window.addEventListener("pointercancel", stopPanelResize);
    event.preventDefault();
    event.stopPropagation();
  }

  function constrainPanel() {
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
    root.classList.remove("bhn-root-dragging");
  }

  function startPanelDrag(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target && event.target.closest && event.target.closest("button")) return;
    var rect = root.getBoundingClientRect();
    panelPosition = { left: rect.left, top: rect.top };
    panelDrag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    root.classList.add("bhn-root-dragging");
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

  function cssPath(node) {
    var parts = [], guard = 0;
    while (node && node.nodeType === 1 && node !== document.body && guard++ < 9) {
      var segment = node.tagName.toLowerCase();
      var escapedId = cssIdent(node.id);
      if (escapedId) { parts.unshift(segment + "#" + escapedId); break; }
      var classes = classTokens(node).map(cssIdent).filter(Boolean).slice(0, 2);
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
    return !node || root.contains(node) || node === highlight || (node.closest && node.closest(".bhn-review-marker"));
  }

  function anchorsFor(node) {
    var quote = cleanText(node.innerText || node.textContent).slice(0, 600);
    return {
      anchorQuote: quote || null,
      anchorKey: keyOf(node),
      anchorPath: cssPath(node),
      anchorBlock: blockOf(node)
    };
  }

  function anchorTextMatches(node, quote) {
    if (!quote) return true;
    var text = cleanText(node.innerText || node.textContent);
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

  function findAnchor(comment) {
    var quote = cleanText(comment.anchorQuote);
    var node = safeQuery(comment.anchorPath, quote) || safeQuery(comment.anchorKey, quote);
    if (node) return node;
    if (quote) {
      var candidates = document.querySelectorAll("h1,h2,h3,h4,h5,p,a,button,li,label,blockquote,figcaption");
      for (var i = 0; i < candidates.length; i++) {
        if (!inOverlay(candidates[i]) && anchorTextMatches(candidates[i], quote)) return candidates[i];
      }
    }
    return safeQuery(comment.anchorPath, "") || safeQuery(comment.anchorKey, "");
  }

  function showHighlight(node) {
    if (!node || !node.isConnected) {
      highlightedNode = null;
      highlight.style.display = "none";
      return;
    }
    highlightedNode = node;
    var rect = node.getBoundingClientRect();
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
    return state.review.status && state.review.status !== "open";
  }

  function renderComposer(container) {
    if (isLocked()) {
      container.appendChild(make("div", "bhn-notice bhn-locked",
        "Round " + state.review.round + " was exported and is locked. It reopens when the next round starts."));
      return;
    }
    if (!state.selected) return;
    var box = make("section", "bhn-compose");
    box.appendChild(make("div", "bhn-compose-label", "Comment on selected element"));
    if (state.selected.anchorQuote) {
      box.appendChild(make("div", "bhn-quote", state.selected.anchorQuote.slice(0, 180)));
    }
    var textarea = make("textarea", "bhn-textarea");
    textarea.addEventListener("input", function(){ autoGrow(textarea); });
    textarea.setAttribute("placeholder", "What should change?");
    textarea.setAttribute("aria-label", "New review comment");
    textarea.value = state.draft;
    textarea.addEventListener("input", function(){ state.draft = textarea.value; });
    box.appendChild(textarea);
    var actions = make("div", "bhn-actions");
    actions.appendChild(addButton("Cancel", "bhn-btn", function(){ state.selected = null; state.draft = ""; render(); }));
    var submit = addButton(state.saving ? "Adding..." : "Add comment", "bhn-btn bhn-btn-primary", function(){ submitComment(textarea.value, null, state.selected); });
    submit.disabled = state.saving;
    actions.appendChild(submit);
    box.appendChild(actions);
    container.appendChild(box);
    window.setTimeout(function(){ textarea.focus(); }, 0);
  }

  function renderReplyComposer(card, thread) {
    if (isLocked()) return;
    if (state.replyTo !== thread.id) return;
    var wrap = make("div", "bhn-reply-compose");
    var textarea = make("textarea", "bhn-textarea");
    textarea.addEventListener("input", function(){ autoGrow(textarea); });
    textarea.setAttribute("placeholder", "Reply to this thread");
    textarea.setAttribute("aria-label", "Reply to " + thread.authorName);
    textarea.value = state.replyDraft;
    textarea.addEventListener("input", function(){ state.replyDraft = textarea.value; });
    wrap.appendChild(textarea);
    var actions = make("div", "bhn-actions");
    actions.appendChild(addButton("Cancel", "bhn-btn", function(){ state.replyTo = null; state.replyDraft = ""; render(); }));
    var submit = addButton(state.saving ? "Replying..." : "Reply", "bhn-btn bhn-btn-primary", function(){ submitComment(textarea.value, thread.id, null); });
    submit.disabled = state.saving;
    actions.appendChild(submit);
    wrap.appendChild(actions);
    card.appendChild(wrap);
    window.setTimeout(function(){ textarea.focus(); }, 0);
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
    if (isLocked()) return;
    var edit = addButton("Edit", "bhn-link-btn", function(){ beginEdit(comment); });
    edit.setAttribute("aria-label", "Edit " + (comment.parentId ? "reply" : "comment") + " by " + comment.authorName);
    container.appendChild(edit);
    var remove = addButton("Delete", "bhn-link-btn bhn-link-btn-danger", function(){ beginDelete(comment); });
    remove.setAttribute("aria-label", "Delete " + (comment.parentId ? "reply" : "comment") + " by " + comment.authorName);
    container.appendChild(remove);
  }

  function renderEditComposer(container, comment) {
    if (state.editingId !== comment.id) return;
    var wrap = make("div", "bhn-edit-compose");
    var textarea = make("textarea", "bhn-textarea");
    textarea.addEventListener("input", function(){ autoGrow(textarea); });
    textarea.setAttribute("aria-label", "Edit " + (comment.parentId ? "reply" : "comment") + " by " + comment.authorName);
    textarea.value = state.editDraft;
    textarea.addEventListener("input", function(){ state.editDraft = textarea.value; });
    wrap.appendChild(textarea);
    var actions = make("div", "bhn-actions");
    actions.appendChild(addButton("Cancel", "bhn-btn", function(){ state.editingId = null; state.editDraft = ""; render(); }));
    var save = addButton(state.saving ? "Saving..." : "Save", "bhn-btn bhn-btn-primary", function(){ updateComment(comment.id, textarea.value); });
    save.disabled = state.saving;
    actions.appendChild(save);
    wrap.appendChild(actions);
    container.appendChild(wrap);
    window.setTimeout(function(){ textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length); }, 0);
  }

  function renderDeleteConfirmation(container, comment) {
    if (state.deletingId !== comment.id) return;
    var wrap = make("div", "bhn-delete-confirm");
    // Name the author when you're about to remove someone else's.
    var whose = comment.isMine ? "this" : comment.authorName + "'s";
    wrap.appendChild(make("div", "bhn-delete-copy",
      comment.parentId
        ? "Delete " + whose + " reply?"
        : "Delete " + whose + " thread and its replies?"));
    var actions = make("div", "bhn-actions");
    actions.appendChild(addButton("Cancel", "bhn-btn", function(){ state.deletingId = null; render(); }));
    var remove = addButton(state.saving ? "Deleting..." : "Delete", "bhn-btn bhn-btn-danger", function(){ deleteComment(comment); });
    remove.disabled = state.saving;
    actions.appendChild(remove);
    wrap.appendChild(actions);
    container.appendChild(wrap);
  }

  function renderThread(comment, index) {
    var card = make("article", "bhn-thread");
    card.setAttribute("data-thread-id", comment.id);
    var hasFlashed = false;
    var expanded = !!state.expandedThreads[comment.id] || state.replyTo === comment.id || state.editingId === comment.id || state.deletingId === comment.id;
    var summary = make("div", "bhn-thread-summary");
    var toggle = make("button", "bhn-thread-toggle");
    toggle.setAttribute("type", "button");
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-label", (expanded ? "Collapse" : "Expand") + " comment " + (index + 1));
    toggle.appendChild(make("span", "bhn-number", String(index + 1)));
    var main = make("span", "bhn-thread-main");
    var line = make("span", "bhn-thread-line");
    line.appendChild(make("span", "bhn-author", comment.authorName));
    line.appendChild(make("span", "bhn-time", formatTime(comment.createdAt) + editedSuffix(comment)));
    line.appendChild(make("span", "bhn-status" + (comment.status === "open" ? "" : " bhn-status-resolved"), comment.status));
    main.appendChild(line);
    if (!expanded) main.appendChild(make("span", "bhn-thread-preview", cleanText(comment.body).slice(0, 100)));
    toggle.appendChild(main);
    toggle.appendChild(make("span", "bhn-disclosure", expanded ? "⌄" : "›"));
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
    var locate = addButton(missing ? "Not found" : "Show me", "bhn-thread-locate", function(){
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
    summary.appendChild(locate);
    card.appendChild(summary);

    if (expanded) {
      var details = make("div", "bhn-thread-details");
      if (state.editingId === comment.id) renderEditComposer(details, comment);
      else details.appendChild(make("div", "bhn-thread-body", comment.body));
      if (comment.anchorQuote) details.appendChild(make("div", "bhn-thread-quote", comment.anchorQuote.slice(0, 180)));

      var replies = repliesFor(comment.id);
      if (replies.length) {
        var replyList = make("div", "bhn-replies");
        replies.forEach(function(reply){
          var row = make("div", "bhn-reply");
          var replyHead = make("div", "bhn-reply-head");
          replyHead.appendChild(make("div", "bhn-reply-meta", reply.authorName + " · " + formatTime(reply.createdAt) + editedSuffix(reply)));
          var replyTools = make("div", "bhn-reply-tools");
          appendCommentTools(replyTools, reply);
          replyHead.appendChild(replyTools);
          row.appendChild(replyHead);
          if (state.editingId === reply.id) renderEditComposer(row, reply);
          else row.appendChild(make("div", "bhn-reply-body", reply.body));
          renderDeleteConfirmation(row, reply);
          replyList.appendChild(row);
        });
        details.appendChild(replyList);
      }

      // Reply is appended here rather than inside appendCommentTools, so it
      // needs the lock check of its own.
      if (!isLocked()) {
        var tools = make("div", "bhn-thread-tools");
        tools.appendChild(addButton("Reply", "bhn-link-btn", function(){
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

  function render() {
    root.textContent = "";
    root.setAttribute("class", (state.panelCollapsed ? "bhn-root-collapsed" : "") + (panelDrag ? " bhn-root-dragging" : ""));
    var shell = make("div", "bhn-shell" + (state.panelCollapsed ? " bhn-shell-collapsed" : ""));
    var head = make("header", "bhn-head");
    head.setAttribute("title", "Drag review panel");
    head.addEventListener("pointerdown", startPanelDrag);
    var dragHandle = make("span", "bhn-drag-handle");
    dragHandle.setAttribute("aria-hidden", "true");
    head.appendChild(dragHandle);
    var copy = make("div", "bhn-head-copy");
    copy.appendChild(make("div", "bhn-kicker", "BioHubNet review"));
    copy.appendChild(make("div", "bhn-title", state.review.title || initialTitle));
    var identity = state.viewer ? state.viewer.name : "Training Platform account required";
    copy.appendChild(make("div", "bhn-meta", "Round " + state.review.round + " · " + identity));
    head.appendChild(copy);
    var commentCount = topComments().length;
    var collapseLabel = state.panelCollapsed ? "Expand " + commentCount + " comments" : "Collapse comments";
    var collapse = addButton(state.panelCollapsed ? "☰ " + commentCount : "−", "bhn-icon-btn bhn-collapse", function(){
      state.panelCollapsed = !state.panelCollapsed;
      threadHighlight = null;
      showHighlight(null);
      render();
    });
    collapse.setAttribute("aria-label", collapseLabel);
    collapse.setAttribute("title", collapseLabel);
    head.appendChild(collapse);
    shell.appendChild(head);

    var body = make("div", "bhn-body");
    if (state.error) body.appendChild(make("div", "bhn-notice bhn-error", state.error));
    if (state.loading) {
      body.appendChild(make("div", "bhn-notice", "Loading team comments..."));
    } else if (!credential || !state.viewer) {
      /*
       * This used to be a dead end — "open this from the training
       * platform" — which made the share link useless to anybody
       * without an account, the exact people it exists for. Now it
       * asks for a name and lets them in.
       */
      var join = make("div", "bhn-notice");
      join.appendChild(make("div", "", "Add your name to comment on this page. No account needed."));
      var nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.placeholder = "Your name";
      nameInput.maxLength = 80;
      nameInput.setAttribute("class", "bhn-input");
      nameInput.style.cssText = "width:100%;margin-top:8px;padding:6px 8px;border:1px solid rgba(0,0,0,.2);border-radius:6px;font:inherit;";
      var go = make("button", "bhn-btn", state.joining ? "Joining..." : "Start reviewing");
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
      renderComposer(body);
      var list = make("div", "bhn-list");
      var threads = topComments();
      if (!threads.length) list.appendChild(make("div", "bhn-empty", "No comments yet. Click any page element to start a thread."));
      threads.forEach(function(comment, index){ list.appendChild(renderThread(comment, index)); });
      body.appendChild(list);
    }
    shell.appendChild(body);
    root.appendChild(shell);
    // On root, not in the shell: .bhn-shell is overflow:hidden and would
    // clip both the grip and its hit area. Nothing to widen when collapsed.
    if (!state.panelCollapsed) {
      var grip = make("button", "bhn-resize");
      grip.setAttribute("type", "button");
      grip.setAttribute("aria-label", "Drag to resize the review panel");
      grip.setAttribute("title", "Drag to resize");
      grip.addEventListener("pointerdown", startPanelResize);
      root.appendChild(grip);
    }
    applyPanelWidth();
    constrainPanel();
    syncMarkers();
  }

  function commentsSignature(comments) {
    return comments.map(function(comment){ return [comment.id, comment.body, comment.status, comment.editedAt, comment.editedByName].join(":"); }).join("|");
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
    if (!credential) {
      // Not an error any more — the panel offers a way in.
      state.loading = false;
      render();
      return;
    }
    try {
      var response = await fetch(endpoint, { headers: { "Authorization": "Bearer " + credential } });
      var data = await response.json().catch(function(){ return {}; });
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not load team comments.");
      var changed = commentsSignature(state.comments) !== commentsSignature(data.comments || []);
      state.review = data.review;
      state.viewer = data.viewer;
      state.comments = data.comments || [];
      state.error = "";
      state.loading = false;
      var active = document.activeElement;
      if (silent && changed && active && root.contains(active) && active.tagName === "TEXTAREA") {
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
    var body = String(value || "").trim();
    if (body.length < 2 || state.saving) return;
    state.saving = true;
    state.error = "";
    render();
    try {
      var payload = { body: body, parentId: parentId || null };
      if (anchors) {
        payload.anchorQuote = anchors.anchorQuote;
        payload.anchorKey = anchors.anchorKey;
        payload.anchorPath = anchors.anchorPath;
        payload.anchorBlock = anchors.anchorBlock;
      }
      var response = await fetch(endpoint, {
        method: "POST",
        headers: { "Authorization": "Bearer " + credential, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      var data = await response.json().catch(function(){ return {}; });
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not save the comment.");
      if (parentId) state.expandedThreads[parentId] = true;
      else if (data.comment && data.comment.id) state.expandedThreads[data.comment.id] = true;
      state.selected = null;
      state.draft = "";
      state.replyTo = null;
      state.replyDraft = "";
      state.saving = false;
      await loadComments(false);
    } catch (error) {
      state.saving = false;
      state.error = error && error.message ? error.message : "Could not save the comment.";
      render();
    }
  }

  async function updateComment(commentId, value) {
    var body = String(value || "").trim();
    if (body.length < 2 || state.saving) return;
    state.saving = true;
    state.error = "";
    render();
    try {
      var response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Authorization": "Bearer " + credential, "Content-Type": "application/json" },
        body: JSON.stringify({ id: commentId, body: body })
      });
      var data = await response.json().catch(function(){ return {}; });
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not update the comment.");
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
      var response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + credential, "Content-Type": "application/json" },
        body: JSON.stringify({ id: comment.id })
      });
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
  }

  function focusThread(comment, anchor) {
    showHighlight(anchor);
    if (!state.expandedThreads[comment.id]) {
      state.expandedThreads[comment.id] = true;
      render();
    }
    var card = root.querySelector('[data-thread-id="' + comment.id + '"]');
    if (card) {
      card.setAttribute("class", "bhn-thread bhn-thread-active");
      card.scrollIntoView({ block: "nearest", behavior: "smooth" });
      window.setTimeout(function(){ card.setAttribute("class", "bhn-thread"); }, 1400);
    }
  }

  function syncMarkers() {
    if (positionFrame) window.cancelAnimationFrame(positionFrame);
    positionFrame = window.requestAnimationFrame(function(){
      removeMarkers();
      var placedAnchors = [];
      topComments().forEach(function(comment, index){
        var anchor = findAnchor(comment);
        if (!anchor) return;
        var rect = anchor.getBoundingClientRect();
        if (!rect.width && !rect.height) return;
        var sharedIndex = placedAnchors.filter(function(placed){ return placed === anchor; }).length;
        placedAnchors.push(anchor);
        var marker = make("button", "bhn-review-marker" + (comment.status === "open" ? "" : " bhn-review-marker-resolved"), String(index + 1));
        marker.setAttribute("type", "button");
        marker.setAttribute("aria-label", "Open comment " + (index + 1) + " by " + comment.authorName);
        marker.style.left = Math.max(4, rect.right - 13 - (sharedIndex * 29)) + "px";
        marker.style.top = Math.max(4, rect.top - 13) + "px";
        marker.addEventListener("click", function(event){ event.preventDefault(); event.stopPropagation(); focusThread(comment, anchor); });
        document.body.appendChild(marker);
        markers.push(marker);
      });
    });
  }

  function onMove(event) {
    if (inOverlay(event.target)) {
      if (threadHighlight) showHighlight(threadHighlight);
      else showHighlight(null);
      return;
    }
    threadHighlight = null;
    showHighlight(event.target);
  }

  function onClick(event) {
    if (inOverlay(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    state.selected = anchorsFor(event.target);
    state.draft = "";
    state.replyTo = null;
    threadHighlight = null;
    showHighlight(event.target);
    render();
  }

  function onPositionChange() {
    constrainPanel();
    if (highlightedNode) showHighlight(highlightedNode);
    syncMarkers();
  }

  function cleanup() {
    stopPanelDrag();
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    window.removeEventListener("scroll", onPositionChange, true);
    window.removeEventListener("resize", onPositionChange);
    if (pollTimer) window.clearInterval(pollTimer);
    if (positionFrame) window.cancelAnimationFrame(positionFrame);
    removeMarkers();
    highlight.remove();
    root.remove();
    style.remove();
    window.__bhnReviewCleanup = null;
  }

  window.__bhnReviewCleanup = cleanup;
  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  window.addEventListener("scroll", onPositionChange, true);
  window.addEventListener("resize", onPositionChange);
  pollTimer = window.setInterval(function(){ loadComments(true); }, 5000);
  render();
  loadComments(false);
})();`;
}
