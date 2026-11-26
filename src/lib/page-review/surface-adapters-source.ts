/** Surface mechanics behind the shared menu. Site review captures suggestions, never publishes. */
export function surfaceAdaptersSource(): string {
  return String.raw`
  var socialBusy=false;
  var socialEdits=new Map(),socialEditError='';
  if(reportCommentEndpoint&&staffSurface==='social')reviewMediaTools.editText={
    getState:function(){
      return {enabled:!isLocked()&&!!document.querySelector('[data-copy-editable="true"]'),dirty:!!socialEdits.size,saving:socialBusy,error:socialEditError,hint:'Click a paragraph to edit'};
    },
    save:saveSocialReviewText,
    discard:function(){
      if(socialBusy)return;
      socialEdits.forEach(function(edit){if(edit.node.isConnected)edit.node.textContent=edit.before;});
      socialEdits.clear();socialEditError='';renderCommentCopy();
    }
  };
  function reviewChangesPending(){return inlineDirty()||!!socialEdits.size||!!(reviewTextSession&&reviewTextSession.draftDirty);}
  function reviewElement(event){
    var node=event.target;
    if(!node||typeof node.closest!=='function')return null;
    if(reportReview){
      var photo=node.closest('[data-photo-slot]');
      return photo&&!node.closest('figcaption')?(photo.matches('img')?photo:photo.querySelector('img'))||reportTarget(event):reportTarget(event);
    }
    return htmlTargets.pick(node);
  }
  function reviewTextTarget(node,clicked){
    if(!reportReview)return node;
    var direct=clicked&&clicked.closest('[data-bhn-review-text]');
    if(direct&&node.contains(direct))return direct;
    var fields=node.querySelectorAll('[data-bhn-review-text]');
    return node.matches('[data-bhn-review-text]')?node:fields.length===1?fields[0]:null;
  }
  function reviewActionAdapter(node,clicked){
    var allowed=!!(state.viewer&&!isLocked()&&!state.saving&&!state.selected&&!state.draft.trim()&&state.replyTo===null&&state.editingId===null&&!socialBusy);
    var img=node.matches('img');
    if(htmlReview)return {
      text:allowed&&htmlTextEditingAllowed(node)?function(quick){openHtmlTextEditor(node,quick);}:null,
      picture:img&&allowed&&inlineEdit.allowed&&!inlineEdit.saving&&!htmlImageSaving()?function(){openHtmlImageEditor(node);}:null
    };
    if(!allowed)return {};
    if(reportReview){
      var target=reviewTextTarget(node,clicked),slot=node.closest('[data-photo-slot]');
      return {
        text:target?function(quick){
          var before=target.textContent||'';
          openReviewText(target,{title:quick?'Quick edit':'Edit text',value:before,list:target.hasAttribute('data-bhn-review-list'),
            help:'Changes save automatically after you apply them.',
            apply:function(value,items){
              if(isLocked()||!target.isConnected||target.textContent!==before)throw new Error('The report changed. Reopen this editor before applying your edit.');
              var detail={before:before,value:items?items.map(function(item){return '- '+item;}).join('\n\n'):value,accepted:false};
              target.dispatchEvent(new CustomEvent('bhn-review-replace-text',{detail:detail}));
              if(!detail.accepted)throw new Error('This part of the report is no longer editable.');
            }},quick);
        }:null,
        picture:slot&&node.closest('[data-photo-editable]')?function(){node.dispatchEvent(new CustomEvent('bhn-review-edit-picture',{bubbles:true}));}:null
      };
    }
    if(staffSurface==='social'){
      var part=node.closest('[data-copy-part]'),version=part&&part.closest('[data-copy-version]');
      return {
        text:part&&version&&version.getAttribute('data-copy-editable')==='true'?function(quick){openSocialReviewText(part,version,quick);}:null,
        pictureLink:img?document.querySelector('[data-bhn-social-editor]')?.href:null
      };
    }
    if(websiteReview&&!img&&!node.matches('button')&&node.textContent.trim()){
      return {suggest:true,text:function(quick){
        var before=node.textContent.trim();
        openReviewText(node,{title:quick?'Quick suggestion':'Suggest text',value:before,max:3000,list:true,
          applyLabel:'Continue to comment',help:'This adds a suggested replacement to the thread. It does not edit the live website.',
          apply:function(value,items){
            if(isLocked()||!node.isConnected||node.textContent.trim()!==before)throw new Error('This page changed. Reopen the editor before suggesting text.');
            beginHtmlComment(node, 'Suggested replacement:\n'+(items?items.map(function(item){return '• '+item;}).join('\n'):value));
            setTimeout(function(){root.querySelector('.bhn-rv-compose textarea')?.focus();},0);
          }},quick);
      }};
    }
    return {};
  }
  function openSocialReviewText(part,version,quick){
    var before=part.textContent||'';
    openReviewText(part,{title:quick?'Quick edit':'Edit text',value:before,max:6000,list:true,
      help:'Apply changes, then Save revision. This never publishes or schedules a post. Editing approved copy returns it to draft.',
      apply:function(value,items){
        if(isLocked()||state.saving||socialBusy||!part.isConnected||part.textContent!==before)throw new Error('This post changed. Reopen the editor before applying your edit.');
        var index=Number(part.getAttribute('data-copy-part')),baseline=socialEdits.get(index)?.before??before;
        var after=items?items.map(function(item){return '• '+item;}).join('\n'):value;
        if(after===baseline)socialEdits.delete(index);
        else socialEdits.set(index,{node:part,part:index,before:baseline,after:after,version:Number(version.getAttribute('data-copy-version'))});
        part.textContent=after;socialEditError='';
      }},quick);
  }
  async function saveSocialReviewText(){
    if(!socialEdits.size||isLocked()||socialBusy||state.saving||reviewTextSession||state.draft.trim()||state.replyTo!==null||state.editingId!==null)return;
    socialBusy=true;state.saving=true;socialEditError='';render();var success=false;
    try{
      var staged=Array.from(socialEdits.values());
      var response=await fetch(endpoint,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        round:state.pageRound,version:staged[0].version,edits:staged.map(function(edit){return {part:edit.part,before:edit.before,after:edit.after};})
      })});
      var data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||'The draft could not be saved.');
      success=true;socialEdits.clear();window.location.reload();
    }catch(problem){
      socialEditError=problem.message||'The draft could not be saved. Your edits are still on this page.';
    }finally{
      if(!success){
        socialBusy=false;state.saving=false;render();
      }
    }
  }
  function beforeReviewUnload(event){
    if(reviewChangesPending()){event.preventDefault();event.returnValue='';}
  }
  if(contextualReview)window.addEventListener('beforeunload',beforeReviewUnload);
`;
}
