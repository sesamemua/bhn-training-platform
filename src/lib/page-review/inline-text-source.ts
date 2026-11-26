/** Plain-text editing in the HTML adapter. Saving is explicit and version checked. */
export function inlineTextSource(): string {
  return String.raw`
  var inlineEdit={loaded:false,allowed:false,revision:null,issueRevision:null,round:null,patches:new Map(),fields:[],saving:false,error:''};
  var originalTextNodes=htmlReview?editableTextNodes(document):[];
  if(htmlReview)reviewMediaTools.editText={
    getState:function(){return {enabled:inlineEdit.allowed&&!isLocked(),dirty:inlineDirty(),saving:inlineEdit.saving,error:inlineEdit.error};},
    save:saveInlineText,
    discard:function(){inlineEdit.fields.forEach(function(field){field.span.textContent=field.before;});inlineEdit.patches.clear();inlineEdit.error='';renderCommentCopy();}
  };
  function inlineDirty(){return !!(htmlReview&&inlineEdit.patches.size);}
  function syncInlineText(){
    if(!htmlReview||!inlineEdit.loaded)return;
    var enabled=inlineEdit.allowed&&!isLocked()&&!state.pickingElement&&!inlineEdit.saving;
    inlineEdit.fields.forEach(function(field){field.span.contentEditable=enabled?'plaintext-only':'false';});
  }
  async function loadInlineText(){
    if(!htmlReview||!state.viewer||inlineEdit.loaded)return;
    inlineEdit.loaded=true;
    try{
      var response=await fetch(endpoint+'/document',{headers:{Authorization:'Bearer '+credential}});
      var data=await response.json();
      if(!response.ok||!data.editable||data.round!==state.pageRound)return;
      inlineEdit.allowed=true;inlineEdit.revision=data.revision;inlineEdit.issueRevision=data.issueRevision;inlineEdit.round=data.round;
      originalTextNodes.forEach(function(node,index){
        if(!node.isConnected)return;
        var span=make('span','bhn-rv-inline-text');span.setAttribute('data-bhn-inline-text',String(index));
        span.setAttribute('aria-label','Edit newsletter text: '+node.data.trim().slice(0,65));span.setAttribute('role','textbox');span.tabIndex=0;
        var before=node.data;node.parentNode.replaceChild(span,node);span.appendChild(node);
        span.addEventListener('click',function(event){if(span.isContentEditable&&span.closest('a[href]')&&!event.ctrlKey&&!event.metaKey)event.preventDefault();});
        span.addEventListener('input',function(){
          var after=span.textContent;
          if(after===before)inlineEdit.patches.delete(index);else inlineEdit.patches.set(index,{index:index,before:before,after:after});
          inlineEdit.error='';renderCommentCopy();
        });
        span.addEventListener('paste',function(event){
          event.preventDefault();var text=document.createTextNode(event.clipboardData.getData('text/plain')),selection=window.getSelection();
          if(selection&&selection.rangeCount&&span.contains(selection.getRangeAt(0).commonAncestorContainer)){
            var range=selection.getRangeAt(0);range.deleteContents();range.insertNode(text);range.setStartAfter(text);range.collapse(true);selection.removeAllRanges();selection.addRange(range);
          }else span.appendChild(text);
          span.dispatchEvent(new Event('input',{bubbles:true}));
        });
        inlineEdit.fields.push({span:span,before:before});
      });
      syncInlineText();renderCommentCopy();
    }catch(_){inlineEdit.error='Text editing could not load. Reload to retry.';renderCommentCopy();}
  }
  async function saveInlineText(){
    if(!inlineDirty()||inlineEdit.saving||state.saving||state.draft.trim()||state.replyTo!==null||state.editingId!==null)return;
    inlineEdit.saving=true;inlineEdit.error='';syncInlineText();renderCommentCopy();
    try{
      var response=await fetch(endpoint+'/document',{method:'PATCH',headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},
        body:JSON.stringify({expectedRound:inlineEdit.round,revision:inlineEdit.revision,issueRevision:inlineEdit.issueRevision,edits:Array.from(inlineEdit.patches.values())})});
      var data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||'Could not save. Your edits remain on this page.');
      inlineEdit.patches.clear();window.location.reload();
    }catch(error){inlineEdit.error=error.message||'Could not save. Your edits remain on this page.';inlineEdit.saving=false;syncInlineText();renderCommentCopy();}
  }
  function beforeInlineUnload(event){if(inlineDirty()){event.preventDefault();event.returnValue='';}}
  if(htmlReview)window.addEventListener('beforeunload',beforeInlineUnload);
  style.textContent+='.bhn-rv-inline-text[contenteditable="plaintext-only"]{cursor:text;outline:0;border-radius:2px;white-space:pre-wrap;}.bhn-rv-inline-text[contenteditable="plaintext-only"]:hover{box-shadow:0 1px 0 #176879;}.bhn-rv-inline-text[contenteditable="plaintext-only"]:focus{outline:2px solid #176879;outline-offset:2px;}';
`;
}
