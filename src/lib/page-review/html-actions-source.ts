/** Explicit newsletter actions share one accessible editor dialog. */
export function htmlActionsSource(): string {
  return String.raw`
  var htmlActionsMenu=null,htmlActionsTarget=null,htmlReviewDialog=null,htmlDialogSequence=0;
  function createHtmlReviewDialog(title){
    closeHtmlActions(false);if(htmlReviewDialog)htmlReviewDialog.close();
    var previous=document.activeElement,node=make('dialog','bhn-rv-html-review-dialog'),heading=make('h2','',title),body=make('div','bhn-rv-html-review-body'),footer=make('div','bhn-rv-html-review-footer'),head=make('header','bhn-rv-html-review-head');
    heading.id='bhn-rv-html-dialog-title-'+(++htmlDialogSequence);node.setAttribute('aria-labelledby',heading.id);node.setAttribute('aria-modal','true');node.setAttribute('data-bhn-review-ui','');node.tabIndex=-1;
    var closed=false,backdrop=null,dialog={node:node,body:body,footer:footer,onClose:null,close:close};htmlReviewDialog=dialog;
    function close(){
      if(closed)return;closed=true;
      document.removeEventListener('keydown',keys,true);document.removeEventListener('focusin',containFocus,true);
      if(node.open&&typeof node.close==='function'){try{node.close();}catch(_){}}
      node.remove();if(backdrop)backdrop.remove();if(htmlReviewDialog===dialog)htmlReviewDialog=null;
      if(dialog.onClose)dialog.onClose();if(previous&&previous.isConnected&&typeof previous.focus==='function')previous.focus({preventScroll:true});
    }
    function focusable(){return Array.from(node.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')).filter(function(item){return !item.matches(':disabled')&&item.tabIndex>=0&&!item.closest('[hidden]');});}
    function containFocus(event){if(!closed&&!node.contains(event.target)){var items=focusable();(items[0]||node).focus();}}
    function keys(event){
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
      if(event.key!=='Tab')return;
      var items=focusable(),first=items[0]||node,last=items[items.length-1]||node;
      if(!items.length||event.shiftKey&&(document.activeElement===first||!node.contains(document.activeElement))||!event.shiftKey&&(document.activeElement===last||!node.contains(document.activeElement))){event.preventDefault();(event.shiftKey?last:first).focus();}
    }
    var dismiss=addButton('Close','bhn-rv-btn',close);dismiss.setAttribute('aria-label','Close '+title.toLowerCase());head.append(heading,dismiss);node.append(head,body,footer);document.body.appendChild(node);
    node.addEventListener('cancel',function(event){event.preventDefault();close();});node.addEventListener('close',close);
    try{if(typeof node.showModal!=='function')throw new Error('fallback');node.showModal();}catch(_){node.setAttribute('open','');node.setAttribute('role','dialog');backdrop=make('div','bhn-rv-html-review-backdrop');backdrop.setAttribute('data-bhn-review-ui','');node.before(backdrop);}
    document.addEventListener('keydown',keys,true);document.addEventListener('focusin',containFocus,true);
    setTimeout(function(){if(!closed&&!node.contains(document.activeElement)){var items=focusable();(items[0]||node).focus();}},0);
    return dialog;
  }
  function closeHtmlActions(restore){
    if(!htmlActionsMenu)return;var target=htmlActionsTarget;htmlActionsMenu.remove();htmlActionsMenu=null;htmlActionsTarget=null;
    document.removeEventListener('pointerdown',outsideHtmlActions,true);
    if(restore&&target&&target.isConnected)focusPageElement(target);
  }
  function outsideHtmlActions(event){if(htmlActionsMenu&&!htmlActionsMenu.contains(event.target))closeHtmlActions(false);}
  function safeHtmlActionLink(node){
    var link=node&&node.closest('a[href]');if(!link)return null;
    try{var url=new URL(link.getAttribute('href'),document.baseURI);return /^(https?:|mailto:|tel:)$/.test(url.protocol)?url.href:null;}catch(_){return null;}
  }
  function beginHtmlComment(node){
    if(inlineDirty()||htmlImageSaving()||isLocked()||!state.viewer||state.saving||state.draft.trim()||state.replyTo!==null||state.editingId!==null)return;
    closeHtmlActions(false);state.selected=anchorsFor(node);state.panelCollapsed=false;state.pickingElement=false;threadHighlight=null;showHighlight(node);render();
    var input=root.querySelector('.bhn-rv-compose textarea');if(input)input.focus();
  }
  function openHtmlActions(node,event){
    if(!htmlReview||!node||htmlReviewDialog)return;
    closeHtmlActions(false);if(reportCommentButton)reportCommentButton.hidden=true;showHighlight(node);
    var menu=make('div','bhn-rv-html-actions');menu.setAttribute('role','menu');menu.setAttribute('aria-label','Newsletter element actions');menu.setAttribute('data-bhn-review-ui','');htmlActionsMenu=menu;htmlActionsTarget=node;
    function option(label,handler,disabled){var button=addButton(label,'bhn-rv-btn',handler);button.setAttribute('role','menuitem');button.tabIndex=-1;button.disabled=!!disabled;menu.appendChild(button);return button;}
    var link=safeHtmlActionLink(event&&event.target||node);
    if(link)option('Open link',function(){closeHtmlActions(false);window.open(link,'_blank','noopener,noreferrer');});
    var commentBlocked=inlineDirty()||htmlImageSaving()||isLocked()||!state.viewer||state.saving||!!state.draft.trim()||state.replyTo!==null||state.editingId!==null;
    var comment=option('Comment on element',function(){beginHtmlComment(node);},commentBlocked);
    if(inlineDirty())comment.title='Save or discard your edits before commenting.';
    if(node.tagName==='IMG')option('Replace or edit picture',function(){closeHtmlActions(true);openHtmlImageEditor(node);},!inlineEdit.allowed||inlineEdit.saving||htmlImageSaving()||state.saving||isLocked()||!!state.draft.trim()||state.replyTo!==null||state.editingId!==null);
    else option('Edit text',function(){closeHtmlActions(true);openHtmlTextEditor(node);},!htmlTextEditingAllowed(node));
    menu.addEventListener('keydown',function(key){
      var buttons=Array.from(menu.querySelectorAll('button:not(:disabled)')),at=buttons.indexOf(document.activeElement);
      if(key.key==='Escape'){key.preventDefault();key.stopPropagation();closeHtmlActions(true);}
      else if(key.key==='Tab')closeHtmlActions(true);
      else if(['ArrowDown','ArrowUp','Home','End'].includes(key.key)&&buttons.length){key.preventDefault();var next=key.key==='Home'?0:key.key==='End'?buttons.length-1:(at+(key.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();}
    });
    document.body.appendChild(menu);var rect=node.getBoundingClientRect(),width=menu.offsetWidth||260,height=menu.offsetHeight||150;
    menu.style.left=Math.max(8,Math.min(window.innerWidth-width-8,event&&event.clientX||rect.left))+'px';menu.style.top=Math.max(8,Math.min(window.innerHeight-height-8,event&&event.clientY||rect.bottom+6))+'px';
    document.addEventListener('pointerdown',outsideHtmlActions,true);var first=menu.querySelector('button:not(:disabled)');if(first)first.focus();else{menu.tabIndex=-1;menu.focus();}
  }
  function cleanupHtmlActions(){closeHtmlActions(false);if(htmlReviewDialog)htmlReviewDialog.close();}
  if(htmlReview)style.textContent+=[
    '.bhn-rv-html-actions{position:fixed;z-index:2147483647;display:grid;gap:4px;min-width:220px;max-width:calc(100vw - 16px);padding:7px;border:1px solid #b9cbd0;border-radius:6px;background:#fff;box-shadow:0 8px 26px #17304730;font:13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,system-ui,sans-serif;}.bhn-rv-html-actions .bhn-rv-btn{text-align:left;padding:9px 12px;min-height:38px;border:0;border-radius:4px;background:transparent;color:#173c4d;font:inherit;cursor:pointer;}.bhn-rv-html-actions .bhn-rv-btn:hover,.bhn-rv-html-actions .bhn-rv-btn:focus-visible{background:#edf8fa;outline:2px solid #176879;outline-offset:-2px;}.bhn-rv-html-actions .bhn-rv-btn:disabled{opacity:.5;cursor:default;}',
    '.bhn-rv-html-review-backdrop{position:fixed;inset:0;background:#071b2766;z-index:2147483646;}.bhn-rv-html-review-dialog{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2147483647;box-sizing:border-box;margin:0;width:min(680px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:0;border:1px solid #b9cbd0;border-radius:7px;background:#fff;color:#17212b;box-shadow:0 14px 44px #071b2740;font:14px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,system-ui,sans-serif;}.bhn-rv-html-review-dialog::backdrop{background:#071b2766;}.bhn-rv-html-review-dialog *{box-sizing:border-box;}.bhn-rv-html-review-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 20px;border-bottom:1px solid #dce6e9;}.bhn-rv-html-review-head h2{margin:0;color:#173c4d;font-size:18px;line-height:1.3;}.bhn-rv-html-review-body{padding:20px;}.bhn-rv-html-review-footer{display:flex;justify-content:flex-end;gap:8px;padding:14px 20px;border-top:1px solid #dce6e9;}.bhn-rv-html-review-dialog .bhn-rv-btn{min-height:36px;padding:7px 12px;border:1px solid #b9cbd0;border-radius:4px;background:#fff;color:#173c4d;font:inherit;font-size:13px;font-weight:600;cursor:pointer;}.bhn-rv-html-review-dialog .bhn-rv-btn-primary{background:#176879;border-color:#176879;color:#fff;}.bhn-rv-html-review-dialog .bhn-rv-btn:disabled{opacity:.5;cursor:default;}.bhn-rv-html-review-help{margin:0 0 12px;color:#60707b;font-size:13px;}.bhn-rv-html-block-text{display:block;width:100%;min-height:180px;resize:vertical;border:1px solid #b9cbd0;border-radius:4px;padding:12px;color:#17212b;background:#fff;font:16px/1.55 -apple-system,BlinkMacSystemFont,Segoe UI,system-ui,sans-serif;}.bhn-rv-html-review-error{color:#8c2020;margin:12px 0 0;}.bhn-rv-html-review-dialog :focus-visible{outline:2px solid #176879;outline-offset:2px;}.bhn-rv-html-review-dialog [hidden]{display:none!important;}'
  ].join('');
`;
}
