/** Shared editor shell. Formatting is structured and enabled by adapter capabilities. */
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
    var preview=make('ul','bhn-rv-editor-list-preview'),list=false,marks=[],tools=[],toggle=null;
    var formatted=make('p','bhn-rv-format-preview');formatted.hidden=true;formatted.setAttribute('aria-label','Formatting preview');
    input.value=options.draft??options.value;var last=input.value;
    input.rows=quick?2:7;input.maxLength=options.max||30000;input.setAttribute('aria-label',options.label||'Text for this element');
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
      session.draftDirty=input.value!==options.value||list||!!marks.length;
      preview.hidden=!list;preview.replaceChildren();
      if(list)rows().forEach(function(row){preview.appendChild(make('li','',row));});
      formatted.hidden=!marks.length;formatted.replaceChildren();
      if(marks.length)formatted.appendChild(renderTextMarks(document,input.value,marks));
      tools.forEach(function(button){button.disabled=list;});
      if(toggle)toggle.disabled=!!marks.length;
      error.hidden=true;
    }
    if(!quick&&(options.list||options.marks)){
      var toolbar=make('div','bhn-rv-editor-toolbar');toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Text formatting');
      if(options.list){
      toggle=addButton('Bulleted list','bhn-rv-btn',function(){
        list=!list;toggle.setAttribute('aria-pressed',String(list));
        help.textContent=list?'Enter one bullet per line. Check the preview below.':options.help||'';refresh();
      });
      toggle.title='Turn a plain paragraph into a bulleted list';
      toggle.setAttribute('aria-pressed','false');toolbar.appendChild(toggle);
      }
      if(options.marks){
        ['Bold','Italic'].forEach(function(label){
          var button=addButton(label,'bhn-rv-btn',function(){
            var start=input.selectionStart,end=input.selectionEnd,kind=label.toLowerCase();
            if(start===end){error.textContent='Select text to make it '+kind+'.';error.hidden=false;input.focus();return;}
            var existing=marks.findIndex(function(mark){return mark.kind===kind&&mark.start===start&&mark.end===end;});
            if(existing>=0)marks.splice(existing,1);
            else if(marks.length<40)marks.push({kind:kind,start:start,end:end});
            refresh();input.focus();input.setSelectionRange(start,end);
          });
          button.title='Apply to selected text';button.addEventListener('pointerdown',function(e){e.preventDefault();});
          tools.push(button);toolbar.appendChild(button);
        });
      }
      host.appendChild(toolbar);
    }
    host.append(help,input,preview,formatted,error);if(!dialog)host.appendChild(actions);
    function apply(){
      try{
        var items=list?rows():null;
        if(items&&(!items.length||items.length>30))throw new Error('Enter between 1 and 30 bullet items.');
        if(input.value!==options.value||items||marks.length)options.apply(input.value,items,marks);
        close();if(contextualReview)renderCommentCopy();
      }catch(problem){error.textContent=problem.message||'Could not apply this edit.';error.hidden=false;input.focus();}
    }
    input.addEventListener('input',function(){
      if(marks.length&&input.value!==last){
        var start=0,before=last.length,after=input.value.length;
        while(start<Math.min(before,after)&&last[start]===input.value[start])start++;
        while(before>start&&after>start&&last[before-1]===input.value[after-1]){before--;after--;}
        marks=marks.flatMap(function(mark){
          if(mark.end<=start)return [mark];
          if(mark.start>=before)return [{kind:mark.kind,start:mark.start+after-before,end:mark.end+after-before}];
          if(mark.start<=start&&mark.end>=before&&mark.end+after-before>mark.start)return [{kind:mark.kind,start:mark.start,end:mark.end+after-before}];
          return [];
        });
      }
      last=input.value;refresh();
    });
    if(quick)host.addEventListener('keydown',function(event){
      if(event.isComposing)return;
      if(event.key==='Escape'){event.preventDefault();close();}
      if(event.key==='Enter'&&!event.shiftKey&&event.target===input){event.preventDefault();apply();}
    });
    actions.appendChild(addButton('Cancel','bhn-rv-btn',close));
    actions.appendChild(addButton(options.applyLabel||'Apply changes','bhn-rv-btn bhn-rv-btn-primary',apply));
    refresh();input.focus();
    if(options.selection)input.setSelectionRange(options.selection[0],options.selection[1]);
  }
  if(contextualReview)style.textContent+='.bhn-rv-quick-editor{box-sizing:border-box;display:grid;gap:8px;margin:8px 0;padding:12px;border:1px solid #b9cbd0;border-radius:5px;background:#fff;color:#17212b;font:14px/1.5 system-ui,sans-serif;}.bhn-rv-quick-editor .bhn-rv-html-block-text{min-height:64px;}.bhn-rv-quick-actions,.bhn-rv-editor-toolbar{display:flex;gap:8px;margin:0 0 8px;}.bhn-rv-quick-actions button{min-height:36px;padding:6px 12px;border:1px solid #b9cbd0;border-radius:4px;background:white;color:#173c4d;font:inherit;}.bhn-rv-quick-actions .bhn-rv-btn-primary{background:#176879;color:white;}.bhn-rv-editor-toolbar [aria-pressed=true]{background:#e4f2ed;border-color:#176879;}.bhn-rv-editor-list-preview{padding:8px 8px 8px 32px;list-style:disc outside;overflow-wrap:anywhere;}@media print{.bhn-rv-quick-editor,.bhn-rv-html-actions,.bhn-rv-html-review-dialog{display:none!important;}}';
  if(htmlReview)style.textContent+='.bhn-rv-editor-toolbar{flex-wrap:wrap;}.bhn-rv-format-preview{padding:10px;background:#edf6f7;margin:8px 0 0;color:#17212b;white-space:pre-wrap;overflow-wrap:anywhere;}';
`;
}
