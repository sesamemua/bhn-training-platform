/** Personal report-comment display settings; never part of the saved report. */
export function reportPanelSizeSource(): string {
  return String.raw`
  var reportPanelPresets = [
    {name:'Compact',width:480,font:13}, {name:'Comfortable',width:640,font:14},
    {name:'Large',width:800,font:15}, {name:'Extra large',width:960,font:17}
  ];
  // On phones/tablets, keep an always-available compact launcher instead of a tall panel above the paper.
  if (reportReview && window.matchMedia('(max-width: 900px)').matches) state.panelCollapsed = true;
  var reportPanelSize = 800;
  if (reportReview) { try {
    var savedWidth=localStorage.getItem('bhn-report-panel-width-v2');var parsedWidth=Number(savedWidth);
    if(savedWidth!==null&&Number.isFinite(parsedWidth)&&parsedWidth>=480&&parsedWidth<=960)reportPanelSize=Math.round(parsedWidth);
    else if(savedWidth===null){var oldSize=localStorage.getItem('bhn-report-panel-size-v1');var parsed=Number(oldSize);if(oldSize!==null&&Number.isInteger(parsed)&&reportPanelPresets[parsed])reportPanelSize=reportPanelPresets[parsed].width;}
  } catch(_) {} }
  function reportPanelFont(width) {
    var lower=reportPanelPresets[0],upper=reportPanelPresets[reportPanelPresets.length-1];
    for(var i=1;i<reportPanelPresets.length;i++){if(width<=reportPanelPresets[i].width){lower=reportPanelPresets[i-1];upper=reportPanelPresets[i];break;}}
    return Math.round((lower.font+(upper.font-lower.font)*(width-lower.width)/(upper.width-lower.width))*100)/100;
  }
  function applyReportPanelSize(width) {
    if (!reportReview) return;
    var value=Number(width);
    reportPanelSize=Math.round(Math.max(480,Math.min(960,Number.isFinite(value)?value:800)));
    root.setAttribute('data-panel-size',String(reportPanelSize));
    root.style.setProperty('--report-panel-font',reportPanelFont(reportPanelSize)+'px');
    var workbench=root.closest('[data-report-workbench]');
    if(workbench)workbench.style.setProperty('--report-review-width',reportPanelSize+'px');
    try{localStorage.setItem('bhn-report-panel-width-v2',String(reportPanelSize));}catch(_){}
  }
  function renderReportPanelSize(body) {
    if(!reportReview)return;
    applyReportPanelSize(reportPanelSize);
    root.setAttribute('data-composing',String(!!state.selected || state.replyTo !== null || state.editingId !== null));
    var collapse=root.querySelector('.bhn-rv-collapse');
    if(collapse && state.panelCollapsed){collapse.textContent='Comments · R'+state.review.round+(isLocked()?' · Locked':'');}
    var control=make('fieldset','bhn-rv-panel-size');
    control.appendChild(make('legend','','Comments panel size'));
    var output=make('output','bhn-rv-panel-size-value');output.setAttribute('aria-live','polite');
    var slider=make('input','');slider.type='range';slider.min='480';slider.max='960';slider.step='1';slider.value=String(reportPanelSize);slider.setAttribute('aria-label','Comments panel size');
    var buttons=make('div','bhn-rv-panel-size-presets');
    function update(width){applyReportPanelSize(width);slider.value=String(reportPanelSize);var p=reportPanelPresets.find(function(p){return p.width===reportPanelSize;});slider.setAttribute('aria-valuetext',(p?p.name:'Custom')+', up to '+reportPanelSize+' pixels wide, text '+reportPanelFont(reportPanelSize)+' pixels');output.textContent=(p?p.name:'Custom')+' · '+reportPanelSize+' px';Array.from(buttons.children).forEach(function(b,i){b.setAttribute('aria-pressed',String(reportPanelPresets[i].width===reportPanelSize));});window.requestAnimationFrame(onPositionChange);}
    reportPanelPresets.forEach(function(p){var b=addButton(p.name,'bhn-rv-btn',function(){update(p.width);});b.setAttribute('aria-pressed',String(p.width===reportPanelSize));buttons.appendChild(b);});
    slider.addEventListener('input',function(){update(slider.value);});
    control.appendChild(output);control.appendChild(slider);control.appendChild(buttons);body.prepend(control);update(reportPanelSize);
  }
  if(reportReview)style.textContent += [
    '#bhn-review-overlay[data-report-tools=true][data-panel-size] .bhn-rv-shell{max-height:calc(100dvh - 56px);}',
    '#bhn-review-overlay[data-report-tools=true][data-panel-size] .bhn-rv-thread-preview{font-size:var(--report-panel-font);line-height:1.5;white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;}',
    '#bhn-review-overlay[data-report-tools=true][data-panel-size] :is(.bhn-rv-thread-body,.bhn-rv-reply-body,.bhn-rv-textarea){font-size:var(--report-panel-font);line-height:1.5;}',
    '#bhn-review-overlay[data-report-tools=true][data-panel-size] .bhn-rv-textarea{min-height:160px;max-height:45vh;}',
    '#bhn-review-overlay[data-report-tools=true][data-panel-size] :is(.bhn-rv-author,.bhn-rv-btn,.bhn-rv-link-btn,.bhn-rv-thread-locate,.bhn-rv-compare-open,.bhn-rv-title){font-size:calc(var(--report-panel-font) - 1px);}',
    '#bhn-review-overlay[data-report-tools=true][data-panel-size] :is(.bhn-rv-time,.bhn-rv-meta,.bhn-rv-reply-meta,.bhn-rv-status){font-size:calc(var(--report-panel-font) - 3px);}',
    '#bhn-review-overlay[data-report-tools=true][data-panel-size] :is(.bhn-rv-thread-quote,.bhn-rv-quote,.bhn-rv-notice,.bhn-rv-empty){font-size:calc(var(--report-panel-font) - 2px);line-height:1.5;}',
    '#bhn-review-overlay[data-report-tools=true][data-panel-size] .bhn-rv-thread-toggle{padding:10px;gap:9px;grid-template-columns:24px minmax(0,1fr) auto;}',
    '#bhn-review-overlay[data-report-tools=true][data-panel-size] .bhn-rv-number{width:24px;height:24px;font-size:12px;}',
    '#bhn-review-overlay[data-report-tools=true][data-panel-size] .bhn-rv-history>summary{font-size:var(--report-panel-font);}',
    '#bhn-review-overlay[data-report-tools=true][data-docked=true] .bhn-rv-shell{max-height:calc(100dvh - 56px);}',
    '#bhn-review-overlay[data-report-tools=true][data-composing=true] .bhn-report-toolbar{position:static;}',
    '#bhn-review-overlay[data-report-tools=true] .bhn-rv-body{min-height:0;scroll-padding:12px;}',
    '@media(max-width:900px){#bhn-review-overlay[data-report-tools=true][data-docked=true]{position:fixed!important;left:auto!important;right:12px!important;top:auto!important;bottom:12px!important;width:min(var(--report-review-width,800px),calc(100vw - 24px))!important;margin:0!important;z-index:2147483647;}#bhn-review-overlay[data-report-tools=true][data-docked=true].bhn-rv-root-collapsed{width:auto!important;}#bhn-review-overlay[data-report-tools=true][data-docked=true] .bhn-rv-shell{max-height:72dvh;box-shadow:0 8px 28px #17212b33;}#bhn-review-overlay[data-report-tools=true] .bhn-rv-collapse{min-width:44px;min-height:44px;}#bhn-review-overlay[data-report-tools=true] .bhn-report-copy-flow{max-width:calc(100vw - 24px);}}',
    '#bhn-review-overlay .bhn-rv-panel-size{margin:0 0 12px;padding:12px;border:1px solid #c6d3dc;border-radius:8px;background:#fff;display:grid;gap:8px;min-width:0;}',
    '#bhn-review-overlay .bhn-rv-panel-size legend{font-size:13px;font-weight:750;padding:0 4px;}',
    '#bhn-review-overlay .bhn-rv-panel-size-value{font-size:13px;font-weight:650;color:#176879;}',
    '#bhn-review-overlay .bhn-rv-panel-size input{width:100%;min-height:28px;accent-color:#176879;}',
    '#bhn-review-overlay .bhn-rv-panel-size-presets{display:flex;flex-wrap:wrap;gap:6px;}',
    '#bhn-review-overlay .bhn-rv-panel-size-presets button{flex:1;min-height:40px;white-space:nowrap;}',
    '#bhn-review-overlay .bhn-rv-panel-size-presets button[aria-pressed=true]{background:#d9eef0;border-color:#176879;color:#134d59;}'
  ].join('');
`;
}
