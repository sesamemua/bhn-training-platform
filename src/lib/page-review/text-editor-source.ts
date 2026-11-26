/** Identical editor shell for every adapter. List formatting is a structured choice, never raw markup. */
export function textEditorSource(): string {
  return String.raw`
  var reviewTextSession=null;
  function openReviewText(target,options,quick){
    if(reviewTextSession)reviewTextSession.close();
    var dialog=quick?null:createHtmlReviewDialog(options.title||'Edit text');
    var host=dialog?dialog.body:make('div','bhn-rv-quick-editor');
    var actions=dialog?dialog.footer:make('div','bhn-rv-quick-actions');
    var session={close:close,draftDirty:false};reviewTextSession=session;
    var input=make('textarea','bhn-rv-html-block-text'),error=make('p','bhn-rv-html-review-error');
    var preview=make('ul','bhn-rv-editor-list-preview'),list=false;
    input.value=options.value;input.rows=quick?2:7;input.maxLength=options.max||30000;input.setAttribute('aria-label',options.label||'Text for this element');
    error.hidden=true;error.setAttribute('role','alert');preview.hidden=true;preview.setAttribute('aria-label','Bullet list preview');
    var help=make('p','bhn-rv-html-review-help',options.help||'');
    function close(){
      if(reviewTextSession!==session)return;
      reviewTextSession=null;
      if(dialog)dialog.close();else {host.remove();if(target.isConnected)focusPageElement(target);}
    }
    if(dialog)dialog.onClose=function(){if(reviewTextSession===session)reviewTextSession=null;};
    if(!dialog){
      host.setAttribute('data-bhn-review-ui','');host.setAttribute('role','group');host.setAttribute('aria-label',options.title||'Quick edit');
      // Put the editor beside the original block; don't rewrite its live HTML.
      var before=target.closest('p,li,h1,h2,h3,h4,h5,h6,blockquote,figcaption')||target.closest('a,button')||target;
      if(before.tagName==='LI')before=before.parentElement;
      before.after(host);
    }
    function rows(){return input.value.split(/\r?\n/).map(function(line){return line.trim();}).filter(Boolean);}
    function refresh(){
      session.draftDirty=input.value!==options.value||list;
      preview.hidden=!list;preview.replaceChildren();
      if(list)rows().forEach(function(row){preview.appendChild(make('li','',row));});
      error.hidden=true;
    }
    if(!quick&&options.list){
      var toolbar=make('div','bhn-rv-editor-toolbar');toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Text formatting');
      var toggle=addButton('Bulleted list','bhn-rv-btn',function(){
        list=!list;toggle.setAttribute('aria-pressed',String(list));
        help.textContent=list?'Enter one bullet per line. Check the preview below.':options.help||'';refresh();
      });
      toggle.setAttribute('aria-pressed','false');toolbar.appendChild(toggle);host.appendChild(toolbar);
    }
    host.append(help,input,preview,error);if(!dialog)host.appendChild(actions);
    function apply(){
      try{
        var items=list?rows():null;
        if(items&&(!items.length||items.length>30))throw new Error('Enter between 1 and 30 bullet items.');
        if(input.value!==options.value||items)options.apply(input.value,items);
        close();if(contextualReview)renderCommentCopy();
      }catch(problem){error.textContent=problem.message||'Could not apply this edit.';error.hidden=false;input.focus();}
    }
    input.addEventListener('input',refresh);
    if(quick)host.addEventListener('keydown',function(event){
      if(event.isComposing)return;
      if(event.key==='Escape'){event.preventDefault();close();}
      if(event.key==='Enter'&&!event.shiftKey&&event.target===input){event.preventDefault();apply();}
    });
    actions.appendChild(addButton('Cancel','bhn-rv-btn',close));
    actions.appendChild(addButton(options.applyLabel||'Apply changes','bhn-rv-btn bhn-rv-btn-primary',apply));
    input.focus();
  }
  if(contextualReview)style.textContent+='.bhn-rv-quick-editor{box-sizing:border-box;display:grid;gap:8px;margin:8px 0;padding:12px;border:1px solid #b9cbd0;border-radius:5px;background:#fff;color:#17212b;font:14px/1.5 system-ui,sans-serif;}.bhn-rv-quick-editor .bhn-rv-html-block-text{min-height:64px;}.bhn-rv-quick-actions,.bhn-rv-editor-toolbar{display:flex;gap:8px;margin:0 0 8px;}.bhn-rv-quick-actions button{min-height:36px;padding:6px 12px;border:1px solid #b9cbd0;border-radius:4px;background:white;color:#173c4d;font:inherit;}.bhn-rv-quick-actions .bhn-rv-btn-primary{background:#176879;color:white;}.bhn-rv-editor-toolbar [aria-pressed=true]{background:#e4f2ed;border-color:#176879;}.bhn-rv-editor-list-preview{padding:8px 8px 8px 32px;list-style:disc outside;overflow-wrap:anywhere;}@media print{.bhn-rv-quick-editor,.bhn-rv-html-actions,.bhn-rv-html-review-dialog{display:none!important;}}';
`;
}
