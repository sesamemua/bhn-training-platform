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
  function openSurfaceText(target,options,quick,event){
    if(event){
      if(!target.closest('p')||target.closest('a,form')||target.querySelector('img,picture,svg,iframe,object,embed,video,audio,input,textarea,button'))return false;
      openInPlaceText(target,Object.assign({},options,{autosave:true}),event);
    }else openReviewText(target,options,quick);
    return true;
  }
  function reviewActionAdapter(node,clicked){
    var allowed=!!(state.viewer&&!isLocked()&&!state.saving&&!state.selected&&!state.draft.trim()&&state.replyTo===null&&state.editingId===null&&!socialBusy);
    var img=node.matches('img');
    if(htmlReview)return {
      text:allowed&&htmlTextEditingAllowed(node)?function(quick,event){return openHtmlTextEditor(node,quick,event);}:null,
      picture:img&&allowed&&inlineEdit.allowed&&!inlineEdit.saving&&!htmlImageSaving()?function(){openHtmlImageEditor(node);}:null
    };
    if(!allowed)return {};
    if(reportReview){
      var target=reviewTextTarget(node,clicked),slot=node.closest('[data-photo-slot]');
      return {
        text:target?function(quick,event){
          var before=target.textContent||'';
          return openSurfaceText(target,{title:quick?'Quick edit':'Edit text',value:before,list:target.hasAttribute('data-bhn-review-list'),
            label:target.getAttribute('aria-label')||'Text for this paragraph',
            help:'Changes save automatically to the report draft.',
            apply:function(value,items){
              if(isLocked()||!target.isConnected||target.textContent!==before)throw new Error('The report changed. Reopen this editor before applying your edit.');
              var detail={before:before,value:items?items.map(function(item){return '- '+item;}).join('\n\n'):value,accepted:false};
              target.dispatchEvent(new CustomEvent('bhn-review-replace-text',{detail:detail}));
              if(!detail.accepted)throw new Error('This part of the report is no longer editable.');
            }},quick,event);
        }:null,
        picture:slot&&node.closest('[data-photo-editable]')?function(){node.dispatchEvent(new CustomEvent('bhn-review-edit-picture',{bubbles:true}));}:null
      };
    }
    if(staffSurface==='social'){
      var part=node.closest('[data-copy-part]'),version=part&&part.closest('[data-copy-version]');
      return {
        text:part&&version&&version.getAttribute('data-copy-editable')==='true'?function(quick,event){return openSocialReviewText(part,version,quick,event);}:null,
        pictureLink:img?document.querySelector('[data-bhn-social-editor]')?.href:null
      };
    }
    if(websiteReview&&!img&&!node.matches('button')&&node.textContent.trim()){
      return {suggest:true,text:function(quick,event){
        var before=node.textContent;
        return openSurfaceText(node,{title:quick?'Quick suggestion':'Suggest text',moreTitle:'Suggest text',value:before,max:3000,list:true,
          exitHint:'Creates an unposted suggestion',applyLabel:'Continue to comment',help:'This prepares a suggestion. Nothing is posted until you add the comment. The live website is not edited.',
          apply:function(value,items){
            if(isLocked()||!node.isConnected||node.textContent!==before)throw new Error('This page changed. Reopen the editor before suggesting text.');
            if(state.selected||state.saving||state.draft.trim()||state.replyTo!==null||state.editingId!==null)throw new Error('Finish your current comment first.');
            var text=items?items.map(function(item){return '• '+item;}).join('\n'):value.trim();
            return function(){beginHtmlComment(node,text?'Suggested replacement:\n'+text:'Suggested edit: remove this paragraph.');};
          }},quick,event);
      }};
    }
    return {};
  }
  function openSocialReviewText(part,version,quick,event){
    var before=part.textContent||'';
    return openSurfaceText(part,{title:quick?'Quick edit':'Edit text',value:before,max:6000,list:true,
      help:event?'Closing the editor saves a draft revision. Nothing is published or scheduled. Edited approved copy returns to draft.':'Apply changes, then Save revision. Edited approved copy returns to draft.',
      afterApply:event?saveSocialReviewText:null,
      apply:function(value,items){
        if(isLocked()||state.saving||socialBusy||!part.isConnected||part.textContent!==before)throw new Error('This post changed. Reopen the editor before applying your edit.');
        var index=Number(part.getAttribute('data-copy-part')),baseline=socialEdits.get(index)?.before??before;
        var after=items?items.map(function(item){return '• '+item;}).join('\n'):value;
        if(after===baseline)socialEdits.delete(index);
        else socialEdits.set(index,{node:part,part:index,before:baseline,after:after,version:Number(version.getAttribute('data-copy-version'))});
        part.textContent=after;socialEditError='';
      }},quick,event);
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
    if(reviewChangesPending()||websiteReview&&state.draft.trim()){event.preventDefault();event.returnValue='';}
  }
  if(contextualReview)window.addEventListener('beforeunload',beforeReviewUnload);
`;
}
