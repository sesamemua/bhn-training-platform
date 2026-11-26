/** Whole-block text editing; original text-node patches preserve inline markup. */
export function inlineTextSource(): string {
  return String.raw`
  var inlineEdit={loaded:false,allowed:false,revision:null,issueRevision:null,round:null,patches:new Map(),images:[],saving:false,error:''};
  var stagedHtmlLists=new Map();
  if(htmlReview)reviewMediaTools.editText={
    getState:function(){return {enabled:inlineEdit.allowed&&!isLocked(),dirty:inlineDirty(),saving:inlineEdit.saving||htmlImageSaving(),error:inlineEdit.error};},
    save:saveInlineText,
    discard:function(){
      if(inlineEdit.saving||htmlImageSaving())return;
      if(reviewTextSession)reviewTextSession.close();
      stagedHtmlLists.forEach(function(item){item.list.replaceWith(item.node);});stagedHtmlLists.clear();
      originalTextNodes.forEach(function(node,index){if(node.isConnected)node.data=originalTextValues[index];});
      resetHtmlImages();inlineEdit.patches.clear();inlineEdit.error='';renderCommentCopy();
    }
  };
  function inlineDirty(){return !!(htmlReview&&(inlineEdit.patches.size||htmlImageDirty()||htmlImageSaving()||reviewTextSession&&reviewTextSession.draftDirty));}
  function syncInlineText(){
    if(!htmlReview||!inlineEdit.loaded||!inlineEdit.allowed)return;
    document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,img,div[data-nl-part]').forEach(function(node){
      if(!inOverlay(node)&&htmlTargets.pick(node)===node&&!node.hasAttribute('tabindex')){node.setAttribute('tabindex','0');node.setAttribute('data-bhn-review-focus','');}
    });
  }
  function htmlTextEditingAllowed(node){
    return !!(htmlReview&&node&&node.tagName!=='IMG'&&inlineEdit.allowed&&!inlineEdit.saving&&!htmlImageSaving()&&!state.saving&&!isLocked()&&!state.draft.trim()&&state.replyTo===null&&state.editingId===null&&originalTextNodes.some(function(text){return node.contains(text);}));
  }
  function openHtmlTextEditor(node,quick){
    if(!htmlTextEditingAllowed(node))return;
    var parts=[],walker=document.createTreeWalker(node,4);
    while(walker.nextNode()){var text=walker.currentNode,index=originalTextNodes.indexOf(text);parts.push({index:index<0?null:index,before:text.data,node:text});}
    var before=parts.map(function(part){return part.before;}).join('');
    var allowList=node.tagName==='P'&&parts.length===1&&parts[0].index!==null&&node.childNodes.length===1;
    openReviewText(node,{title:quick?'Quick edit':node.tagName==='LI'?'Edit list item':'Edit text',
      value:before,label:'Text for this '+(node.tagName==='LI'?'list item':'paragraph'),list:allowList,
      help:'Existing links and emphasis are preserved. Apply changes, then Save revision to keep them.',
      apply:function(value,items){
        if(!htmlTextEditingAllowed(node))throw new Error('This revision is no longer editable.');
        if(parts.some(function(part){return !part.node.isConnected||part.node.data!==part.before;}))throw new Error('This text changed while the editor was open. Close this editor and open it again.');
        if(items){
          var index=parts[0].index, list=make('ul');
          Array.from(node.attributes).forEach(function(attr){if(attr.name!=='data-bhn-review-focus'&&attr.name!=='tabindex')list.setAttribute(attr.name,attr.value);});
          list.style.listStyleType='disc';list.style.paddingLeft='24px';
          items.forEach(function(item){list.appendChild(make('li','',item));});
          node.replaceWith(list);stagedHtmlLists.set(index,{list:list,node:node});
          inlineEdit.patches.set(index,{index:index,before:originalTextValues[index],after:items.join('\n'),list:true});
        }else{
        var edits=planTextBlockEdits(parts,value);
        edits.forEach(function(edit){var text=originalTextNodes[edit.index];text.data=edit.after;if(edit.after===originalTextValues[edit.index])inlineEdit.patches.delete(edit.index);else inlineEdit.patches.set(edit.index,{index:edit.index,before:originalTextValues[edit.index],after:edit.after});});
        }
        inlineEdit.error='';showHighlight(null);
      }},quick);
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
    if(reviewTextSession||!inlineDirty()||!inlineEdit.allowed||isLocked()||inlineEdit.saving||htmlImageSaving()||state.saving||state.draft.trim()||state.replyTo!==null||state.editingId!==null)return;
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
