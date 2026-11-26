/** Whole-block text editing; original text-node patches preserve inline markup. */
export function inlineTextSource(): string {
  return String.raw`
  var inlineEdit={loaded:false,allowed:false,revision:null,issueRevision:null,round:null,patches:new Map(),images:[],saving:false,error:''};
  var stagedHtmlLists=new Map(),stagedHtmlMarks=new Map();
  if(htmlReview)reviewMediaTools.editText={
    getState:function(){return {enabled:inlineEdit.allowed&&!isLocked(),dirty:inlineDirty(),saving:inlineEdit.saving||htmlImageSaving(),error:inlineEdit.error};},
    save:saveInlineText,
    discard:function(){
      if(inlineEdit.saving||htmlImageSaving())return;
      if(reviewTextSession)reviewTextSession.close();
      stagedHtmlLists.forEach(function(item){item.list.replaceWith(item.node);});stagedHtmlLists.clear();
      stagedHtmlMarks.forEach(function(item){item.preview.replaceWith(item.node);});stagedHtmlMarks.clear();
      originalTextNodes.forEach(function(node,index){if(node.isConnected&&node.nodeType===3)node.data=originalTextValues[index];});
      resetHtmlImages();inlineEdit.patches.clear();inlineEdit.error='';renderCommentCopy();
    }
  };
  function inlineDirty(){return !!(htmlReview&&(inlineEdit.patches.size||htmlImageDirty()||htmlImageSaving()||reviewTextSession&&reviewTextSession.draftDirty));}
  function syncInlineText(){
    if(!htmlReview||!inlineEdit.loaded||!inlineEdit.allowed)return;
    document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,img,div[data-nl-part],div[data-preserved-wording="true"]').forEach(function(node){
      if(!inOverlay(node)&&htmlTargets.pick(node)===node&&!node.hasAttribute('tabindex')){node.setAttribute('tabindex','0');node.setAttribute('data-bhn-review-focus','');}
    });
  }
  function htmlTextEditingAllowed(node){
    return !!(htmlReview&&node&&node.tagName!=='IMG'&&inlineEdit.allowed&&!inlineEdit.saving&&!htmlImageSaving()&&!state.saving&&!isLocked()&&!state.selected&&!state.draft.trim()&&state.replyTo===null&&state.editingId===null&&!node.querySelector('[data-bhn-rv-staged-format]')&&originalTextNodes.some(function(text){return node.contains(text);}));
  }
  function openHtmlTextEditor(node,quick,event){
    if(!htmlTextEditingAllowed(node))return false;
    if(event&&node.querySelector('img,picture,svg,iframe,object,embed,video,audio,input,textarea,button'))return false;
    var parts=[],walker=document.createTreeWalker(node,5);
    while(walker.nextNode()){
      var text=walker.currentNode,index=originalTextNodes.indexOf(text);
      if(index<0&&(text.nodeType!==3||text.parentElement.closest('span[data-bhn-rv-text-lines]')))continue;
      parts.push({index:index<0?null:index,before:reviewTextValue(text),node:text});
    }
    var before=parts.map(function(part){return part.before;}).join('');
    var allowList=node.tagName==='P'&&parts.length===1&&parts[0].index!==null&&node.childNodes.length===1;
    var options={title:quick?'Quick edit':node.tagName==='LI'?'Edit list item':'Edit text',
      value:before,label:'Text for this '+(node.tagName==='LI'?'list item':'paragraph'),list:allowList,marks:node.matches('p,li'),
      help:event?'Closing the editor saves a new draft revision. Existing links and emphasis are preserved.':'Existing links and emphasis are preserved. Apply changes, then Save revision to keep them.',
      exitHint:htmlImageDirty()?'Text will stage with picture edits':null,
      afterApply:event?function(){if(!htmlImageDirty())void saveInlineText();}:null,
      comment:function(){beginHtmlComment(node);},
      apply:function(value,items,marks){
        if(!htmlTextEditingAllowed(node))throw new Error('This revision is no longer editable.');
        if(parts.some(function(part){return !part.node.isConnected||reviewTextValue(part.node)!==part.before;}))throw new Error('This text changed while the editor was open. Close this editor and open it again.');
        if(items){
          var index=parts[0].index, list=make('ul');
          Array.from(node.attributes).forEach(function(attr){if(attr.name!=='data-bhn-review-focus'&&attr.name!=='tabindex')list.setAttribute(attr.name,attr.value);});
          list.style.listStyleType='disc';list.style.paddingLeft='24px';
          items.forEach(function(item){list.appendChild(make('li','',item));});
          node.replaceWith(list);stagedHtmlLists.set(index,{list:list,node:node});
          inlineEdit.patches.set(index,{index:index,before:originalTextValues[index],after:items.join('\n'),list:true});
        }else{
          var edits=new Map(planTextBlockEdits(parts,value).map(function(edit){return [edit.index,edit.after];})),offset=0;
          var planned=parts.flatMap(function(part){
            var after=edits.get(part.index)??part.before,start=offset;offset+=after.length;
            if(part.index===null)return [];
            var local=(marks||[]).filter(function(mark){return mark.start<offset&&mark.end>start;}).map(function(mark){
              return {kind:mark.kind,start:Math.max(mark.start,start)-start,end:Math.min(mark.end,offset)-start};
            });
            if(!edits.has(part.index)&&!local.length)return [];
            var preview=local.length?renderTextMarks(document,after,local,renderReviewText):
              part.node.nodeType!==3||/[\r\n]/.test(after)?renderReviewText(document,after):null;
            return [{index:part.index,after:after,preview:preview,marks:local.length?local:undefined}];
          });
          if(marks?.length&&!planned.some(function(edit){return edit.marks;}))throw new Error('Select editable paragraph text to format.');
          planned.forEach(function(edit){
            var text=originalTextNodes[edit.index];
            if(edit.preview){
              var preview=make('span');preview.setAttribute('data-bhn-rv-staged-format','');preview.append(edit.preview);
              text.replaceWith(preview);stagedHtmlMarks.set(edit.index,{node:text,preview:preview});
            }else text.data=edit.after;
            if(!edit.marks&&edit.after===originalTextValues[edit.index])inlineEdit.patches.delete(edit.index);
            else inlineEdit.patches.set(edit.index,{index:edit.index,before:originalTextValues[edit.index],after:edit.after,marks:edit.marks});
          });
        }
        inlineEdit.error='';showHighlight(null);
      }};
    return openSurfaceText(node,options,quick,event);
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
      inlineEdit.patches.clear();htmlImagePatches.clear();reloadReviewInPlace();
    }catch(error){inlineEdit.error=error.message||'Could not save. Your edits remain on this page.';inlineEdit.saving=false;syncInlineText();renderCommentCopy();}
  }
  function beforeInlineUnload(event){if(inlineDirty()){event.preventDefault();event.returnValue='';}}
  if(htmlReview)window.addEventListener('beforeunload',beforeInlineUnload);
`;
}
