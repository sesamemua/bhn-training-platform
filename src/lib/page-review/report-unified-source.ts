/** The report's direct-edit workflow and contextual comment action. */
export function reportUnifiedSource(): string {
  return String.raw`
  function reportMenuPosition(){
    root.querySelectorAll('.bhn-report-menu[open]').forEach(function(menu){var content=menu.querySelector('.bhn-report-menu-content'),r=menu.querySelector('summary').getBoundingClientRect();content.style.top=(r.bottom+4)+'px';content.style.right=Math.max(8,window.innerWidth-r.right)+'px';content.style.maxHeight=Math.max(100,window.innerHeight-r.bottom-16)+'px';});
  }
  function reportMenuEscape(event){if(event.key!=='Escape')return;var open=root.querySelector('.bhn-report-menu[open]');if(open){open.open=false;open.querySelector('summary').focus({preventScroll:true});}}
  if(reportReview){root.addEventListener('toggle',reportMenuPosition,true);document.addEventListener('keydown',reportMenuEscape);}

  var reportCommentTarget = null;
  var reportCommentButton = null;
  function reportCommentPosition() {
    if (!reportCommentButton || !reportCommentTarget || !reportCommentTarget.isConnected || isLocked() || state.pageRound !== state.review.round) {
      if(reportCommentButton)reportCommentButton.hidden=true;
      return;
    }
    var r=reportCommentTarget.getBoundingClientRect();
    reportCommentButton.hidden=!r.width||!r.height||r.bottom<0||r.top>window.innerHeight;
    reportCommentButton.style.left=Math.max(4,Math.min(window.innerWidth-44,r.right-52))+'px';
    reportCommentButton.style.top=Math.max(4,Math.min(window.innerHeight-44,r.top-14))+'px';
  }
  function reportInlineComment(node) {
    if(!reportReview)return;
    if(isLocked()||!state.viewer||state.saving||state.insertingSection||reportDrawMode||state.replyTo!==null||state.editingId!==null){if(reportCommentButton)reportCommentButton.hidden=true;return;}
    reportCommentTarget=node;
    if(!node){if(reportCommentButton)reportCommentButton.hidden=true;return;}
    if(!reportCommentButton){
      reportCommentButton=make('button','bhn-report-inline-comment');reportCommentButton.type='button';
      reportCommentButton.setAttribute('aria-label','Comment on selected report element');reportCommentButton.title='Add a comment on this element';
      var icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');var path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M4 4h16v12H9l-5 4V4zM8 8h8M8 12h5');icon.appendChild(path);reportCommentButton.appendChild(icon);
      reportCommentButton.addEventListener('pointerdown',function(e){e.preventDefault();});
      reportCommentButton.addEventListener('click',function(e){
        e.preventDefault();e.stopPropagation();
        if(!reportCommentTarget||!reportCommentTarget.isConnected||isLocked()||state.saving||state.replyTo!==null||state.editingId!==null)return;
        state.selected=anchorsFor(reportCommentTarget);state.panelCollapsed=false;state.pickingElement=false;threadHighlight=null;
        showHighlight(reportCommentTarget);render();
      });document.body.appendChild(reportCommentButton);
    }
    reportCommentPosition();
  }
  function reportFocusComment(event){if(!event.target.closest('.bhn-report-inline-comment')&&!inOverlay(event.target))reportInlineComment(reportTarget(event));}
  if(reportReview)document.addEventListener('focusin',reportFocusComment);
  if(reportReview)style.textContent += [
    '#bhn-review-overlay[data-report-tools=true] .bhn-report-toolbar{display:flex;align-items:center;gap:5px;position:sticky;top:-6px;min-height:46px;padding:6px 0;margin-bottom:7px;border-bottom:1px solid #d5e0e4;}',
    '#bhn-review-overlay[data-report-tools=true] .bhn-report-toolbar>.bhn-rv-btn,#bhn-review-overlay[data-report-tools=true] .bhn-report-menu>summary{width:auto;min-height:34px;padding:6px 8px;font-size:12px;white-space:nowrap;}',
    '#bhn-review-overlay[data-report-tools=true] .bhn-report-unified{font-weight:750;}',
    '#bhn-review-overlay .bhn-report-menu{position:relative;}',
    '#bhn-review-overlay .bhn-report-menu>summary{display:flex;align-items:center;cursor:pointer;border:1px solid #c6d0d6;border-radius:5px;background:#fff;list-style:none;color:#34434e;}',
    '#bhn-review-overlay .bhn-report-menu>summary::-webkit-details-marker{display:none;}',
    '#bhn-review-overlay .bhn-report-menu>summary::after{content:"⌄";margin-left:5px;}',
    '#bhn-review-overlay .bhn-report-menu:last-child{margin-left:auto;}',
    '#bhn-review-overlay .bhn-report-menu-content{position:fixed;right:12px;top:120px;z-index:4;width:240px;max-width:calc(100vw - 24px);overflow:auto;padding:7px;display:grid;gap:5px;background:#fff;border:1px solid #bfcfd7;border-radius:7px;box-shadow:0 8px 24px #17304726;}',
    '#bhn-review-overlay .bhn-report-menu:not([open])>.bhn-report-menu-content{display:none;}',
    '#bhn-review-overlay .bhn-report-menu-content .bhn-rv-btn{width:100%;text-align:left;min-height:36px;white-space:normal;}',
    '#bhn-review-overlay .bhn-report-guide{margin:0 0 8px;padding:7px 9px;background:#edf6f5;border-radius:5px;font-size:12px;color:#466b77;}',
    '.bhn-report-inline-comment{position:fixed;z-index:2147483647;display:grid;place-items:center;width:36px;height:36px;padding:8px;border:2px solid #fff;border-radius:50%;background:#176879;color:#fff;box-shadow:0 2px 8px #17304740;cursor:pointer;}',
    '.bhn-report-inline-comment[hidden]{display:none;}.bhn-report-inline-comment svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linejoin:round;stroke-linecap:round;}',
    '.bhn-report-inline-comment:focus-visible{outline:3px solid #d6aa4c;outline-offset:2px;}',
    '@media(max-width:530px){#bhn-review-overlay[data-report-tools=true] .bhn-report-toolbar{gap:4px;}#bhn-review-overlay[data-report-tools=true] .bhn-report-toolbar>.bhn-rv-btn,#bhn-review-overlay[data-report-tools=true] .bhn-report-menu>summary{min-height:40px;padding:6px;font-size:11px;}.bhn-report-inline-comment{width:40px;height:40px;}}',
    '@media print{.bhn-report-inline-comment{display:none!important;}}'
  ].join('');
`;
}
