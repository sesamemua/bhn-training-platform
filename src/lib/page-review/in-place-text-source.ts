/** Reusable in-place editor. A temporary copy keeps the original target and source nodes intact. */
export function inPlaceTextSource(): string {
  return String.raw`
  function openInPlaceText(target,options,event){
    closeHtmlActions(false);
    if(reportCommentButton)reportCommentButton.hidden=true;
    showHighlight(null);
    var editor=target.cloneNode(true),tools=make('div','bhn-rv-inline-text-tools');
    var error=make('p','bhn-rv-html-review-error'),selection=window.getSelection();
    var offset=options.value.length,end=offset;
    function offsetFrom(node,at){
      if(!node||!target.contains(node))return null;
      var range=document.createRange();range.selectNodeContents(target);range.setEnd(node,at);
      if(!target.querySelector('[data-bhn-rv-text-lines] br'))return range.toString().length;
      var prefix=range.cloneContents();unwrapBreaks(prefix);return prefix.textContent.length;
    }
    function unwrapBreaks(root){root.querySelectorAll('[data-bhn-rv-text-lines] br').forEach(function(br){br.replaceWith(document.createTextNode('\n'));});}
    if(selection&&!selection.isCollapsed&&target.contains(selection.anchorNode)&&target.contains(selection.focusNode)){
      var a=offsetFrom(selection.anchorNode,selection.anchorOffset),b=offsetFrom(selection.focusNode,selection.focusOffset);
      offset=Math.min(a,b);end=Math.max(a,b);
    }else if(event.type==='click'){
      var caret=document.caretPositionFromPoint?.(event.clientX,event.clientY);
      var range=caret?null:document.caretRangeFromPoint?.(event.clientX,event.clientY);
      offset=offsetFrom(caret?.offsetNode||range?.startContainer,caret?.offset??range?.startOffset)??offset;end=offset;
    }
    var hint=make('span','bhn-rv-inline-text-status',options.exitHint||'Draft saves after a pause');
    hint.setAttribute('role','status');
    var recover=addButton('Restore saved draft','bhn-rv-btn',function(){});recover.hidden=true;
    var checkpoint=openTextCheckpoint(target,options.value,hint,recover,function(body){
      editor.textContent=body;session.draftDirty=body!==options.value;
      editor.focus({preventScroll:true});
      var active=document.createRange();active.selectNodeContents(editor);active.collapse(false);
      selection?.removeAllRanges();selection?.addRange(active);position();
    },function(){return reviewTextSession===session;});
    var identifier=target.getAttribute('id');
    if(identifier!==null)target.removeAttribute('id');
    editor.setAttribute('data-bhn-review-ui','');editor.setAttribute('data-bhn-rv-inline-text','');
    editor.setAttribute('role','textbox');editor.setAttribute('aria-label',options.label||'Text for this paragraph');
    editor.setAttribute('contenteditable','plaintext-only');editor.setAttribute('aria-multiline','true');editor.tabIndex=0;
    unwrapBreaks(editor);
    editor.querySelectorAll('a,button,[tabindex]').forEach(function(node){node.tabIndex=-1;});
    target.before(editor);target.setAttribute('data-bhn-rv-original-paragraph','');
    tools.setAttribute('data-bhn-review-ui','');tools.setAttribute('role','group');tools.setAttribute('aria-label','Paragraph actions');
    error.setAttribute('role','alert');error.hidden=true;
    var leaveTimer=null,composing=false;
    var session={close:close,finish:finish,position:position,inPlace:true,draftDirty:false};reviewTextSession=session;
    function value(){return editor.querySelector('br,div')?(editor.innerText??editor.textContent??''):(editor.textContent||'');}
    function close(refocus){
      if(reviewTextSession!==session)return;
      reviewTextSession=null;checkpoint.stop();clearTimeout(leaveTimer);editor.remove();tools.remove();
      target.removeAttribute('data-bhn-rv-original-paragraph');
      if(identifier!==null)target.setAttribute('id',identifier);
      if(refocus!==false&&target.isConnected)focusPageElement(target);
    }
    function position(){
      var r=editor.getBoundingClientRect(),gap=6;
      tools.hidden=!r.width||r.bottom<=0||r.top>=window.innerHeight;
      if(tools.hidden)return;
      var panel=root.getBoundingClientRect(),right=panel.width&&panel.left>r.right&&panel.bottom>r.top&&panel.top<r.bottom?panel.left:window.innerWidth;
      var width=tools.offsetWidth,height=tools.offsetHeight,x,y;
      if(right-r.right>=width+gap){x=r.right+gap;y=r.top;}
      else if(r.left>=width+gap){x=r.left-width-gap;y=r.top;}
      else if(r.bottom+height+gap<=window.innerHeight){x=r.left;y=r.bottom+gap;}
      else if(r.top>=height+gap){x=r.left;y=r.top-height-gap;}
      else{x=r.left;y=r.bottom+gap;}
      tools.style.left=Math.max(4,Math.min(window.innerWidth-width-4,x))+'px';
      tools.style.top=Math.max(4,Math.min(window.innerHeight-height-4,y))+'px';
    }
    function problem(message){error.textContent=message;error.hidden=false;position();editor.focus({preventScroll:true});}
    function finish(refocus){
      if(reviewTextSession!==session||composing)return false;
      try{
        var text=value();if(text.length>(options.max||30000))throw new Error('This paragraph is too long. Shorten it before applying.');
        var changed=text!==options.value,after=changed?options.apply(text,null,[]):null;
        close(refocus);renderCommentCopy();
        if(typeof after==='function'){
          if(websiteReview){websiteSuggestionCheckpoint=checkpoint;checkpoint.finish(text);}
          after();
        }
        if(changed&&options.afterApply)options.afterApply();
        return true;
      }
      catch(err){problem(err.message||'Could not save this edit.');return false;}
    }
    function more(){
      if(value().length>(options.max||30000)){problem('This paragraph is too long. Shorten it before opening more tools.');return;}
      var chosen=window.getSelection(),start=0,finish=0;
      if(chosen?.rangeCount&&editor.contains(chosen.anchorNode)&&editor.contains(chosen.focusNode)){
        var selected=chosen.getRangeAt(0),prefix=document.createRange();
        prefix.selectNodeContents(editor);prefix.setEnd(selected.startContainer,selected.startOffset);
        start=prefix.toString().length;finish=start+selected.toString().length;
      }
      var draft=value();close();openReviewText(target,Object.assign({},options,{title:options.moreTitle||'Edit text',draft:draft,selection:[start,finish]}),false);
    }
    var comment=addButton('Comment on element','bhn-rv-btn',function(){
      if(options.moreTitle==='Suggest text'&&session.draftDirty){finish(false);return;}
      if(reviewChangesPending()){problem('Save or discard your edits before commenting.');return;}
      close(false);if(options.comment)options.comment();else beginHtmlComment(target);
    });
    var moreTools=addButton('More text tools','bhn-rv-btn',more);
    moreTools.setAttribute('aria-haspopup','dialog');
    moreTools.addEventListener('pointerdown',function(e){e.preventDefault();});
    tools.append(comment,moreTools,addButton('Cancel','bhn-rv-btn',function(){checkpoint.discard();close();renderCommentCopy();}),recover,hint,error);
    // Keep controls above a scaled report page's stacking context and comments panel.
    document.body.appendChild(tools);position();
    editor.addEventListener('click',function(e){if(e.target.closest('a'))e.preventDefault();});
    editor.addEventListener('input',function(){session.draftDirty=value()!==options.value;if(!composing)checkpoint.change(value());error.hidden=true;position();});
    editor.addEventListener('compositionstart',function(){composing=true;checkpoint.pause();});
    editor.addEventListener('compositionend',function(){composing=false;checkpoint.change(value());});
    function leave(e){
      if(e.relatedTarget instanceof Node&&(editor.contains(e.relatedTarget)||tools.contains(e.relatedTarget)))return;
      clearTimeout(leaveTimer);
      leaveTimer=setTimeout(function(){
        var focused=document.activeElement;
        if(!editor.contains(focused)&&!tools.contains(focused))finish(false);
      },0);
    }
    editor.addEventListener('focusout',leave);tools.addEventListener('focusout',leave);
    function keys(e){
      if(composing||e.isComposing)return;
      if(e.key==='Escape'){e.preventDefault();checkpoint.discard();close();renderCommentCopy();}
      if(e.target===editor&&e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();finish();}
      if(e.target===editor&&e.key==='Tab'&&!e.shiftKey&&!tools.hidden){
        e.preventDefault();comment.focus({preventScroll:true});
      }
      if(e.target===comment&&e.key==='Tab'&&e.shiftKey){
        e.preventDefault();editor.focus({preventScroll:true});
      }
    }
    editor.addEventListener('keydown',keys);tools.addEventListener('keydown',keys);
    editor.focus({preventScroll:true});
    var walk=document.createTreeWalker(editor,4),left=null,right=null;
    while(walk.nextNode()){
      var t=walk.currentNode;
      if(!left&&offset<=t.length)left=[t,Math.max(0,offset)];
      if(end<=t.length){right=[t,Math.max(0,end)];break;}
      offset-=t.length;end-=t.length;
    }
    if(selection&&left&&right){var active=document.createRange();active.setStart(left[0],left[1]);active.setEnd(right[0],right[1]);selection.removeAllRanges();selection.addRange(active);}
  }
  if(contextualReview)style.textContent+=[
    '[data-bhn-rv-original-paragraph]{display:none!important;}[data-bhn-rv-inline-text]{outline:2px solid #176879;outline-offset:3px;cursor:text;overflow-wrap:anywhere;white-space:pre-wrap!important;}',
    '.bhn-rv-inline-text-tools{box-sizing:border-box;position:fixed;z-index:2147483647;display:grid;gap:4px;width:168px;max-width:calc(100vw - 8px);padding:6px;background:#fff;color:#173c4d;border:1px solid #b9cbd0;border-radius:5px;box-shadow:0 3px 12px #17304722;font:13px/1.35 system-ui,sans-serif;}.bhn-rv-inline-text-tools[hidden]{display:none;}',
    '.bhn-rv-inline-text-tools .bhn-rv-btn{min-height:34px;margin:0;padding:4px 8px;border:0;border-radius:3px;background:#edf6f7;color:#173c4d;text-align:left;font:inherit;font-weight:650;cursor:pointer;}.bhn-rv-inline-text-tools .bhn-rv-btn-primary{background:#176879;color:#fff;}.bhn-rv-inline-text-tools .bhn-rv-btn:focus-visible{outline:2px solid #176879;outline-offset:1px;}',
    '.bhn-rv-inline-text-tools [hidden]{display:none!important;}.bhn-rv-inline-text-status{font-size:11px;color:#536570;padding:1px 3px;}@media(max-width:540px){.bhn-rv-inline-text-tools{width:max-content;grid-template-columns:auto auto;}.bhn-rv-inline-text-tools [role=alert]{grid-column:1/-1;}}@media print{[data-bhn-rv-original-paragraph]{display:revert!important;}[data-bhn-rv-inline-text],.bhn-rv-inline-text-tools{display:none!important;}}'
  ].join('');
`;
}
