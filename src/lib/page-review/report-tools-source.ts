/** Report-only review tools. Uses the overlay's existing comment API and anchor format. */
export function reportToolsSource(): string {
  return String.raw`
  var reportPageDrafts = new Map();
  var reportInsertLine = null;
  var reportInsertion = null;
  var reportToolsObserver = null;
  function reportHasPageDrafts() {
    return Array.from(reportPageDrafts.values()).some(function(value){ return value.trim(); });
  }
  function reportDraftStatus() {
    if (!reportReview) return;
    var dirty = !!(state.saving || state.draft.trim() || state.replyDraft.trim() || state.editingId || reportHasPageDrafts());
    if (root.getAttribute("data-report-comments-dirty") !== String(dirty)) {
      root.setAttribute("data-report-comments-dirty", String(dirty));
      window.dispatchEvent(new CustomEvent("bhn-report-comment-draft", { detail: dirty }));
    }
  }
  function reportMode(editing, inserting) {
    state.pickingElement = !editing && !inserting;
    state.insertingSection = !!inserting;
    state.selected = null;
    reportInsertion = null;
    if (reportInsertLine) reportInsertLine.hidden = true;
    showHighlight(null);
    render();
  }
  function reportPageNotes() {
    if (!reportReview) return;
    document.querySelectorAll('[data-report-page-notes]').forEach(function(host){
      var sheet = host.closest('[id^="report-frame-"]');
      var page = sheet && sheet.querySelector('[data-print-page]');
      if (!page) return;
      var frame = host.getAttribute('data-report-page-notes');
      var label = page.getAttribute('aria-label') || frame;
      if (host.getAttribute('data-notes-round') !== String(state.pageRound)) {
        host.textContent = '';
        host.setAttribute('data-notes-round', String(state.pageRound));
        var title = make('label', '', 'Page feedback');
        var box = make('textarea', '');
        box.id = 'page-feedback-' + frame;
        title.htmlFor = box.id;
        box.setAttribute('aria-label', 'Page feedback: ' + label);
        box.placeholder = 'Anything to add or change on this page?';
        box.maxLength = 7900;
        box.value = reportPageDrafts.get(frame) || '';
        box.addEventListener('input', function(){ reportPageDrafts.set(frame, box.value); reportDraftStatus(); });
        var save = addButton('Add page comment', '', async function(){
          if (isLocked() || state.saving || box.value.trim().length < 2) return;
          var anchors = anchorsFor(page);
          anchors.anchorQuote = null;
          anchors.anchorBlock = (page.getAttribute('aria-label') || frame) + ' · Page feedback';
          var ok = await submitComment(box.value, null, anchors);
          if (ok) { box.value = ''; reportPageDrafts.delete(frame); }
          reportDraftStatus(); reportPageNotes();
        });
        var cancel = addButton('Clear draft', '', function(){ box.value = ''; reportPageDrafts.delete(frame); reportDraftStatus(); });
        host.appendChild(title); host.appendChild(box); host.appendChild(save); host.appendChild(cancel);
      }
      host.querySelector('textarea').setAttribute('aria-label', 'Page feedback: ' + label);
      host.querySelectorAll('textarea,button').forEach(function(el){ el.disabled = !state.viewer || isLocked() || state.saving; });
    });
    reportDraftStatus();
  }
  function renderReportTools(body) {
    if (!reportReview) return;
    var host = document.querySelector('[data-report-tools-host]');
    if (host && root.parentElement !== host) host.appendChild(root);
    root.setAttribute('data-report-tools', 'true');
    if (host) root.setAttribute('data-docked', 'true');
    var toolbar = make('div', 'bhn-report-toolbar');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Report review toolbar');
    if (state.viewer && !isLocked()) {
      var edit = addButton('Edit text and photos', 'bhn-rv-btn', function(){ reportMode(true, false); });
      edit.setAttribute('aria-pressed', String(!state.pickingElement && !state.insertingSection));
      edit.disabled = state.saving || !!state.draft.trim() || state.replyTo !== null || state.editingId !== null;
      var insert = addButton('Add a section', 'bhn-rv-btn', function(){ reportMode(false, !state.insertingSection); });
      insert.setAttribute('aria-pressed', String(!!state.insertingSection));
      insert.disabled = edit.disabled;
      toolbar.appendChild(edit); toolbar.appendChild(insert);
    }
    Array.from(body.children).filter(function(el){ return el.matches('.bhn-rv-element-pick,.bhn-rv-compare-open'); }).forEach(function(el){ toolbar.appendChild(el); });
    body.prepend(toolbar);
    if (state.insertingSection) {
      var tip = make('p', 'bhn-rv-notice', 'Click a gap between items on the report. Describe the new section; it will remain a pinned insertion request until the next revision.');
      toolbar.after(tip);
    }
    reportPageNotes();
    if (!reportToolsObserver) {
      var stage = document.querySelector('[data-report-paper]');
      if (stage) {
        reportToolsObserver = new MutationObserver(function(){ reportPageNotes(); });
        reportToolsObserver.observe(stage, { childList: true, subtree: true });
      }
    }
  }
  function reportGap(event) {
    var page = event.target.closest && event.target.closest(scopeSelector);
    if (!page) return null;
    var candidates = Array.from(page.querySelectorAll('h1,h2,h3,p,li,blockquote,figure')).filter(function(node){
      return !node.closest('figure') || node.tagName === 'FIGURE';
    });
    var best = null, distance = Infinity;
    candidates.forEach(function(node){
      var r = node.getBoundingClientRect();
      if (!r.width || !r.height) return;
      [false,true].forEach(function(after){
        var y = after ? r.bottom : r.top;
        if (Math.abs(event.clientY-y) < distance) { distance = Math.abs(event.clientY-y); best = { node:node, after:after, y:y, page:page }; }
      });
    });
    return best;
  }
  function reportInsertionMove(event) {
    if (!reportReview || !state.insertingSection || isLocked()) return false;
    reportInsertion = reportGap(event);
    if (!reportInsertLine) {
      reportInsertLine = make('div', 'bhn-report-insertion-line', 'Insert section here');
      reportInsertLine.setAttribute('aria-hidden','true');
      document.body.appendChild(reportInsertLine);
    }
    reportInsertLine.hidden = !reportInsertion;
    if (reportInsertion) {
      var r = reportInsertion.page.getBoundingClientRect();
      reportInsertLine.style.left = r.left + 'px';
      reportInsertLine.style.width = r.width + 'px';
      reportInsertLine.style.top = reportInsertion.y + 'px';
    }
    return true;
  }
  function reportInsertionClick(event) {
    if (!reportReview || !state.insertingSection || isLocked()) return false;
    var gap = reportGap(event);
    if (!gap) return false;
    event.preventDefault(); event.stopPropagation();
    var anchors = anchorsFor(gap.node);
    anchors.insertion = gap.after ? 'after' : 'before';
    anchors.anchorBlock = ((gap.page.getAttribute('aria-label') || '') + ' · Insert section ' + anchors.insertion + ' this element').slice(0,200);
    state.selected = anchors;
    state.insertingSection = false;
    state.pickingElement = true;
    state.panelCollapsed = false;
    if (reportInsertLine) reportInsertLine.hidden = true;
    render();
    return true;
  }
  function reportInsertionMarker(marker, comment, anchor) {
    if (!reportReview || !comment.body.startsWith('[Section insertion request]')) return;
    var page = anchor.closest(pageSelector);
    if (!page) return;
    var p = page.getBoundingClientRect(), r = anchor.getBoundingClientRect();
    marker.classList.add('bhn-report-insertion-bubble');
    marker.textContent = comment.body.replace(/^\[Section insertion request\]\s*/, '').slice(0,160);
    marker.style.left = Math.max(4,p.left-182) + 'px';
    marker.style.top = Math.max(4,(comment.anchorBlock || '').includes('Insert section after') ? r.bottom : r.top) + 'px';
    marker.style.setProperty('--insertion-line-width', Math.max(24,p.left-Math.max(4,p.left-182)-12) + 'px');
  }
  function cleanupReportTools() {
    if (reportToolsObserver) reportToolsObserver.disconnect();
    if (reportInsertLine) reportInsertLine.remove();
    document.querySelectorAll('[data-report-page-notes]').forEach(function(el){ el.textContent = ''; el.removeAttribute('data-notes-round'); });
  }
  if (reportReview) style.textContent += '\n#bhn-review-overlay[data-report-tools=true]{left:12px;right:auto;top:100px;bottom:auto;}#bhn-review-overlay[data-docked=true]{position:relative!important;inset:auto!important;width:100%!important;max-height:none;z-index:30;margin-bottom:16px;}#bhn-review-overlay[data-docked=true] .bhn-rv-shell{max-height:64vh;box-shadow:none;background:#f8fafb;backdrop-filter:none;-webkit-backdrop-filter:none;}#bhn-review-overlay[data-docked=true] .bhn-rv-head{cursor:default;}#bhn-review-overlay[data-docked=true] .bhn-rv-drag-handle{display:none;}#bhn-review-overlay[data-report-tools=true] .bhn-rv-copy-comments{position:fixed;left:12px;bottom:48px;width:176px;margin:0;min-height:44px;font-size:12px;white-space:normal;box-shadow:0 3px 14px #17212b24;background:#fff;} .bhn-report-toolbar{display:grid;gap:6px;margin-bottom:8px;}.bhn-report-toolbar .bhn-rv-btn{width:100%;min-height:38px;text-align:left;font-size:12px;padding:8px 10px;}.bhn-report-toolbar [aria-pressed=true]{background:#d9eef0;border-color:#176879;color:#134d59;}.bhn-report-insertion-line{position:fixed;z-index:2147483646;border-top:3px dashed #9c3a88;pointer-events:none;font:700 12px Arial,sans-serif;color:#73285f;text-align:center;}.bhn-report-insertion-bubble{width:170px!important;height:auto!important;min-height:46px!important;border-radius:8px!important;padding:8px!important;font:12px/1.35 Arial,sans-serif!important;white-space:normal!important;text-align:left!important;background:#f8e9f4!important;border:1px solid #9c3a88!important;color:#662454!important;}.bhn-report-insertion-bubble::after{content:"";position:absolute;left:100%;top:0;width:var(--insertion-line-width,36px);border-top:2px dashed #9c3a88;}@media print{[data-report-tools],.bhn-report-insertion-line,.bhn-report-insertion-bubble{display:none!important;}}';
`;
}
