/** Shared contextual action; target selection and writes stay in the host overlay. */
export function contextualSource(): string {
  return String.raw`
  var reportCommentTarget = null;
  var reportCommentButton = null;
  function reportCommentPosition() {
    if (!reportCommentButton || !reportCommentTarget || !reportCommentTarget.isConnected || state.selected || state.saving || state.replyTo !== null || state.editingId !== null || isLocked() || state.pageRound !== state.review.round) {
      if(reportCommentButton)reportCommentButton.hidden=true;
      return;
    }
    var r=reportCommentTarget.getBoundingClientRect();
    reportCommentButton.hidden=!r.width||!r.height||r.bottom<0||r.top>window.innerHeight;
    var left=htmlReview?r.right+6:r.right-52,top=htmlReview?r.top:r.top-14;
    if(htmlReview&&left>window.innerWidth-44){left=r.right-40;top=r.top>=48?r.top-44:r.bottom+4;}
    reportCommentButton.style.left=Math.max(4,Math.min(window.innerWidth-44,left))+'px';
    reportCommentButton.style.top=Math.max(4,Math.min(window.innerHeight-44,top))+'px';
  }
  function reportInlineComment(node) {
    if(!contextualReview)return;
    if(isLocked()||reviewChangesPending()||htmlActionsMenu||htmlReviewDialog||reviewTextSession||!state.viewer||state.saving||state.insertingSection||reportDrawMode||state.replyTo!==null||state.editingId!==null||state.selected){if(reportCommentButton)reportCommentButton.hidden=true;return;}
    reportCommentTarget=node;
    if(!node){if(reportCommentButton)reportCommentButton.hidden=true;return;}
    if(!reportCommentButton){
      reportCommentButton=make('button','bhn-report-inline-comment');reportCommentButton.type='button';
      reportCommentButton.setAttribute('aria-label','Comment on selected '+(reportReview?'report':htmlReview?'newsletter':websiteReview?'website':'social')+' element');reportCommentButton.title='Add a comment on this element';
      var icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');var path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M4 4h16v12H9l-5 4V4zM8 8h8M8 12h5');icon.appendChild(path);reportCommentButton.appendChild(icon);
      reportCommentButton.addEventListener('pointerdown',function(e){e.preventDefault();});
      reportCommentButton.addEventListener('click',function(e){
        e.preventDefault();e.stopPropagation();
        if(!reportCommentTarget||!reportCommentTarget.isConnected||isLocked()||reviewChangesPending()||state.saving||state.replyTo!==null||state.editingId!==null)return;
        state.selected=anchorsFor(reportCommentTarget);state.panelCollapsed=false;state.pickingElement=false;threadHighlight=null;
        reportCommentButton.hidden=true;showHighlight(reportCommentTarget);render();
      });document.body.appendChild(reportCommentButton);
    }
    reportCommentPosition();
  }
  function reportFocusComment(event){if(!event.target.closest('.bhn-report-inline-comment')&&!inOverlay(event.target))reportInlineComment(reviewElement(event));}
  function enableReviewTargetFocus(){
    if(!state.viewer)return;
    var scope=reportCommentEndpoint?document.querySelector(staffSurface==='social'?'[data-social-review]':'[data-report-paper]'):document.body;
    if(!scope)return;
    scope.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,img,figcaption').forEach(function(node){
      if(!inOverlay(node)&&!node.hasAttribute('tabindex')&&reviewElement({target:node})===node){node.tabIndex=0;node.setAttribute('data-bhn-review-focus','');}
    });
  }
  function contextualKey(event){
    if(!contextualReview||inOverlay(event.target)||event.isComposing)return;
    if(event.key==='Escape'){
      if(state.selected){if(state.draft.trim())return;state.selected=null;render();if(reportCommentTarget)focusPageElement(reportCommentTarget);}
      else if(state.pickingElement){state.pickingElement=false;render();}
      return;
    }
    if(!state.pickingElement&&event.target.isContentEditable&&event.key!=='F2')return;
    if((event.key==='Enter'||event.key===' '||event.key==='F2')&&reviewElement(event))onClick(event);
  }
  if(contextualReview)document.addEventListener('focusin',reportFocusComment);
  if(contextualReview)document.addEventListener('keydown',contextualKey,true);
  if(contextualReview)style.textContent += [
    '#bhn-review-overlay .bhn-rv-common-tools{display:flex;flex-wrap:wrap;gap:6px;padding:4px 0 8px;}#bhn-review-overlay .bhn-rv-common-tools .bhn-rv-btn{width:auto;min-height:34px;margin:0;padding:6px 9px;font-size:12px;flex:1 0 auto;}',
    '.bhn-report-inline-comment{position:fixed;z-index:2147483647;display:grid;place-items:center;width:40px;height:40px;padding:8px;border:2px solid #fff;border-radius:50%;background:#176879;color:#fff;box-shadow:0 2px 8px #17304740;cursor:pointer;}',
    '.bhn-report-inline-comment[hidden]{display:none;}.bhn-report-inline-comment svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linejoin:round;stroke-linecap:round;}',
    '.bhn-report-inline-comment:focus-visible{outline:3px solid #d6aa4c;outline-offset:2px;}',
    '@media print{.bhn-report-inline-comment{display:none!important;}}'
  ].join('');
`;
}
