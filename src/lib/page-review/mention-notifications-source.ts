/** Recipient-only, nonmodal alerts; replies use the existing review thread. */
export function mentionNotificationsSource(): string {
  return String.raw`
  var mentionNotifications = [], mentionPopup = null, mentionFetching = false, mentionStopped = false;
  var mentionHandled = new Set();
  function mentionBusy(){return state.saving||state.draft.trim()||state.replyTo!==null||state.editingId!==null||(reportReview&&(reportHasPageDrafts()||reportAnnotationDraft()));}
  async function acknowledgeMention(item){
    var response=await fetch(reportCommentEndpoint+'/mentions/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:[item.id]})});
    if(!response.ok)throw new Error('Could not dismiss this notification. Try again.');
    mentionHandled.add(item.id);mentionNotifications=mentionNotifications.filter(function(n){return n.id!==item.id;});drawMentionPopup();
  }
  function drawMentionPopup(){
    if(mentionStopped)return;
    var focused=mentionPopup&&mentionPopup.contains(document.activeElement);
    var item=mentionNotifications.find(function(n){return !mentionHandled.has(n.id);});
    if(focused&&item&&mentionPopup.dataset.notificationId===item.id)return;
    if(mentionPopup)mentionPopup.remove();mentionPopup=null;
    if(!item)return;
    var box=make('section','bhn-rv-mention-popup');box.dataset.notificationId=item.id;box.setAttribute('role','region');box.setAttribute('aria-label','Mentions for you');
    var title=make('strong','','You were tagged by '+item.authorName);title.setAttribute('role','status');box.appendChild(title);
    box.appendChild(make('p','','Round '+item.round+' · '+mentionNotifications.length+' unread mention'+(mentionNotifications.length===1?'':'s')));
    box.appendChild(make('p','bhn-rv-mention-preview',item.body));
    var locked=isLocked();if(locked)box.appendChild(make('p','','This round is locked. You can view the thread; reply after the next round opens.'));
    var notice=make('p','bhn-rv-mention-notice','');notice.setAttribute('role','status');box.appendChild(notice);
    var actions=make('div','bhn-rv-mention-actions');
    actions.appendChild(addButton(locked?'View thread':'View & reply','bhn-rv-btn bhn-rv-btn-primary',async function(){
      if(mentionBusy()){notice.textContent='Finish or cancel your current comment, reply or annotation first. Your draft is preserved.';return;}
      var comment=state.comments.find(function(c){return c.id===item.commentId;});
      var thread=state.comments.find(function(c){return c.id===item.threadId;});
      if(!comment||!thread){notice.textContent='This thread is no longer available. Refresh the review when your work is saved.';return;}
      state.panelCollapsed=false;state.historyExpanded=item.round!==state.review.round;state.expandedThreads[thread.id]=true;
      state.selected=null;state.pickingElement=false;
      if(!isLocked()){state.replyTo=thread.id;state.replyDraft='';}
      render();
      // Reply focus stays inside the existing panel; Show me can locate its report element.
      if(isLocked())bringCommentIntoView(comment);
      try{await acknowledgeMention(item);}catch(error){notice.textContent=error.message;}
    }));
    actions.appendChild(addButton('Dismiss','bhn-rv-btn',async function(){try{await acknowledgeMention(item);}catch(error){notice.textContent=error.message;}}));
    box.appendChild(actions);document.body.appendChild(box);mentionPopup=box;
  }
  async function loadMentionNotifications(){
    if(!reportCommentEndpoint||!state.viewer||mentionFetching||mentionStopped)return;
    mentionFetching=true;
    try{var response=await fetch(reportCommentEndpoint+'/mentions/notifications',{cache:'no-store'});if(!response.ok)return;var data=await response.json();if(mentionStopped)return;
      mentionNotifications=(Array.isArray(data.notifications)?data.notifications:[]).filter(function(n){return n&&typeof n.id==='string'&&typeof n.body==='string'&&!mentionHandled.has(n.id);});drawMentionPopup();
    }catch(_error){/* Existing review and drafts remain usable if notification polling fails. */}finally{mentionFetching=false;}
  }
  function cleanupMentionNotifications(){mentionStopped=true;if(mentionPopup)mentionPopup.remove();}
  style.textContent += '.bhn-rv-mention-popup{position:fixed;right:18px;bottom:18px;z-index:2147483647;width:min(390px,calc(100vw - 36px));max-height:55dvh;overflow:auto;box-sizing:border-box;padding:18px;border:1px solid #8fb5be;border-radius:12px;background:#fff;color:#172c39;box-shadow:0 10px 35px #172c3933;font:14px/1.5 Arial,sans-serif;}.bhn-rv-mention-popup strong{display:block;font-size:16px;}.bhn-rv-mention-popup p{margin:8px 0;}.bhn-rv-mention-preview{max-height:120px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;}.bhn-rv-mention-actions{display:flex;gap:8px;flex-wrap:wrap;}.bhn-rv-mention-notice:empty{display:none;}.bhn-rv-mention-popup button{min-height:40px;}';
`;
}
