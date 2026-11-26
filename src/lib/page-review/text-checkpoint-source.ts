/** Shared idle checkpointing. Never calls publish, comment or revision endpoints. */
export function textCheckpointSource(): string {
  return String.raw`
  var checkpointCache=null,checkpointQueue=Promise.resolve(),websiteSuggestionCheckpoint=null;
  function clearWebsiteSuggestionCheckpoint(){
    if(websiteSuggestionCheckpoint)websiteSuggestionCheckpoint.discard();
    websiteSuggestionCheckpoint=null;
  }
  async function checkpointHash(text){
    var bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes),function(byte){return byte.toString(16).padStart(2,'0');}).join('');
  }
  function openTextCheckpoint(target,original,hint,button,restore,isOpen){
    var url=(reportCommentEndpoint||endpoint)+'/text-checkpoint',round=state.pageRound;
    var path=cssPath(target,true).slice(0,1600),guest=websiteReview&&state.viewer?.id==='',token=credential;
    var headers=reportCommentEndpoint?{}:{Authorization:'Bearer '+token};
    var timer=null,stopped=false,epoch=0,lastSent=null,previous=null,discarded=false,writing=false;
    var savedMessage=guest?'Draft saved in this tab':websiteReview?'Draft saved · not posted':'Draft saved';
    var ready=checkpointHash(original).then(async function(baseline){
      var bucket=guest?'bhn-review-text:'+await checkpointHash(url+token):null;
      return {baseline:baseline,bucket:bucket};
    }).catch(function(){return null;});
    function say(message){if(isOpen())hint.textContent=message;}
    async function get(context){
      if(context.bucket){
        try{var existing=JSON.parse(sessionStorage.getItem(context.bucket)||'null');return existing?.until>Date.now()?existing:null;}
        catch(_){return null;}
      }
      try{
        if(!checkpointCache)checkpointCache=fetch(url,{headers:headers}).then(function(response){return response.ok?response.json():null;})
          .then(function(data){return data?.draft||null;}).catch(function(){checkpointCache=null;return null;});
        return await checkpointCache;
      }catch(_){return null;}
    }
    ready.then(async function(context){
      if(!context||!path||stopped)return;
      var saved=await get(context);
      if(stopped||!saved||saved.round!==round||saved.target!==path||saved.baseline!==context.baseline||typeof saved.body!=='string'||saved.body===original)return;
      previous=saved;lastSent=saved.body;
      if(epoch||!isOpen())return;
      button.hidden=false;
      button.addEventListener('click',function(){
        button.hidden=true;restore(saved.body);say(savedMessage);
      },{once:true});
    });
    function enqueue(job){checkpointQueue=checkpointQueue.catch(function(){}).then(job);}
    async function removeCheckpoint(){
      var old=previous;if(!old)return;
      var context=await ready;if(!context)return;
      try{
        if(context.bucket){
          var stored=JSON.parse(sessionStorage.getItem(context.bucket)||'null');
          if(stored?.etag===old.etag)sessionStorage.removeItem(context.bucket);
        }else{
          var response=await fetch(url,{method:'DELETE',headers:Object.assign({'Content-Type':'application/json'},headers),body:JSON.stringify({etag:old.etag})});
          if(!response.ok)throw new Error('Could not discard draft');
          var cached=await checkpointCache;
          if(cached?.etag===old.etag)checkpointCache=Promise.resolve(null);
        }
        previous=null;lastSent=null;
      }catch(_){say('Draft could not be cleared');}
    }
    async function write(value,version){
      if(discarded||version!==epoch||isLocked()||value===lastSent)return;
      if(value===original){await removeCheckpoint();say('No unsaved text');return;}
      var context=await ready;
      if(discarded||version!==epoch)return;
      if(!context||!path){say('Draft not saved · click out to finish');return;}
      say('Saving draft…');
      writing=true;
      try{
        var payload={round:round,target:path,baseline:context.baseline,body:value};
        if(context.bucket){
          previous=Object.assign({},payload,{etag:crypto.randomUUID(),until:Date.now()+604800000});
          sessionStorage.setItem(context.bucket,JSON.stringify(previous));
        }else{
          var response=await fetch(url,{method:'PUT',headers:Object.assign({'Content-Type':'application/json'},headers),body:JSON.stringify(payload)});
          var data=await response.json();
          if(!response.ok||!data.ok||!data.etag)throw new Error('Draft save failed');
          previous=Object.assign({},payload,{etag:data.etag});checkpointCache=Promise.resolve(previous);
        }
        lastSent=value;
        if(version===epoch)say(savedMessage);
      }catch(_){if(version===epoch)say('Draft not saved · click out to finish');}
      finally{writing=false;}
    }
    function change(value,delay){
      clearTimeout(timer);var version=++epoch;
      if(value.length>30000){say('Draft too long to save');return;}
      if(value===lastSent&&!writing){say(savedMessage);return;}
      if(value===original&&!previous&&!writing){say('No unsaved text');return;}
      say('Unsaved text');
      timer=setTimeout(function(){enqueue(function(){return write(value,version);});},delay);
    }
    return {
      change:function(value){if(!stopped){button.hidden=true;change(value,2000);}},
      pause:function(){clearTimeout(timer);epoch++;},
      finish:function(value){
        if(value!==original&&(value!==lastSent||writing)&&value.length<=30000)change(value,0);
      },
      stop:function(){stopped=true;clearTimeout(timer);},
      discard:function(){discarded=true;stopped=true;clearTimeout(timer);enqueue(removeCheckpoint);}
    };
  }
`;
}
