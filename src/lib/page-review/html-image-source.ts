/** Newsletter image controls stage safe document edits; Save revision remains explicit. */
export function htmlImageSource(): string {
  return String.raw`
  var htmlImagePatches=new Map(),htmlImageEditor=null;
  var htmlImageOriginals=originalReviewImages.map(function(img){return {node:img,attrs:Array.from(img.attributes).map(function(a){return [a.name,a.value];}),sources:img.closest('picture')?Array.from(img.closest('picture').querySelectorAll('source')).map(function(source){return {node:source,media:source.getAttribute('media')};}):[],src:img.getAttribute('src')||'',alt:img.getAttribute('alt')||''};});
  function htmlImageDirty(){return htmlImagePatches.size>0;}
  function htmlImageSaving(){return !!(htmlImageEditor&&htmlImageEditor.busy);}
  function getHtmlImageEdits(){return Array.from(htmlImagePatches.values()).map(function(item){return item.patch;});}
  function restoreHtmlImage(index){
    var original=htmlImageOriginals[index],img=original.node;
    Array.from(img.attributes).forEach(function(a){img.removeAttribute(a.name);});
    original.attrs.forEach(function(a){img.setAttribute(a[0],a[1]);});
    original.sources.forEach(function(source){if(source.media===null)source.node.removeAttribute('media');else source.node.setAttribute('media',source.media);});
  }
  function resetHtmlImages(){closeHtmlImageEditor();htmlImageOriginals.forEach(function(_,index){restoreHtmlImage(index);});htmlImagePatches.clear();}
  function closeHtmlImageEditor(){if(htmlImageEditor)htmlImageEditor.dialog.close();}
  function cleanupHtmlImageEditor(){closeHtmlImageEditor();}
  function htmlImageField(label,type,value){
    var wrap=make('label','bhn-rv-html-image-field'),caption=make('span','',label),input=make('input');input.type=type;input.value=String(value);wrap.append(caption,input);return {wrap:wrap,input:input};
  }
  function htmlImageButton(label,handler,primary){
    var button=make('button',primary?'bhn-rv-btn bhn-rv-btn-primary':'bhn-rv-btn',label);button.type='button';button.addEventListener('click',handler);return button;
  }
  function showHtmlImageError(editor,message){editor.error.textContent=message;editor.error.hidden=!message;}
  function imageTransform(editor){
    var values={};Object.keys(editor.cropFields).forEach(function(key){values[key]=Number(editor.cropFields[key].value)/100;});
    if(!Object.keys(values).every(function(key){return Number.isFinite(values[key]);})||values.left<0||values.top<0||values.width<=0||values.height<=0||values.left+values.width>1.000001||values.top+values.height>1.000001)throw new Error('Keep the crop inside the picture: left + width and top + height must be 100% or less.');
    return {crop:values,rotate:editor.rotate,flipX:editor.flipX,flipY:editor.flipY};
  }
  function transformedHtmlImage(editor){var t=imageTransform(editor);return t.rotate!==0||t.flipX||t.flipY||t.crop.left!==0||t.crop.top!==0||t.crop.width!==1||t.crop.height!==1;}
  function refreshHtmlImagePreview(editor){
    if(htmlImageEditor!==editor)return;
    var image=editor.source,t;
    try{t=imageTransform(editor);}catch(error){showHtmlImageError(editor,error.message);return;}
    editor.rotateLabel.textContent=t.rotate+'°';editor.flipHorizontal.setAttribute('aria-pressed',String(t.flipX));editor.flipVertical.setAttribute('aria-pressed',String(t.flipY));
    editor.cropControls.disabled=!editor.assetId||editor.busy;
    editor.transformTools.querySelectorAll('button').forEach(function(button){button.disabled=!editor.assetId||editor.busy;});
    editor.externalNote.hidden=!!editor.assetId;
    if(!image.complete||!image.naturalWidth)return;
    var sw=image.naturalWidth*t.crop.width,sh=image.naturalHeight*t.crop.height,turned=t.rotate===90||t.rotate===270;
    var width=turned?sh:sw,height=turned?sw:sh,scale=Math.min(1,720/width,360/height),canvas=editor.canvas;
    canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    var context;try{context=canvas.getContext('2d');}catch(_){return;}if(!context)return;
    context.clearRect(0,0,canvas.width,canvas.height);context.save();context.translate(canvas.width/2,canvas.height/2);context.rotate(t.rotate*Math.PI/180);context.scale(t.flipX?-1:1,t.flipY?-1:1);
    context.drawImage(image,image.naturalWidth*t.crop.left,image.naturalHeight*t.crop.top,sw,sh,-sw*scale/2,-sh*scale/2,sw*scale,sh*scale);context.restore();
    editor.canvas.hidden=false;editor.fallback.hidden=true;
  }
  function resetHtmlImageTransform(editor){
    editor.rotate=0;editor.flipX=false;editor.flipY=false;showHtmlImageError(editor,'');
    Object.keys(editor.cropFields).forEach(function(key){editor.cropFields[key].value=key==='width'||key==='height'?'100':'0';});refreshHtmlImagePreview(editor);
  }
  function loadHtmlImageSource(editor,url){
    editor.src=url;editor.canvas.hidden=true;editor.fallback.hidden=false;editor.fallback.src=url;
    var source=new Image();editor.source=source;source.onload=function(){refreshHtmlImagePreview(editor);};source.onerror=function(){if(htmlImageEditor===editor)showHtmlImageError(editor,'The picture preview could not load. You can still replace it.');};source.src=url;
  }
  function setHtmlImageBusy(editor,busy){
    editor.busy=busy;editor.dialog.node.setAttribute('aria-busy',String(busy));editor.upload.disabled=busy;editor.apply.disabled=busy;editor.remove.disabled=busy;
    editor.status.textContent=busy?'Preparing picture…':'';refreshHtmlImagePreview(editor);renderCommentCopy();
  }
  async function requestHtmlImageAsset(editor,file,transform){
    var payload=new FormData();if(file)payload.append('file',file);else payload.append('assetId',editor.assetId);
    if(transform)payload.append('transform',JSON.stringify(transform));
    payload.append('expectedRound',String(inlineEdit.round));payload.append('revision',inlineEdit.revision);payload.append('issueRevision',inlineEdit.issueRevision);
    var controller=new AbortController();editor.abort=controller;
    var response=await fetch(endpoint+'/document',{method:'POST',headers:{Authorization:'Bearer '+credential},body:payload,signal:controller.signal}),data=await response.json();
    if(!response.ok||!data.ok||!data.asset)throw new Error(data.error||'This picture could not be prepared. Your newsletter has not changed.');
    return data.asset;
  }
  async function uploadHtmlImage(editor,file){
    if(!file||editor.busy||htmlImageEditor!==editor)return;
    if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)){showHtmlImageError(editor,'Choose a PNG, JPEG, WebP or GIF picture.');return;}
    if(file.size>4300000){showHtmlImageError(editor,'Choose a picture smaller than 4.3 MB.');return;}
    setHtmlImageBusy(editor,true);showHtmlImageError(editor,'');
    var uploaded=false;
    try{var asset=await requestHtmlImageAsset(editor,file);if(htmlImageEditor!==editor)return;editor.assetId=asset.id;resetHtmlImageTransform(editor);loadHtmlImageSource(editor,asset.url);uploaded=true;}
    catch(error){if(htmlImageEditor===editor&&error.name!=='AbortError')showHtmlImageError(editor,error.message);}
    finally{if(htmlImageEditor===editor){setHtmlImageBusy(editor,false);editor.upload.value='';if(uploaded)editor.status.textContent='Picture uploaded. Apply changes, then Save revision to update the newsletter.';}}
  }
  function previewHtmlImagePatch(index,patch,src){
    restoreHtmlImage(index);var img=htmlImageOriginals[index].node;
    if(patch.remove){img.style.display='none';return;}
    if(patch.assetId){img.setAttribute('src',src);['srcset','sizes','data-src','data-srcset'].forEach(function(key){img.removeAttribute(key);});htmlImageOriginals[index].sources.forEach(function(source){source.node.setAttribute('media','not all');});img.removeAttribute('height');img.style.height='auto';}
    if(patch.alt!==undefined)img.setAttribute('alt',patch.alt);
    if(patch.width!==undefined){img.setAttribute('width',patch.width+'%');img.style.width=patch.width+'%';img.style.maxWidth='100%';img.style.height='auto';img.style.display='block';img.removeAttribute('height');}
    if(patch.align!==undefined){img.removeAttribute('align');img.style.display='block';img.style.marginLeft=patch.align==='left'?'0':'auto';img.style.marginRight=patch.align==='right'?'0':'auto';}
  }
  function stageHtmlImage(editor,remove){
    if(!inlineEdit.allowed||inlineEdit.saving||state.saving||isLocked()||htmlImageEditor!==editor)return;
    var original=htmlImageOriginals[editor.index],previous=htmlImagePatches.get(editor.index),patch=previous?Object.assign({},previous.patch):{index:editor.index,before:{src:original.src,alt:original.alt}};
    if(remove)patch={index:editor.index,before:patch.before,remove:true};
    else{
      delete patch.remove;
      if(editor.assetId&&editor.src!==original.src)patch.assetId=editor.assetId;
      if(editor.alt.value!==original.alt)patch.alt=editor.alt.value;else delete patch.alt;
      if(editor.widthChanged)patch.width=Number(editor.width.value);
      if(editor.alignChanged)patch.align=editor.align.value;
    }
    if(Object.keys(patch).length===2)htmlImagePatches.delete(editor.index);else htmlImagePatches.set(editor.index,{patch:patch,src:editor.src});
    previewHtmlImagePatch(editor.index,patch,editor.src);inlineEdit.error='';editor.dialog.close();renderCommentCopy();
  }
  async function applyHtmlImage(editor){
    if(editor.busy||htmlImageEditor!==editor||!inlineEdit.allowed||isLocked())return;
    var width=Number(editor.width.value);if(editor.widthChanged&&(!Number.isInteger(width)||width<10||width>100)){showHtmlImageError(editor,'Picture width must be a whole number from 10% to 100%.');return;}
    if(editor.alt.value.length>400){showHtmlImageError(editor,'Keep the alternative text under 400 characters.');return;}
    showHtmlImageError(editor,'');
    try{
      if(transformedHtmlImage(editor)){
        if(!editor.assetId)throw new Error('Upload a replacement before cropping or rotating this external picture.');
        setHtmlImageBusy(editor,true);var asset=await requestHtmlImageAsset(editor,null,imageTransform(editor));if(htmlImageEditor!==editor)return;editor.assetId=asset.id;editor.src=asset.url;
      }
      stageHtmlImage(editor,false);
    }catch(error){if(htmlImageEditor===editor&&error.name!=='AbortError')showHtmlImageError(editor,error.message);}
    finally{if(htmlImageEditor===editor)setHtmlImageBusy(editor,false);}
  }
  function openHtmlImageEditor(img){
    if(!htmlReview||!inlineEdit.allowed||inlineEdit.saving||state.saving||isLocked())return;
    var index=originalReviewImages.indexOf(img);if(index<0)return;closeHtmlImageEditor();
    var original=htmlImageOriginals[index],pending=htmlImagePatches.get(index),metadata=(inlineEdit.images||[]).find(function(item){return item.index===index;});
    var dialog=createHtmlReviewDialog('Edit picture'),editor={dialog:dialog,index:index,src:img.getAttribute('src')||'',assetId:pending&&pending.patch.assetId||metadata&&metadata.assetId||null,busy:false,abort:null,widthChanged:false,alignChanged:false,rotate:0,flipX:false,flipY:false,cropFields:{}};htmlImageEditor=editor;
    dialog.node.classList.add('bhn-rv-html-image-dialog');dialog.onClose=function(){if(editor.abort)editor.abort.abort();if(htmlImageEditor===editor)htmlImageEditor=null;renderCommentCopy();};
    var intro=make('p','bhn-rv-html-image-help','Replace, crop or adjust this picture. Apply changes here, then Save revision to keep them.');dialog.body.appendChild(intro);
    var layout=make('div','bhn-rv-html-image-workbench'),controls=make('div','bhn-rv-html-image-controls'),preview=make('div','bhn-rv-html-image-preview');layout.append(controls,preview);dialog.body.appendChild(layout);
    var upload=htmlImageField('Replace picture from your device','file','');upload.input.accept='image/png,image/jpeg,image/webp,image/gif';editor.upload=upload.input;upload.input.addEventListener('change',function(){void uploadHtmlImage(editor,upload.input.files&&upload.input.files[0]);});controls.appendChild(upload.wrap);
    var alt=htmlImageField('Alternative text','text',img.getAttribute('alt')||'');alt.input.maxLength=400;editor.alt=alt.input;controls.appendChild(alt.wrap);
    var altHelp=make('p','bhn-rv-html-image-help','Describe the picture for readers who cannot see it. Leave blank only when decorative.');controls.appendChild(altHelp);
    var widthMatch=(img.style.width||'').match(/^(\d+(?:\.\d+)?)%$/),initialWidth=pending&&pending.patch.width!==undefined?pending.patch.width:widthMatch?Number(widthMatch[1]):100;
    var width=htmlImageField('Width (% of content column)','number',initialWidth);width.input.min='10';width.input.max='100';width.input.step='1';editor.width=width.input;width.input.addEventListener('input',function(){editor.widthChanged=true;});controls.appendChild(width.wrap);
    var alignWrap=make('label','bhn-rv-html-image-field'),align=make('select');align.setAttribute('aria-label','Alignment');alignWrap.appendChild(make('span','','Alignment'));[['left','Left'],['center','Centre'],['right','Right']].forEach(function(item){var option=make('option','',item[1]);option.value=item[0];align.appendChild(option);});alignWrap.appendChild(align);editor.align=align;align.value=pending&&pending.patch.align||((img.style.marginLeft==='auto'&&img.style.marginRight==='auto')?'center':img.style.marginLeft==='auto'?'right':'left');align.addEventListener('change',function(){editor.alignChanged=true;});controls.appendChild(alignWrap);
    editor.externalNote=make('p','bhn-rv-html-image-help','This picture is hosted externally. Upload it or a replacement to enable crop and rotation.');controls.appendChild(editor.externalNote);
    var crop=make('fieldset','bhn-rv-html-image-crop');crop.appendChild(make('legend','','Crop · source image percent'));editor.cropControls=crop;
    [['left','Left'],['top','Top'],['width','Width'],['height','Height']].forEach(function(item){var key=item[0],field=htmlImageField(item[1],'number',key==='width'||key==='height'?100:0);field.input.min=key==='width'||key==='height'?'1':'0';field.input.max='100';field.input.step='0.1';editor.cropFields[key]=field.input;field.input.addEventListener('input',function(){showHtmlImageError(editor,'');refreshHtmlImagePreview(editor);});crop.appendChild(field.wrap);});controls.appendChild(crop);
    editor.transformTools=make('div','bhn-rv-html-image-transform');editor.transformTools.setAttribute('role','group');editor.transformTools.setAttribute('aria-label','Rotate and flip picture');
    editor.rotateLabel=make('span','bhn-rv-html-image-angle','0°');editor.transformTools.appendChild(htmlImageButton('Rotate left',function(){editor.rotate=(editor.rotate+270)%360;refreshHtmlImagePreview(editor);}));editor.transformTools.appendChild(htmlImageButton('Rotate right',function(){editor.rotate=(editor.rotate+90)%360;refreshHtmlImagePreview(editor);}));editor.transformTools.appendChild(editor.rotateLabel);
    editor.flipHorizontal=htmlImageButton('Flip horizontally',function(){editor.flipX=!editor.flipX;refreshHtmlImagePreview(editor);});editor.flipVertical=htmlImageButton('Flip vertically',function(){editor.flipY=!editor.flipY;refreshHtmlImagePreview(editor);});editor.transformTools.append(editor.flipHorizontal,editor.flipVertical,htmlImageButton('Reset crop and rotation',function(){resetHtmlImageTransform(editor);}));controls.appendChild(editor.transformTools);
    preview.appendChild(make('p','bhn-rv-html-image-help','Picture preview'));editor.canvas=make('canvas');editor.canvas.setAttribute('role','img');editor.canvas.setAttribute('aria-label','Preview of picture with crop and rotation');editor.canvas.hidden=true;editor.fallback=make('img');editor.fallback.alt='Picture preview';preview.append(editor.canvas,editor.fallback);preview.appendChild(make('p','bhn-rv-html-image-help','Crop and rotation are saved into a new image so email clients show the same result. The original remains in review history.'));
    editor.error=make('p','bhn-rv-html-image-error');editor.error.setAttribute('role','alert');editor.error.hidden=true;editor.status=make('p','bhn-rv-html-image-help');editor.status.setAttribute('role','status');dialog.body.append(editor.error,editor.status);
    var removal=make('div','bhn-rv-html-image-remove-confirm');removal.hidden=true;removal.appendChild(make('p','','Remove this picture from the newsletter? Its previous version stays in review history.'));removal.append(htmlImageButton('Keep picture',function(){removal.hidden=true;}),htmlImageButton('Confirm removal',function(){if(!editor.busy)stageHtmlImage(editor,true);}));dialog.body.appendChild(removal);
    editor.remove=htmlImageButton('Remove picture',function(){removal.hidden=false;removal.querySelector('button').focus();});dialog.footer.append(editor.remove,htmlImageButton('Cancel',function(){dialog.close();}));editor.apply=htmlImageButton('Apply changes',function(){void applyHtmlImage(editor);},true);dialog.footer.appendChild(editor.apply);
    loadHtmlImageSource(editor,editor.src);refreshHtmlImagePreview(editor);alt.input.focus();
  }
  if(htmlReview)style.textContent+=[
    '.bhn-rv-html-image-dialog{width:min(920px,calc(100vw - 24px))!important;}.bhn-rv-html-image-dialog *{box-sizing:border-box;}.bhn-rv-html-image-workbench{display:grid;grid-template-columns:minmax(220px,1fr) minmax(0,1.25fr);gap:20px;align-items:start;}.bhn-rv-html-image-controls{display:grid;gap:12px;min-width:0;}.bhn-rv-html-image-field{display:grid;gap:5px;font-size:12px;font-weight:650;color:#34434e;}.bhn-rv-html-image-field input,.bhn-rv-html-image-field select{width:100%;min-height:36px;border:1px solid #b9c5cc;border-radius:5px;background:#fff;color:#17212b;padding:6px 8px;font:inherit;font-weight:400;}.bhn-rv-html-image-field input[type=file]{font-size:12px;}.bhn-rv-html-image-help{margin:0 0 10px;color:#60707b;font-size:12px;line-height:1.45;}.bhn-rv-html-image-crop{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0;border:1px solid #d8e0e5;padding:10px;}.bhn-rv-html-image-crop legend{font-size:12px;color:#34434e;}.bhn-rv-html-image-transform{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}.bhn-rv-html-image-transform .bhn-rv-btn{min-height:34px;font-size:11px;}.bhn-rv-html-image-transform [aria-pressed=true]{border-color:#176879;background:#edf8fa;}.bhn-rv-html-image-angle{font-size:12px;color:#60707b;}.bhn-rv-html-image-preview{min-width:0;text-align:center;}.bhn-rv-html-image-preview canvas,.bhn-rv-html-image-preview img{max-width:100%;max-height:360px;width:auto;height:auto;margin:0 auto 12px;object-fit:contain;background:#f0f4f6;}.bhn-rv-html-image-error{padding:10px;border-left:3px solid #a53b3b;background:#fff3f3;color:#8c2020;font-size:13px;}.bhn-rv-html-image-remove-confirm{margin-top:12px;padding:12px;border-top:1px solid #ead4d4;color:#7d3030;font-size:13px;}.bhn-rv-html-image-remove-confirm button{margin-right:8px;}.bhn-rv-html-image-dialog [hidden]{display:none!important;}.bhn-rv-html-image-dialog :focus-visible{outline:3px solid #d6aa4c;outline-offset:2px;}',
    '@media(max-width:640px){.bhn-rv-html-image-workbench{grid-template-columns:1fr;}.bhn-rv-html-image-preview{grid-row:1;}.bhn-rv-html-image-preview canvas,.bhn-rv-html-image-preview img{max-height:240px;}}'
  ].join('');
`;
}
