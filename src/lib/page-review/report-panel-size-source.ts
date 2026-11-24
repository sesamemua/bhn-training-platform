/** Personal report-comment display settings; never part of the saved report. */
export function reportPanelSizeSource(): string {
  return String.raw`
  var reportPanelPresets = [
    {name:'Compact',width:480,font:13}, {name:'Comfortable',width:640,font:14},
    {name:'Large',width:800,font:15}, {name:'Extra large',width:960,font:17}
  ];
  var reportPanelSize = 2;
  if (reportReview) { try { var savedSize=localStorage.getItem('bhn-report-panel-size-v1');var parsed=Number(savedSize);if(savedSize!==null&&Number.isInteger(parsed)&&parsed>=0&&parsed<reportPanelPresets.length)reportPanelSize=parsed; } catch(_) {} }
  function applyReportPanelSize(index) {
    if (!reportReview) return;
    reportPanelSize=Math.max(0,Math.min(reportPanelPresets.length-1,Number(index)));
    var preset=reportPanelPresets[reportPanelSize];
    root.setAttribute('data-panel-size',String(reportPanelSize));
    root.style.setProperty('--report-panel-font',preset.font+'px');
    var workbench=root.closest('[data-report-workbench]');
    if(workbench)workbench.style.setProperty('--report-review-width',preset.width+'px');
    try{localStorage.setItem('bhn-report-panel-size-v1',String(reportPanelSize));}catch(_){}
  }
  function renderReportPanelSize(body) {
    if(!reportReview)return;
    applyReportPanelSize(reportPanelSize);
    var control=make('fieldset','bhn-rv-panel-size');
    control.appendChild(make('legend','','Comments panel size'));
    var output=make('output','bhn-rv-panel-size-value');output.setAttribute('aria-live','polite');
    var slider=make('input','');slider.type='range';slider.min='0';slider.max='3';slider.step='1';slider.value=String(reportPanelSize);slider.setAttribute('aria-label','Comments panel size');
    var buttons=make('div','bhn-rv-panel-size-presets');
    function update(index){applyReportPanelSize(index);slider.value=String(reportPanelSize);var p=reportPanelPresets[reportPanelSize];slider.setAttribute('aria-valuetext',p.name+', '+p.width+' pixels');output.textContent=p.name;Array.from(buttons.children).forEach(function(b,i){b.setAttribute('aria-pressed',String(i===reportPanelSize));});window.requestAnimationFrame(onPositionChange);}
    reportPanelPresets.forEach(function(p,i){var b=addButton(p.name,'bhn-rv-btn',function(){update(i);});b.setAttribute('aria-pressed',String(i===reportPanelSize));buttons.appendChild(b);});
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
