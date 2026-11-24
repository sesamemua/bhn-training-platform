/** Staff-only autocomplete. The server validates full-name tags and sends mail only after save. */
export function mentionToolsSource() {
  return String.raw`
  var mentionDirectory = null;
  var mentionLoading = null;
  function attachReviewMentions(textarea, host) {
    if (!reportCommentEndpoint) return;
    var help=make('p','bhn-rv-mention-help','Type @ to tag a colleague. They will be emailed when you post.');host.appendChild(help);
    var menu=make('div','bhn-rv-mention-menu');menu.setAttribute('role','listbox');menu.setAttribute('aria-label','Tag a reviewer');menu.hidden=true;host.appendChild(menu);
    var active=0,options=[],ignoreNext=false;
    function query(){var value=textarea.value.slice(0,textarea.selectionStart);var match=/(?:^|\s)@([^@\n]{0,60})$/.exec(value);return match?{text:match[1],start:textarea.selectionStart-match[1].length-1,end:textarea.selectionStart}:null;}
    function choose(person){var q=query();if(!q)return;var insert='@'+person.label+' ';textarea.value=textarea.value.slice(0,q.start)+insert+textarea.value.slice(q.end);textarea.focus();textarea.setSelectionRange(q.start+insert.length,q.start+insert.length);ignoreNext=true;textarea.dispatchEvent(new Event('input',{bubbles:true}));menu.hidden=true;}
    function draw(){
      var q=query();menu.textContent='';options=[];active=0;
      if(!q||isLocked()||!textarea.isConnected){menu.hidden=true;return;}
      var people=(mentionDirectory||[]).filter(function(p){return p.label.toLocaleLowerCase().includes(q.text.trim().toLocaleLowerCase());}).slice(0,8);
      people.forEach(function(person){var b=addButton(person.label,'',function(){choose(person);});b.setAttribute('role','option');b.setAttribute('aria-selected','false');b.addEventListener('mousedown',function(e){e.preventDefault();});menu.appendChild(b);options.push(b);});
      menu.hidden=!options.length;
    }
    textarea.addEventListener('input',async function(){
      if(ignoreNext){ignoreNext=false;return;}if(!query()){menu.hidden=true;return;}
      if(!mentionDirectory){
        if(!mentionLoading)mentionLoading=fetch(reportCommentEndpoint+'/mentions').then(function(r){if(!r.ok)throw new Error('Could not load colleagues');return r.json();}).then(function(data){mentionDirectory=Array.isArray(data.people)?data.people:[];}).catch(function(){help.textContent='Team list unavailable. Try @ again to load colleagues.';}).finally(function(){mentionLoading=null;});
        await mentionLoading;
      }draw();
    });
    textarea.addEventListener('keydown',function(e){
      if(menu.hidden)return;
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();menu.hidden=true;return;}
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();active=(active+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;options.forEach(function(b,i){b.setAttribute('aria-selected',String(i===active));});return;}
      if(e.key==='Enter'&&!e.shiftKey&&options.length){e.preventDefault();options[active].click();}
    });
    textarea.addEventListener('blur',function(){window.setTimeout(function(){menu.hidden=true;},150);});
  }
  style.textContent += '.bhn-rv-mention-help{font-size:11px;color:#47616c;margin:5px 0;}.bhn-rv-mention-menu{display:grid;border:1px solid #adc4cf;border-radius:6px;background:#fff;max-height:230px;overflow:auto;margin:4px 0;}.bhn-rv-mention-menu[hidden]{display:none;}.bhn-rv-mention-menu button{padding:8px;text-align:left;border:0;background:#fff;color:#172c39;min-height:36px;}.bhn-rv-mention-menu button:hover,.bhn-rv-mention-menu button[aria-selected=true]{background:#d9eef0;}#bhn-review-overlay[data-report-tools=true] .bhn-rv-textarea{min-height:120px;font-size:13px;line-height:1.5;}';
`;
}
