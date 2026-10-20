import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const jsdiff = readFileSync(path.join(process.cwd(), "node_modules/diff/dist/diff.min.js"), "utf8");
const jsdiffLicense = readFileSync(path.join(process.cwd(), "node_modules/diff/LICENSE"), "utf8");
const sizingBridge = `(function(){
  var key = document.currentScript.dataset.bhnKey, lastHeight = 0, lastWidth = 0, pending = false;
  function report() {
    pending = false;
    var height = Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
    var width = Math.ceil(Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
    if (height !== lastHeight || width !== lastWidth) { lastHeight = height; lastWidth = width; parent.postMessage({ type: "bhn-review-height", key: key, height: height, width: width }, "*"); }
  }
  function resize() { if (!pending) { pending = true; requestAnimationFrame(report); } }
  new ResizeObserver(resize).observe(document.body);
  window.addEventListener("load", resize);
  document.addEventListener("click", function(event){ if (event.target.closest && event.target.closest("a,area")) event.preventDefault(); }, true);
  resize();
})();`;
const bridgeHash = createHash("sha256").update(sizingBridge).digest("base64");

/** Browser helpers for isolated, annotated newsletter snapshots. */
export function comparisonSource(): string {
  return String.raw`
  function comparisonDocuments(beforeHtml, afterHtml) {
    var exports = {}, module = { exports: exports };
    /* ${jsdiffLicense} */
    ${jsdiff}
    var docs = [beforeHtml, afterHtml].map(function(html){
      var doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("script,meta,base,iframe,object,embed,template,link[rel=import]").forEach(function(node){ node.remove(); });
      doc.querySelectorAll("*").forEach(function(node){
        Array.from(node.attributes).forEach(function(attr){ if (/^on/i.test(attr.name) || attr.name === "nonce") node.removeAttribute(attr.name); });
      });
      return doc;
    });
    var colors = ["#ffe4e6", "#dcfce7"], inks = ["#881337", "#14532d"];
    function textMap(doc) {
      var walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT), nodes = [], text = "", node;
      while ((node = walker.nextNode())) {
        if (!node.textContent.trim() || node.parentElement.closest("style,script,noscript,svg,[hidden]")) continue;
        nodes.push({ node: node, start: text.length, end: text.length + node.textContent.length });
        text += node.textContent + "\n";
      }
      return { nodes: nodes, text: text };
    }
    var maps = docs.map(textMap), ranges = [[], []], positions = [0, 0];
    var changes = exports.diffWordsWithSpace(maps[0].text, maps[1].text, { timeout: 500 });
    // shortcut: exceptionally large diffs highlight all text; use a worker if this becomes common.
    if (!changes) changes = [{ value: maps[0].text, removed: true }, { value: maps[1].text, added: true }];
    changes.forEach(function(change){
      [0, 1].forEach(function(side){
        if ((side === 0 && change.added) || (side === 1 && change.removed)) return;
        if ((change.removed || change.added) && change.value.trim()) ranges[side].push({ start: positions[side], end: positions[side] + change.value.length });
        positions[side] += change.value.length;
      });
    });
    maps.forEach(function(map, side){
      map.nodes.forEach(function(entry){
        var parts = ranges[side].filter(function(range){ return range.start < entry.end && range.end > entry.start; });
        if (!parts.length) return;
        var fragment = docs[side].createDocumentFragment(), offset = 0, text = entry.node.textContent;
        parts.forEach(function(range){
          var start = Math.max(0, range.start - entry.start), end = Math.min(text.length, range.end - entry.start);
          fragment.appendChild(docs[side].createTextNode(text.slice(offset, start)));
          var mark = docs[side].createElement("mark");
          mark.dataset.bhnDiff = side ? "added" : "removed";
          mark.title = side ? "Added text" : "Removed text";
          mark.style.cssText = "background:" + colors[side] + "!important;color:" + inks[side] + "!important;text-decoration:" + (side ? "underline" : "line-through") + "!important;";
          mark.textContent = text.slice(start, end);
          fragment.appendChild(mark);
          offset = end;
        });
        fragment.appendChild(docs[side].createTextNode(text.slice(offset)));
        entry.node.replaceWith(fragment);
      });
    });
    ["img", "a[href]"].forEach(function(selector){
      var nodes = docs.map(function(doc){ return Array.from(doc.querySelectorAll(selector)); });
      var keys = nodes.map(function(list){ return list.map(function(node){ return selector === "img" ? [node.getAttribute("src"), node.getAttribute("alt")].join("|") : [node.textContent, node.getAttribute("href")].join("|"); }); });
      var changes = exports.diffArrays(keys[0], keys[1], { timeout: 100 }) || [{ value: keys[0], removed: true }, { value: keys[1], added: true }], offsets = [0, 0];
      changes.forEach(function(change){
        [0, 1].forEach(function(side){
          if ((side === 0 && change.added) || (side === 1 && change.removed)) return;
          if (change.added || change.removed) nodes[side].slice(offsets[side], offsets[side] + change.value.length).forEach(function(node){
            node.dataset.bhnDiff = side ? "added" : "removed";
            node.style.setProperty("outline", "3px solid " + (side ? "#15803d" : "#be123c"), "important");
            node.title = (side ? "Added or changed " : "Removed or changed ") + (selector === "img" ? "image" : "link destination");
          });
          offsets[side] += change.value.length;
        });
      });
    });
    return docs.map(function(doc){
      var key = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(function(value){ return value.toString(16).padStart(2, "0"); }).join("");
      var charset = doc.createElement("meta"); charset.setAttribute("charset", "utf-8");
      var policy = doc.createElement("meta"); policy.httpEquiv = "Content-Security-Policy";
      policy.content = "default-src 'none'; script-src 'sha256-${bridgeHash}'; script-src-attr 'none'; style-src 'unsafe-inline' https:; img-src https: data:; font-src https: data:; base-uri 'none'; form-action 'none'";
      doc.head.prepend(charset, policy);
      var layout = doc.createElement("style");
      layout.textContent = "html,body{overflow:hidden!important;height:auto!important;min-height:0!important;max-height:none!important}body{display:flow-root!important}";
      doc.head.appendChild(layout);
      var script = doc.createElement("script"); script.dataset.bhnKey = key;
      // Only this hash-authorized sizing bridge runs; pasted scripts and event handlers never do.
      script.textContent = ${JSON.stringify(sizingBridge)};
      doc.body.appendChild(script);
      return { html: "<!doctype html>" + doc.documentElement.outerHTML, key: key };
    });
  }
  `;
}
