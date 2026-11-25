/** Recipient-only alerts plus a persistent tag inbox; replies reuse existing review threads. */
export function mentionNotificationsSource(): string {
  return String.raw`
  var mentionNotifications = [], mentionPopup = null, mentionFetching = false, mentionStopped = false;
  var mentionHandled = new Set(), tagLauncher = null, tagHistory = null, tagItems = [], tagCursor = null, tagLoading = false, tagError = '';
  var mentionAttentionSeen=new Set(),mentionPulseFrame=null,mentionPulseTimer=null;
  function mentionBusy(){return state.saving||state.draft.trim()||state.replyTo!==null||state.editingId!==null||(reportReview&&(reportHasPageDrafts()||reportAnnotationDraft()));}
  function tagDate(value){try{return new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});}catch(_){return '';}}
  function positionTagHistory(){
    if(!tagHistory||!tagLauncher)return;
    var r=tagLauncher.getBoundingClientRect(),width=Math.min(440,window.innerWidth-24);
    var top=Math.max(12,Math.min(window.innerHeight-160,r.bottom+8));
    tagHistory.style.left=Math.max(12,Math.min(window.innerWidth-width-12,r.left))+'px';tagHistory.style.top=top+'px';tagHistory.style.bottom='auto';
    tagHistory.style.maxHeight=Math.min(720,window.innerHeight-top-12)+'px';
  }
  function drawTagLauncher(){
    if(mentionStopped||!reportCommentEndpoint||!state.viewer)return;
    if(!tagLauncher){
      tagLauncher=addButton('','bhn-rv-tag-launcher',function(){if(tagHistory)closeTagHistory();else openTagHistory();});
      tagLauncher.setAttribute('aria-controls','bhn-review-tag-history');
      var icon=make('span','bhn-rv-mentions-icon','@');icon.setAttribute('aria-hidden','true');tagLauncher.appendChild(icon);
      tagLauncher.appendChild(make('span','bhn-rv-mentions-label','Mentions'));
      var badge=make('span','bhn-rv-mentions-count','');badge.setAttribute('aria-hidden','true');tagLauncher.appendChild(badge);
    }
    var host=reportReview&&document.querySelector('[data-report-mentions-host]');
    if(tagLauncher.parentElement!==(host||document.body))(host||document.body).appendChild(tagLauncher);
    tagLauncher.dataset.nav=String(!!host);
    var unread=mentionNotifications.filter(function(n){return !mentionHandled.has(n.id);}),count=unread.length;
    var badge=tagLauncher.querySelector('.bhn-rv-mentions-count'),label=count?String(count)+(count===100?'+':''):'';
    if(badge.textContent!==label)badge.textContent=label;badge.hidden=!count;
    tagLauncher.dataset.unread=String(count>0);
    tagLauncher.setAttribute('aria-label','Mentions'+(count?', '+count+' unread':''));tagLauncher.setAttribute('aria-expanded',String(!!tagHistory));
    var arrived=unread.some(function(n){return !mentionAttentionSeen.has(n.id);});unread.forEach(function(n){mentionAttentionSeen.add(n.id);});
    if(arrived){
      tagLauncher.classList.remove('bhn-rv-mentions-pulse');
      if(mentionPulseFrame)window.cancelAnimationFrame(mentionPulseFrame);if(mentionPulseTimer)window.clearTimeout(mentionPulseTimer);
      mentionPulseFrame=window.requestAnimationFrame(function(){mentionPulseFrame=null;if(!mentionStopped&&tagLauncher)tagLauncher.classList.add('bhn-rv-mentions-pulse');});
      mentionPulseTimer=window.setTimeout(function(){mentionPulseTimer=null;if(tagLauncher)tagLauncher.classList.remove('bhn-rv-mentions-pulse');},3200);
    }
    if(!count)tagLauncher.classList.remove('bhn-rv-mentions-pulse');
    positionTagHistory();
  }

  function closeTagHistory(){if(tagHistory)tagHistory.remove();tagHistory=null;drawTagLauncher();if(tagLauncher)tagLauncher.focus({preventScroll:true});}
  async function acknowledgeMention(item){
    var response=await fetch(reportCommentEndpoint+'/mentions/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:[item.id]})});
    if(!response.ok)throw new Error('Could not mark this tag read. Try again.');
    mentionHandled.add(item.id);mentionNotifications=mentionNotifications.filter(function(n){return n.id!==item.id;});
    tagItems.forEach(function(n){if(n.id===item.id)n.readAt=new Date().toISOString();});drawMentionPopup();drawTagLauncher();
    var row=tagHistory&&Array.from(tagHistory.querySelectorAll('[data-tag-id]')).find(function(n){return n.dataset.tagId===item.id;});
    if(row){row.dataset.unread='false';row.querySelector('.bhn-rv-tag-status').textContent='Read';}
  }
  async function openMentionThread(item,notice,reply){
    if(mentionBusy()){notice.textContent='Finish or cancel your current comment, reply or annotation first. Your draft is preserved.';return;}
    var comment=state.comments.find(function(c){return c.id===item.commentId;});var thread=state.comments.find(function(c){return c.id===item.threadId;});
    if(!comment||!thread){notice.textContent='This thread is no longer available in this review. Your mention history is retained.';return;}
    state.panelCollapsed=false;state.historyExpanded=thread.round!==state.review.round;state.expandedThreads[thread.id]=true;
    state.selected=null;state.pickingElement=false;
    if(reply&&!isLocked()){state.replyTo=thread.id;state.replyDraft='';}
    render();focusThread(thread,findAnchor(comment));
    try{await acknowledgeMention(item);}catch(error){notice.textContent=error.message;return;}
    if(tagHistory)closeTagHistory();
  }
  function drawMentionPopup(){
    if(mentionStopped)return;drawTagLauncher();
    var focused=mentionPopup&&mentionPopup.contains(document.activeElement);
    var item=mentionNotifications.find(function(n){return !mentionHandled.has(n.id);});
    if(focused&&item&&mentionPopup.dataset.notificationId===item.id)return;
    if(mentionPopup)mentionPopup.remove();mentionPopup=null;if(!item)return;
    var box=make('section','bhn-rv-mention-popup');box.dataset.notificationId=item.id;box.setAttribute('role','region');box.setAttribute('aria-label','Mentions for you');
    var title=make('strong','','You were tagged by '+item.authorName);title.setAttribute('role','status');box.appendChild(title);
    box.appendChild(make('p','','Round '+item.round+' · '+mentionNotifications.length+' unread mention'+(mentionNotifications.length===1?'':'s')));
    box.appendChild(make('p','bhn-rv-mention-preview',item.body));
    var locked=isLocked();if(locked)box.appendChild(make('p','','This round is locked. You can view the thread; reply after the next round opens.'));
    var notice=make('p','bhn-rv-mention-notice','');notice.setAttribute('role','status');box.appendChild(notice);
    var actions=make('div','bhn-rv-mention-actions');
    actions.appendChild(addButton(locked?'View thread':'View & reply','bhn-rv-btn bhn-rv-btn-primary',function(){openMentionThread(item,notice,true);}));
    actions.appendChild(addButton('Dismiss','bhn-rv-btn',async function(){try{await acknowledgeMention(item);}catch(error){notice.textContent=error.message;}}));
    box.appendChild(actions);box.appendChild(make('p','bhn-rv-tag-hint','Read and dismissed mentions stay in Mentions beside Pages and Changes.'));document.body.appendChild(box);mentionPopup=box;
  }
  function drawTagItems(){
    if(!tagHistory)return;var list=tagHistory.querySelector('.bhn-rv-tag-list'),scroll=list.scrollTop;list.textContent='';
    tagItems.forEach(function(item){
      var row=make('article','bhn-rv-tag-item');row.dataset.tagId=item.id;row.dataset.unread=String(!item.readAt);
      row.appendChild(make('strong','','From '+item.authorName));var meta=make('p','bhn-rv-tag-meta',(item.round?'Round '+item.round+' · ':'')+tagDate(item.createdAt));
      meta.appendChild(make('span','bhn-rv-tag-status',item.readAt?'Read':'Unread'));row.appendChild(meta);
      if(item.anchorBlock)row.appendChild(make('p','bhn-rv-tag-context',item.anchorBlock));
      row.appendChild(make('p','bhn-rv-tag-text',item.body||'The original comment has been deleted. This tag receipt remains in your history.'));
      if(item.anchorQuote)row.appendChild(make('blockquote','bhn-rv-tag-context',item.anchorQuote));
      if(item.tagRemoved)row.appendChild(make('p','bhn-rv-tag-context','The tag was removed from the current comment.'));
      var notice=make('p','bhn-rv-mention-notice','');notice.setAttribute('role','status');row.appendChild(notice);
      var action=addButton('Open thread','bhn-rv-btn',function(){openMentionThread(item,notice,false);});action.disabled=!item.available;row.appendChild(action);list.appendChild(row);
    });
    if(!tagItems.length&&!tagLoading&&!tagError)list.appendChild(make('p','bhn-rv-empty','No tags for you in this review yet. Read and dismissed tags will stay here.'));
    if(tagError)list.appendChild(make('p','bhn-rv-error',tagError));
    if(tagLoading)list.appendChild(make('p','','Loading mentions…'));
    if(tagCursor&&!tagLoading)list.appendChild(addButton('Load earlier tags','bhn-rv-btn',function(){loadTagHistory(true);}));
    if(tagError&&!tagLoading)list.appendChild(addButton('Try again','bhn-rv-btn',function(){loadTagHistory(!!tagCursor);}));
    list.scrollTop=scroll;
  }
  async function loadTagHistory(more){
    if(tagLoading||mentionStopped)return;tagLoading=true;tagError='';drawTagItems();
    try{var url=reportCommentEndpoint+'/mentions/notifications?history=1'+(more&&tagCursor?'&cursor='+encodeURIComponent(tagCursor):'');var response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error('Could not load mentions. Your review work is safe.');var data=await response.json();if(mentionStopped)return;
      var items=(Array.isArray(data.items)?data.items:[]).filter(function(n){return n&&typeof n.id==='string';});tagItems=more?tagItems.concat(items.filter(function(n){return !tagItems.some(function(old){return old.id===n.id;});})):items;tagCursor=typeof data.nextCursor==='string'?data.nextCursor:null;
    }catch(error){tagError=error.message;}finally{tagLoading=false;drawTagItems();}
  }
  function openTagHistory(){
    if(tagHistory||mentionStopped)return;tagHistory=make('section','bhn-rv-tag-history');tagHistory.id='bhn-review-tag-history';tagHistory.setAttribute('role','region');tagHistory.setAttribute('aria-label','Mentions');
    var header=make('header','');var title=make('div','');title.appendChild(make('strong','','Mentions'));title.appendChild(make('p','','This review · all rounds · read and unread'));header.appendChild(title);
    var close=addButton('×','bhn-rv-btn',closeTagHistory);close.setAttribute('aria-label','Close mentions');header.appendChild(close);tagHistory.appendChild(header);
    var list=make('div','bhn-rv-tag-list');list.tabIndex=0;list.setAttribute('aria-label','Your mentions');tagHistory.appendChild(list);
    tagHistory.addEventListener('keydown',function(event){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeTagHistory();}});
    document.body.appendChild(tagHistory);drawTagLauncher();drawTagItems();loadTagHistory(false);positionTagHistory();close.focus({preventScroll:true});
  }
  async function loadMentionNotifications(){
    if(!reportCommentEndpoint||!state.viewer||mentionFetching||mentionStopped)return;mentionFetching=true;drawTagLauncher();
    try{var response=await fetch(reportCommentEndpoint+'/mentions/notifications',{cache:'no-store'});if(!response.ok)return;var data=await response.json();if(mentionStopped)return;
      mentionNotifications=(Array.isArray(data.notifications)?data.notifications:[]).filter(function(n){return n&&typeof n.id==='string'&&typeof n.body==='string'&&!mentionHandled.has(n.id);});drawMentionPopup();
    }catch(_error){/* Existing review and drafts remain usable if notification polling fails. */}finally{mentionFetching=false;}
  }
  function cleanupMentionNotifications(){mentionStopped=true;if(mentionPulseFrame)window.cancelAnimationFrame(mentionPulseFrame);if(mentionPulseTimer)window.clearTimeout(mentionPulseTimer);[mentionPopup,tagLauncher,tagHistory].forEach(function(n){if(n)n.remove();});}
  style.textContent += '.bhn-rv-mention-popup{position:fixed;right:18px;bottom:18px;z-index:2147483647;width:min(390px,calc(100vw - 36px));max-height:55dvh;overflow:auto;box-sizing:border-box;padding:18px;border:1px solid #8fb5be;border-radius:12px;background:#fff;color:#172c39;box-shadow:0 10px 35px #172c3933;font:14px/1.5 Arial,sans-serif;}.bhn-rv-mention-popup strong{display:block;font-size:16px;}.bhn-rv-mention-popup p{margin:8px 0;}.bhn-rv-mention-preview{max-height:120px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;}.bhn-rv-mention-actions{display:flex;gap:8px;flex-wrap:wrap;}.bhn-rv-mention-notice:empty{display:none;}.bhn-rv-mention-popup button{min-height:40px;}.bhn-rv-tag-hint{font-size:12px;color:#536875;}';
  style.textContent += '.bhn-rv-tag-launcher{position:fixed;left:12px;bottom:12px;display:inline-flex;align-items:center;justify-content:center;gap:7px;isolation:isolate;touch-action:manipulation;z-index:2147483647;min-height:44px;width:176px;padding:10px 12px;border:1px solid #1d6777;border-radius:8px;background:#173e55;color:#fff;font:700 13px/1.4 Arial,sans-serif;box-shadow:0 4px 16px #102d3d26;cursor:pointer;}.bhn-rv-tag-launcher:focus-visible{outline:3px solid #c58228;outline-offset:3px;}.bhn-rv-tag-history{position:fixed;left:12px;bottom:68px;z-index:2147483647;width:min(440px,calc(100vw - 24px));max-height:min(72dvh,720px,calc(100dvh - 80px));display:flex;flex-direction:column;overflow:hidden;border:1px solid #9eb8c6;border-radius:12px;background:#f7fafc;color:#173047;box-shadow:0 12px 48px #102d3d40;font:14px/1.5 Arial,sans-serif;box-sizing:border-box;}.bhn-rv-tag-history *{box-sizing:border-box;}.bhn-rv-tag-history header{display:flex;align-items:start;justify-content:space-between;gap:12px;flex:none;padding:15px 16px;background:#173e55;color:#fff;}.bhn-rv-tag-history header strong{font-size:19px;}.bhn-rv-tag-history header p{margin:3px 0 0;font-size:12px;color:#d8e8ef;}.bhn-rv-tag-list{min-height:0;overflow:auto;overscroll-behavior:auto;padding:12px;}.bhn-rv-tag-item{border:1px solid #d5e0e6;border-radius:8px;margin-bottom:10px;padding:12px;background:#fff;}.bhn-rv-tag-item[data-unread=true]{border-left:4px solid #17808c;}.bhn-rv-tag-meta{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:#59717f;margin:5px 0;}.bhn-rv-tag-status{font-weight:700;}.bhn-rv-tag-context{font-size:12px;color:#59717f;margin:8px 0;white-space:pre-wrap;overflow-wrap:anywhere;}.bhn-rv-tag-history blockquote{padding-left:9px;border-left:2px solid #a4c3cd;max-height:100px;overflow:auto;}.bhn-rv-tag-text{white-space:pre-wrap;overflow-wrap:anywhere;margin:9px 0;}.bhn-rv-tag-history .bhn-rv-btn{min-height:44px;font-size:13px;}.bhn-rv-tag-history .bhn-rv-mention-notice{font-size:12px;}@media print{.bhn-rv-tag-history,.bhn-rv-tag-launcher,.bhn-rv-mention-popup{display:none!important;}}';
  style.textContent += '.bhn-rv-tag-launcher[data-nav=true]{position:relative;inset:auto;width:100%;min-width:0;min-height:52px;flex-direction:column;gap:4px;padding:6px 2px;border-radius:7px;font:650 10.5px/1.25 Arial,sans-serif;box-shadow:none;}.bhn-rv-tag-launcher[data-nav=true]:hover{background:#205b71;color:#fff;}.bhn-rv-mentions-icon{font-size:16px;line-height:16px;font-weight:750;}.bhn-rv-mentions-count{position:absolute;right:-3px;top:-5px;min-width:18px;padding:2px 4px;border-radius:9px;background:#155d72;color:#fff;font:750 10px/1.2 Arial,sans-serif;}.bhn-rv-mentions-count[hidden]{display:none;}.bhn-rv-tag-launcher::before{content:"";position:absolute;inset:-4px;z-index:-1;border-radius:10px;pointer-events:none;background:linear-gradient(115deg,#04e6c5,#339bff);filter:blur(9px);opacity:0;}.bhn-rv-tag-launcher[data-unread=true]{border-color:#4fe6f3;background:#153e56;color:#fff;}.bhn-rv-tag-launcher[data-unread=true]::before{opacity:.65;}.bhn-rv-tag-launcher.bhn-rv-mentions-pulse::before{animation:bhn-mentions-attention 1.6s ease-in-out 2;}.bhn-rv-tag-launcher:active{transform:scale(.98);}@keyframes bhn-mentions-attention{0%,100%{opacity:.35;}50%{opacity:1;}}@media(prefers-reduced-motion:reduce){.bhn-rv-tag-launcher.bhn-rv-mentions-pulse::before{animation:none;}}';

`;
}
