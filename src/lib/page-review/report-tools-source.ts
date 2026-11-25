import { reportUnifiedSource } from "./report-unified-source";
import { reportPanelSizeSource } from "./report-panel-size-source";

/** Report-only review tools. Uses the overlay's existing comment API and anchor format. */
export function reportToolsSource(): string {
  return String.raw`
  ${reportPanelSizeSource()}
  ${reportUnifiedSource()}
  var reportDrawMode = null;
  var reportDrawDrag = null;
  var reportDrawPreview = null;
  var reportDrawSuppressClick = false;
  function reportAnnotationDraft() { return !!(reportDrawDrag || (state.selected && state.selected.drawing)); }
  function reportDrawingData(comment) {
    var match = /\[draw:(circle|line):([0-9.,]+)\]/.exec(comment.anchorBlock || '');
    if (!match) return null;
    var p = match[2].split(',').map(Number);
    return p.length === 4 && p.every(function(v){return Number.isFinite(v) && v >= 0 && v <= 1;}) ? { shape: match[1], points:p } : null;
  }
  function reportDrawSvg(page, drawing, draft, rect) {
    var r = rect || page.getBoundingClientRect(), p = drawing.points;
    var svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('class','bhn-report-drawing' + (draft ? ' bhn-report-drawing-draft' : ''));
    svg.setAttribute('aria-hidden','true'); svg.style.left=r.left+'px'; svg.style.top=r.top+'px'; svg.style.width=r.width+'px'; svg.style.height=r.height+'px';
    svg.setAttribute('viewBox','0 0 1000 1000'); svg.setAttribute('preserveAspectRatio','none');
    var shape = document.createElementNS('http://www.w3.org/2000/svg',drawing.shape === 'circle' ? 'ellipse' : 'line');
    if (drawing.shape === 'circle') {
      shape.setAttribute('cx',String((p[0]+p[2])*500)); shape.setAttribute('cy',String((p[1]+p[3])*500));
      shape.setAttribute('rx',String(Math.abs(p[2]-p[0])*500)); shape.setAttribute('ry',String(Math.abs(p[3]-p[1])*500));
    } else { ['x1','y1','x2','y2'].forEach(function(key,i){shape.setAttribute(key,String(p[i]*1000));}); }
    shape.setAttribute('vector-effect','non-scaling-stroke'); svg.appendChild(shape); return svg;
  }
  function reportDrawRefresh() {
    if (reportDrawPreview) { reportDrawPreview.remove(); reportDrawPreview=null; }
    var selected = state.selected;
    var drawing = reportDrawDrag || (selected && selected.drawing);
    var page = reportDrawDrag ? reportDrawDrag.page : selected && selected.anchorKey && document.querySelector(selected.anchorKey + ' article');
    if (drawing && page) { reportDrawPreview=reportDrawSvg(page,drawing,true); document.body.appendChild(reportDrawPreview); }
  }
  function reportDrawPoint(event,page) { var r=page.getBoundingClientRect();return [Math.min(1,Math.max(0,(event.clientX-r.left)/r.width)),Math.min(1,Math.max(0,(event.clientY-r.top)/r.height))]; }
  function reportDrawStart(event) {
    if (!reportReview || !reportDrawMode || isLocked() || state.saving || !state.viewer || event.button !== 0) return;
    var page = event.target.closest && event.target.closest(scopeSelector); if (!page) return;
    event.preventDefault();event.stopPropagation();
    var point=reportDrawPoint(event,page); reportDrawDrag={shape:reportDrawMode,page:page,points:point.concat(point)}; reportDrawRefresh();reportDraftStatus();
  }
  function reportDrawMove(event) {
    if (!reportDrawDrag) return;
    event.preventDefault();event.stopPropagation(); reportDrawDrag.points.splice(2,2,...reportDrawPoint(event,reportDrawDrag.page));reportDrawRefresh();
  }
  function reportDrawCancel() { reportDrawDrag=null;reportDrawRefresh();reportDraftStatus(); }
  function reportDrawEnd(event) {
    if (!reportDrawDrag) return;
    event.preventDefault();event.stopPropagation();
    var drawing=reportDrawDrag; drawing.points.splice(2,2,...reportDrawPoint(event,drawing.page));reportDrawDrag=null;reportDrawSuppressClick=true;
    var r=drawing.page.getBoundingClientRect();
    if (Math.hypot((drawing.points[2]-drawing.points[0])*r.width,(drawing.points[3]-drawing.points[1])*r.height)<8) {reportDrawRefresh();reportDraftStatus();return;}
    var cx=r.left+(drawing.points[0]+drawing.points[2])/2*r.width,cy=r.top+(drawing.points[1]+drawing.points[3])/2*r.height;
    var target=document.elementsFromPoint(cx,cy).map(function(el){return el.closest(reportTargets);}).find(function(el){return el&&drawing.page.contains(el);});
    var anchor=anchorsFor(target||drawing.page);
    anchor.anchorBlock=((drawing.page.getAttribute('aria-label')||'').slice(0,100)+' · [draw:'+drawing.shape+':'+drawing.points.map(function(n){return n.toFixed(4);}).join(',')+']').slice(0,200);
    anchor.drawing={shape:drawing.shape,points:drawing.points};state.selected=anchor;state.panelCollapsed=false;state.draft='';reportDrawMode=null;state.pickingElement=false;render();
  }
  function reportDrawingMarker(marker,comment,anchor,rect,existing) {
    var drawing=reportDrawingData(comment),page=anchor.closest(pageSelector);
    if(!drawing||!page){if(existing)existing.remove();return null;}
    var r=rect||page.getBoundingClientRect(),svg=existing;
    var signature=JSON.stringify(drawing);
    if(!svg||svg.dataset.drawing!==signature){if(svg)svg.remove();svg=reportDrawSvg(page,drawing,false,r);svg.dataset.drawing=signature;document.body.appendChild(svg);}
    else{svg.style.left=r.left+'px';svg.style.top=r.top+'px';svg.style.width=r.width+'px';svg.style.height=r.height+'px';}
    marker.style.left=(r.left+drawing.points[2]*r.width-12)+'px';marker.style.top=(r.top+drawing.points[3]*r.height-12)+'px';
    return svg;
  }

  if (reportReview) {
    document.addEventListener('pointerdown',reportDrawStart,true);document.addEventListener('pointermove',reportDrawMove,true);document.addEventListener('pointerup',reportDrawEnd,true);
    document.addEventListener('pointercancel',reportDrawCancel,true);
  }

  var reportPageDrafts = new Map();
  var reportInsertLine = null;
  var reportInsertion = null;
  var reportToolsObserver = null;
  var reportNotesFrame = null;
  function reportHasPageDrafts() {
    return Array.from(reportPageDrafts.values()).some(function(value){ return value.trim(); });
  }
  function reportDraftStatus() {
    if (!reportReview) return;
    var dirty = !!(state.saving || state.draft.trim() || state.replyDraft.trim() || state.editingId || reportHasPageDrafts() || reportAnnotationDraft());
    if (root.getAttribute("data-report-comments-dirty") !== String(dirty)) {
      root.setAttribute("data-report-comments-dirty", String(dirty));
      window.dispatchEvent(new CustomEvent("bhn-report-comment-draft", { detail: dirty }));
    }
  }
  function reportMode(editing, inserting) {
    reportDrawMode=null; reportDrawDrag=null;reportDrawSuppressClick=false;
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
      var textarea=host.querySelector('textarea'),ariaLabel='Page feedback: '+label;
      if(textarea.getAttribute('aria-label')!==ariaLabel)textarea.setAttribute('aria-label',ariaLabel);
      var disabled=!state.viewer||isLocked()||state.saving;
      host.querySelectorAll('textarea,button').forEach(function(el){if(el.disabled!==disabled)el.disabled=disabled;});
    });
    reportDrawRefresh();reportDraftStatus();
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
    var more=make('details','bhn-report-menu');var moreSummary=make('summary','','⋯');moreSummary.setAttribute('aria-label','More review tools');more.appendChild(moreSummary);var moreBody=make('div','bhn-report-menu-content');more.appendChild(moreBody);
    if (state.viewer && !isLocked()) {
      var disabled=state.saving||!!state.draft.trim()||state.replyTo!==null||state.editingId!==null||reportAnnotationDraft();
      var edit=addButton('Edit & comment','bhn-rv-btn bhn-report-unified',function(){reportMode(true,false);});edit.setAttribute('aria-pressed',String(!state.pickingElement&&!state.insertingSection&&!reportDrawMode));edit.disabled=disabled;toolbar.appendChild(edit);
      var insert=addButton('+ Section','bhn-rv-btn',function(){reportMode(false,!state.insertingSection);});insert.setAttribute('aria-label','Add a section');insert.setAttribute('aria-pressed',String(!!state.insertingSection));insert.disabled=disabled;toolbar.appendChild(insert);
      var draw=make('details','bhn-report-menu');draw.appendChild(make('summary','','Draw'));var drawBody=make('div','bhn-report-menu-content');draw.appendChild(drawBody);
      ['circle','line'].forEach(function(shape){var button=addButton(shape==='circle'?'Circle comment':'Line comment','bhn-rv-btn',function(){var next=reportDrawMode===shape?null:shape;reportMode(true,false);reportDrawMode=next;state.pickingElement=!!next;render();});button.setAttribute('aria-pressed',String(reportDrawMode===shape));button.disabled=disabled;drawBody.appendChild(button);});toolbar.appendChild(draw);
    }
    Array.from(body.children).filter(function(el){return el.matches('.bhn-rv-element-pick,.bhn-rv-compare-open');}).forEach(function(el){moreBody.appendChild(el);});
    var feedbackHistory=make('a','bhn-rv-btn','Feedback history · admin');feedbackHistory.href='/admin/workspace/reviewer-feedback?review=symposium-2026-event-report';feedbackHistory.target='_blank';feedbackHistory.rel='noopener';moreBody.appendChild(feedbackHistory);
    toolbar.appendChild(more);body.prepend(toolbar);renderReportPanelSize(body,moreBody);
    if(state.viewer&&!isLocked()&&!state.insertingSection&&!reportDrawMode){var guide=make('p','bhn-report-guide','Click text or a photo to edit. Use the nearby comment icon for feedback.');toolbar.after(guide);}
    if (state.insertingSection) {
      var tip = make('p', 'bhn-rv-notice', 'Click a gap between items on the report. Describe the new section; it will remain a pinned insertion request until the next revision.');
      toolbar.after(tip);
    }
    if (reportDrawMode) toolbar.after(make('p','bhn-rv-notice','Drag on a report page to draw a '+reportDrawMode+', or focus an item and press Enter. Then add your comment. Escape cancels the drawing.'));
    reportDrawRefresh();reportPageNotes();
    if (!reportToolsObserver) {
      var stage = document.querySelector('[data-report-paper]');
      if (stage) {
        var notesChanged=false,contentChanged=false;
        reportToolsObserver = new MutationObserver(function(records){
          records.forEach(function(record){
            if(record.type==='attributes'){if(record.target.matches(pageSelector))notesChanged=true;else if(record.target.closest('[data-report-field],figure[data-report-photo]'))contentChanged=true;return;}
            var target=record.target.nodeType===3?record.target.parentElement:record.target;
            if(!target||target.closest('[data-report-page-notes]'))return;
            if(record.type==='characterData'){if(target.closest('[data-report-field],figure[data-report-photo]'))contentChanged=true;return;}
            Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).forEach(function(node){
              if(node.nodeType===3){if(target.closest('[data-report-field],figure[data-report-photo]'))contentChanged=true;return;}
              if(node.nodeType===1&&(node.matches('[data-report-field]')||node.querySelector('[data-report-field]')))contentChanged=true;
              if(node.nodeType===1&&(node.matches('[data-print-page],[data-report-page-notes]')||node.querySelector('[data-print-page],[data-report-page-notes]')))notesChanged=true;
            });
          });
          if((!notesChanged&&!contentChanged)||reportNotesFrame)return;
          reportNotesFrame=window.requestAnimationFrame(function(){
            reportNotesFrame=null;markerAnchorCache.clear();if(notesChanged)reportPageNotes();notesChanged=false;contentChanged=false;syncMarkers();drawTagLauncher();
          });
        });
        reportToolsObserver.observe(stage, { childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-label','alt','src','data-report-field','data-report-text-start','data-report-text-end'] });
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
    state.pickingElement = false;
    state.panelCollapsed = false;
    if (reportInsertLine) reportInsertLine.hidden = true;
    render();
    return true;
  }
  function reportInsertionMarker(marker, comment, anchor, anchorRect, pageRect) {
    if (!reportReview || !comment.body.startsWith('[Section insertion request]')) return;
    var page = anchor.closest(pageSelector);
    if (!page) return;
    var p = pageRect || page.getBoundingClientRect(), r = anchorRect || anchor.getBoundingClientRect();
    marker.classList.add('bhn-report-insertion-bubble');
    marker.textContent = comment.body.replace(/^\[Section insertion request\]\s*/, '').slice(0,160);
    marker.style.left = Math.max(4,p.left-182) + 'px';
    marker.style.top = Math.max(4,(comment.anchorBlock || '').includes('Insert section after') ? r.bottom : r.top) + 'px';
    marker.style.setProperty('--insertion-line-width', Math.max(24,p.left-Math.max(4,p.left-182)-12) + 'px');
  }
  function cleanupReportTools() {
    document.removeEventListener('keydown',reportDrawEscape,true);
    document.removeEventListener('focusin',reportFocusComment);
    if(reportCommentButton)reportCommentButton.remove();
    root.removeEventListener('toggle',reportMenuPosition,true);
    document.removeEventListener('keydown',reportMenuEscape);
    document.removeEventListener('pointerdown',reportDrawStart,true);document.removeEventListener('pointermove',reportDrawMove,true);document.removeEventListener('pointerup',reportDrawEnd,true);document.removeEventListener('pointercancel',reportDrawCancel,true);
    if (reportDrawPreview) reportDrawPreview.remove();
    if (reportToolsObserver) reportToolsObserver.disconnect();
    if (reportNotesFrame) window.cancelAnimationFrame(reportNotesFrame);
    if (reportInsertLine) reportInsertLine.remove();
    document.querySelectorAll('[data-report-page-notes]').forEach(function(el){ el.textContent = ''; el.removeAttribute('data-notes-round'); });
  }
  if (reportReview) document.addEventListener('keydown',reportDrawEscape,true);
  function reportDrawEscape(event) {
    if(event.key==='Escape'&&state.pickingElement&&!reportDrawMode&&!state.selected&&!state.insertingSection){state.pickingElement=false;render();return;}
    if (event.key==='Escape' && (reportDrawMode||reportAnnotationDraft())) { reportDrawMode=null;reportDrawDrag=null;reportDrawSuppressClick=false;state.selected=null;state.draft='';state.pickingElement=false;render();return; }
    var page=event.target.closest&&event.target.closest(scopeSelector);
    if (!reportDrawMode||!page||isLocked()) return;
    if (event.key==='Enter') {
      event.preventDefault();event.stopPropagation();
      var target=event.target.closest(reportTargets)||event.target,r=target.getBoundingClientRect(),p=page.getBoundingClientRect();
      var x=Math.max(p.left,r.left-4),y=reportDrawMode==='line'?Math.min(p.bottom,r.bottom+2):Math.max(p.top,r.top-4),right=Math.min(p.right,r.right+4),bottom=reportDrawMode==='line'?y:Math.min(p.bottom,r.bottom+4);
      reportDrawDrag={page:page,shape:reportDrawMode,points:reportDrawPoint({clientX:x,clientY:y},page).concat(reportDrawPoint({clientX:right,clientY:bottom},page))};
      reportDrawEnd({clientX:right,clientY:bottom,preventDefault:function(){},stopPropagation:function(){}});
    } else if (event.key.length===1&&!event.ctrlKey&&!event.metaKey) {event.preventDefault();event.stopPropagation();}
  }

  if (reportReview) style.textContent += '\n#bhn-review-overlay[data-report-tools=true]{left:12px;right:auto;top:100px;bottom:auto;}#bhn-review-overlay[data-docked=true]{position:relative!important;inset:auto!important;width:100%!important;max-height:none;z-index:30;margin-bottom:16px;}#bhn-review-overlay[data-docked=true] .bhn-rv-shell{max-height:64vh;box-shadow:none;background:#f8fafb;backdrop-filter:none;-webkit-backdrop-filter:none;}#bhn-review-overlay[data-docked=true] .bhn-rv-head{cursor:default;}#bhn-review-overlay[data-docked=true] .bhn-rv-drag-handle{display:none;}#bhn-review-overlay[data-report-tools=true] .bhn-report-copy-flow{position:fixed;left:12px;bottom:48px;width:176px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 100px);overflow:auto;display:grid;gap:8px;}#bhn-review-overlay[data-report-tools=true] .bhn-report-copy-flow[data-stage=confirm],#bhn-review-overlay[data-report-tools=true] .bhn-report-copy-flow[data-stage=copied]{width:320px;padding:12px;border:1px solid #c6d3dc;border-radius:8px;background:#fff;box-shadow:0 3px 14px #17212b24;}#bhn-review-overlay[data-report-tools=true] .bhn-rv-copy-comments{position:static;width:100%;margin:0;min-height:44px;font-size:12px;white-space:normal;box-shadow:0 3px 14px #17212b24;background:#fff;}#bhn-review-overlay .bhn-report-copy-flow[data-stage=confirm]>.bhn-rv-copy-comments{display:none;}#bhn-review-overlay .bhn-rv-copy-confirm{display:grid;gap:8px;margin:0;padding:10px;font-size:12px;}#bhn-review-overlay .bhn-rv-copy-confirm p{margin:0;}#bhn-review-overlay .bhn-rv-copy-confirm button{width:100%;min-height:44px;white-space:normal;} body:has(#bhn-review-overlay[data-report-draw-mode]:not([data-report-draw-mode=""])) [data-print-page]{cursor:crosshair;touch-action:none;user-select:none;}.bhn-report-drawing{position:fixed;z-index:2147483645;pointer-events:none;overflow:visible;}.bhn-report-drawing>*{fill:transparent;stroke:#a44082;stroke-width:2.5px;}.bhn-report-drawing-draft>*{stroke-dasharray:6 4;} .bhn-report-toolbar{position:sticky;top:-6px;z-index:2;background:#f8fafb;padding-bottom:8px;display:grid;gap:6px;margin-bottom:8px;}.bhn-report-toolbar .bhn-rv-btn{width:100%;min-height:38px;text-align:left;font-size:12px;padding:8px 10px;}.bhn-report-toolbar [aria-pressed=true]{background:#d9eef0;border-color:#176879;color:#134d59;}.bhn-report-insertion-line{position:fixed;z-index:2147483646;border-top:3px dashed #9c3a88;pointer-events:none;font:700 12px Arial,sans-serif;color:#73285f;text-align:center;}.bhn-report-insertion-bubble{width:170px!important;height:auto!important;min-height:46px!important;border-radius:8px!important;padding:8px!important;font:12px/1.35 Arial,sans-serif!important;white-space:normal!important;text-align:left!important;background:#f8e9f4!important;border:1px solid #9c3a88!important;color:#662454!important;}.bhn-report-insertion-bubble::after{content:"";position:absolute;left:100%;top:0;width:var(--insertion-line-width,36px);border-top:2px dashed #9c3a88;}@media print{[data-report-tools],.bhn-report-insertion-line,.bhn-report-insertion-bubble,.bhn-report-drawing{display:none!important;}}';
`;
}
