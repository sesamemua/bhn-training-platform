/** Review saves use a fresh document. Preserve scroll even in an opaque-origin HTML sandbox. */
export function reviewViewportSource(): string {
  return String.raw`
  var viewportSuffix=/&bhn-review-viewport=(\d{1,9}),(\d{1,9})$/;
  function withReviewFragment(hash){
    history.replaceState(history.state,'',location.pathname+location.search+hash);
  }
  function reloadReviewInPlace(){
    var x=Math.max(0,Math.round(window.scrollX)),y=Math.max(0,Math.round(window.scrollY));
    if(x||y){
      // history.state and sessionStorage aren't retained by the sandbox across a reload.
      // Only carry coordinates; keep the existing review/login fragment unchanged.
      var hash=location.hash.replace(viewportSuffix,'')||'#';
      try{withReviewFragment(hash+'&bhn-review-viewport='+x+','+y);}catch(_){}
    }
    window.location.reload();
  }
  function restoreReviewViewport(){
    var hash=location.hash,saved=viewportSuffix.exec(hash);
    if(!saved)return;
    try{withReviewFragment(hash.slice(0,saved.index).replace(/^#$/,''));}catch(_){return;}
    var x=Number(saved[1]),y=Number(saved[2]),cancelled=false;
    function restore(){if(!cancelled)window.scrollTo({left:x,top:y,behavior:'instant'});}
    function stop(){cancelled=true;cleanupRestore();}
    function cleanupRestore(){
      ['wheel','pointerdown','touchstart','keydown'].forEach(function(event){window.removeEventListener(event,stop,true);});
      window.removeEventListener('load',afterLoad);
    }
    function afterLoad(){restore();cleanupRestore();}
    // The HTML already exists, but images can still change the available scroll range.
    restore();
    if(document.readyState!=='complete'){
      ['wheel','pointerdown','touchstart','keydown'].forEach(function(event){window.addEventListener(event,stop,{capture:true,passive:true});});
      window.addEventListener('load',afterLoad,{once:true});
    }
  }
  if(htmlReview||reportCommentEndpoint&&staffSurface==='social')restoreReviewViewport();
`;
}
