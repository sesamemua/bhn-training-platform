/** The report's direct-edit workflow and contextual comment action. */
export function reportUnifiedSource(): string {
  return String.raw`
  function reportMenuPosition(){
    root.querySelectorAll('.bhn-report-menu[open]').forEach(function(menu){var content=menu.querySelector('.bhn-report-menu-content'),r=menu.querySelector('summary').getBoundingClientRect();content.style.top=(r.bottom+4)+'px';content.style.right=Math.max(8,window.innerWidth-r.right)+'px';content.style.maxHeight=Math.max(100,window.innerHeight-r.bottom-16)+'px';});
  }
  function reportMenuEscape(event){if(event.key!=='Escape')return;var open=root.querySelector('.bhn-report-menu[open]');if(open){open.open=false;open.querySelector('summary').focus({preventScroll:true});}}
  if(reportReview){root.addEventListener('toggle',reportMenuPosition,true);document.addEventListener('keydown',reportMenuEscape);}

  if(reportReview)style.textContent += [
    '#bhn-review-overlay[data-report-tools=true] .bhn-report-toolbar{display:flex;align-items:center;gap:5px;position:sticky;top:-6px;min-height:46px;padding:6px 0;margin-bottom:7px;border-bottom:1px solid #d5e0e4;}',
    '#bhn-review-overlay[data-report-tools=true] .bhn-report-toolbar>.bhn-rv-btn,#bhn-review-overlay[data-report-tools=true] .bhn-report-menu>summary{width:auto;min-height:34px;padding:6px 8px;font-size:12px;white-space:nowrap;}',
    '#bhn-review-overlay[data-report-tools=true] .bhn-report-unified{font-weight:750;}',
    '#bhn-review-overlay .bhn-report-menu{position:relative;}',
    '#bhn-review-overlay .bhn-report-menu>summary{display:flex;align-items:center;cursor:pointer;border:1px solid #c6d0d6;border-radius:5px;background:#fff;list-style:none;color:#34434e;}',
    '#bhn-review-overlay .bhn-report-menu>summary::-webkit-details-marker{display:none;}',
    '#bhn-review-overlay .bhn-report-menu>summary::after{content:"⌄";margin-left:5px;}',
    '#bhn-review-overlay .bhn-report-menu:last-child{margin-left:auto;}',
    '#bhn-review-overlay .bhn-report-menu-content{position:fixed;right:12px;top:120px;z-index:4;width:240px;max-width:calc(100vw - 24px);overflow:auto;padding:7px;display:grid;gap:5px;background:#fff;border:1px solid #bfcfd7;border-radius:7px;box-shadow:0 8px 24px #17304726;}',
    '#bhn-review-overlay .bhn-report-menu:not([open])>.bhn-report-menu-content{display:none;}',
    '#bhn-review-overlay .bhn-report-menu-content .bhn-rv-btn{width:100%;text-align:left;min-height:36px;white-space:normal;}',
    '#bhn-review-overlay .bhn-report-guide{margin:0 0 8px;padding:7px 9px;background:#edf6f5;border-radius:5px;font-size:12px;color:#466b77;}',
    '.bhn-report-inline-comment{position:fixed;z-index:2147483647;display:grid;place-items:center;width:36px;height:36px;padding:8px;border:2px solid #fff;border-radius:50%;background:#176879;color:#fff;box-shadow:0 2px 8px #17304740;cursor:pointer;}',
    '.bhn-report-inline-comment[hidden]{display:none;}.bhn-report-inline-comment svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linejoin:round;stroke-linecap:round;}',
    '.bhn-report-inline-comment:focus-visible{outline:3px solid #d6aa4c;outline-offset:2px;}',
    '@media(max-width:530px){#bhn-review-overlay[data-report-tools=true] .bhn-report-toolbar{gap:4px;}#bhn-review-overlay[data-report-tools=true] .bhn-report-toolbar>.bhn-rv-btn,#bhn-review-overlay[data-report-tools=true] .bhn-report-menu>summary{min-height:40px;padding:6px;font-size:11px;}.bhn-report-inline-comment{width:40px;height:40px;}}',
    '@media print{.bhn-report-inline-comment{display:none!important;}}'
  ].join('');
`;
}
