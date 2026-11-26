/** Whole-block text editing; original text-node patches preserve inline markup. */
export function inlineTextSource(): string {
  return String.raw`
  var inlineEdit={loaded:false,allowed:false,revision:null,issueRevision:null,round:null,patches:new Map(),images:[],saving:false,error:''};
  var htmlTextEditor=null;
  if(htmlReview)reviewMediaTools.editText={
    getState:function(){return {enabled:inlineEdit.allowed&&!isLocked(),dirty:inlineDirty(),saving:inlineEdit.saving||htmlImageSaving(),error:inlineEdit.error};},
    save:saveInlineText,
    discard:function(){
      if(inlineEdit.saving||htmlImageSaving())return;
      if(htmlTextEditor)htmlTextEditor.close();
      originalTextNodes.forEach(function(node,index){if(node.isConnected)node.data=originalTextValues[index];});
      resetHtmlImages();inlineEdit.patches.clear();inlineEdit.error='';renderCommentCopy();
    }
  };
  function inlineDirty(){return !!(htmlReview&&(inlineEdit.patches.size||htmlImageDirty()||htmlImageSaving()||htmlTextEditor&&htmlTextEditor.draftDirty));}
  function syncInlineText(){
    if(!htmlReview||!inlineEdit.loaded||!inlineEdit.allowed)return;
    document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,img,div[data-nl-part]').forEach(function(node){
      if(!inOverlay(node)&&htmlTargets.pick(node)===node&&!node.hasAttribute('tabindex')){node.setAttribute('tabindex','0');node.setAttribute('data-bhn-review-focus','');}
    });
  }
  function htmlTextEditingAllowed(node){
    return !!(htmlReview&&node&&node.tagName!=='IMG'&&inlineEdit.allowed&&!inlineEdit.saving&&!htmlImageSaving()&&!state.saving&&!isLocked()&&!state.draft.trim()&&state.replyTo===null&&state.editingId===null&&originalTextNodes.some(function(text){return node.contains(text);}));
  }
  function openHtmlTextEditor(node){
    if(!htmlTextEditingAllowed(node))return;
    var parts=[],walker=document.createTreeWalker(node,4);
    while(walker.nextNode()){var text=walker.currentNode,index=originalTextNodes.indexOf(text);parts.push({index:index<0?null:index,before:text.data,node:text});}
    var before=parts.map(function(part){return part.before;}).join('');
    var dialog=createHtmlReviewDialog(node.tagName==='LI'?'Edit list item':'Edit text');htmlTextEditor=dialog;
    dialog.onClose=function(){if(htmlTextEditor===dialog)htmlTextEditor=null;};
    var help=make('p','bhn-rv-html-review-help','Edit this whole text block. Existing links and emphasis are preserved. Apply changes, then Save revision to keep them.');
    var input=make('textarea','bhn-rv-html-block-text');input.value=before;input.maxLength=30000;input.rows=8;input.setAttribute('aria-label','Text for this '+(node.tagName==='LI'?'list item':'paragraph'));
    dialog.draftDirty=false;input.addEventListener('input',function(){dialog.draftDirty=input.value!==before;});
    var error=make('p','bhn-rv-html-review-error');error.setAttribute('role','alert');error.hidden=true;
    dialog.body.append(help,input,error);
    dialog.footer.appendChild(addButton('Cancel','bhn-rv-btn',function(){dialog.close();}));
    dialog.footer.appendChild(addButton('Apply changes','bhn-rv-btn bhn-rv-btn-primary',function(){
      if(!htmlTextEditingAllowed(node))return;
      try{
        if(parts.some(function(part){return !part.node.isConnected||part.node.data!==part.before;}))throw new Error('This text changed while the editor was open. Close this editor and open it again.');
        var edits=planTextBlockEdits(parts,input.value);
        edits.forEach(function(edit){var text=originalTextNodes[edit.index];text.data=edit.after;if(edit.after===originalTextValues[edit.index])inlineEdit.patches.delete(edit.index);else inlineEdit.patches.set(edit.index,{index:edit.index,before:originalTextValues[edit.index],after:edit.after});});
        inlineEdit.error='';dialog.close();showHighlight(null);renderCommentCopy();
      }catch(problem){error.textContent=problem.message||'This change could not be applied safely.';error.hidden=false;input.focus();}
    }));
    input.focus();
  }
  async function loadInlineText(){
    if(!htmlReview||!state.viewer||inlineEdit.loaded)return;
    inlineEdit.loaded=true;
    try{
      var response=await fetch(endpoint+'/document',{headers:{Authorization:'Bearer '+credential}}),data=await response.json();
      if(!response.ok||!data.editable||data.round!==state.pageRound)return;
      inlineEdit.allowed=true;inlineEdit.revision=data.revision;inlineEdit.issueRevision=data.issueRevision;inlineEdit.round=data.round;inlineEdit.images=data.images||[];
      syncInlineText();renderCommentCopy();
    }catch(_){inlineEdit.error='Editing could not load. Reload to retry.';renderCommentCopy();}
  }
  async function saveInlineText(){
    if(!inlineDirty()||!inlineEdit.allowed||isLocked()||inlineEdit.saving||htmlImageSaving()||state.saving||state.draft.trim()||state.replyTo!==null||state.editingId!==null)return;
    inlineEdit.saving=true;inlineEdit.error='';syncInlineText();renderCommentCopy();
    try{
      var response=await fetch(endpoint+'/document',{method:'PATCH',headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},
        body:JSON.stringify({expectedRound:inlineEdit.round,revision:inlineEdit.revision,issueRevision:inlineEdit.issueRevision,edits:Array.from(inlineEdit.patches.values()),images:getHtmlImageEdits()})});
      var data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||'Could not save. Your edits remain on this page.');
      inlineEdit.patches.clear();htmlImagePatches.clear();window.location.reload();
    }catch(error){inlineEdit.error=error.message||'Could not save. Your edits remain on this page.';inlineEdit.saving=false;syncInlineText();renderCommentCopy();}
  }
  function beforeInlineUnload(event){if(inlineDirty()){event.preventDefault();event.returnValue='';}}
  if(htmlReview)window.addEventListener('beforeunload',beforeInlineUnload);
`;
}
