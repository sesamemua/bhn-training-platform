import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";

async function main() {
  const css = await postcss([tailwind()]).process(await readFile("src/app/globals.css", "utf8"), { from: "src/app/globals.css" });
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import React from "react"; import {createRoot} from "react-dom/client";
      import {TrainingWeekCapacity} from "./src/components/training-week/TrainingWeekCapacity";
      import {SESSIONS} from "./src/lib/training-week/schedule-2026";
      import {sessionCapacity} from "./src/lib/training-week/capacity";
      window.saves=[];
      const sessions=SESSIONS.map((s,i)=>({id:s.slug,slug:s.slug,title:s.title,start:s.day+"T13:00:00Z",cap:sessionCapacity(s.capacity,[...Array.from({length:i===2?18:8},()=>({status:"confirmed"})),...Array.from({length:7},()=>({status:"pending",suggestion:"approve"}))]),registration:{state:i===0?"paused":i===1?"closed":"open",message:""}}));
      createRoot(document.getElementById("root")).render(<TrainingWeekCapacity sessions={sessions} registered={103} saveCapacity={async(...args)=>{window.saves.push(args);return{ok:true}}} saveWorkshopState={async(...args)=>{window.saves.push(args);return{ok:true}}}/>);
    ` }, bundle: true, write: false, jsx: "automatic", format: "iife",
  });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.route("https://workshops.test/", route => route.fulfill({ contentType: "text/html", body: `<html lang="en"><head><title>Training Week capacity</title><style>${css.css}</style></head><body><main style="max-width:1400px;margin:auto;padding:24px"><div id="root"></div></main><script src="/app.js"></script></body></html>` }));
    await page.route("https://workshops.test/app.js", route => route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text }));
    await page.route("https://workshops.test/fonts/doto/doto-latin-round.woff2", async route => route.fulfill({ contentType: "font/woff2", body: await readFile("public/fonts/doto/doto-latin-round.woff2") }));
    await page.goto("https://workshops.test/");
    await page.evaluate(()=>document.fonts.ready);
    assert.ok(await page.evaluate(()=>document.fonts.check('800 12px "BHN Dot Matrix"')), "locally hosted matrix typeface loads");
    assert.ok(await page.locator(".training-seat-well :is(dt,dd)").evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).fontFamily.includes("BHN Dot Matrix"))), "all panel labels and counts use matrix lettering");
    assert.ok(await page.locator(".training-seat-well").evaluateAll(nodes=>nodes.every(node=>node.getBoundingClientRect().height<=132)), "desktop panels retain their existing height");
    await expect(page.locator(".workshop-animation")).toHaveCount(6);
    const matrices = await page.locator(".workshop-animation").evaluateAll(nodes=>nodes.map(node=>({mask:getComputedStyle(node).maskImage,size:getComputedStyle(node).maskSize})));
    assert.ok(matrices.length===6 && matrices.every(matrix=>matrix.mask.includes("radial-gradient") && matrix.size==="4px 4px"), "all six workshop graphics use the same fixed dot matrix");
    const chameleon = page.locator('[data-workshop-icon="communication-chameleon"]');
    const well = page.locator(".training-seat-well").nth(2);
    const iconBox = await chameleon.boundingBox(), wellBox = await well.boundingBox();
    assert.ok(iconBox && wellBox && iconBox.width > 90 && iconBox.x >= wellBox.x && iconBox.x + iconBox.width <= wellBox.x + wellBox.width);
    assert.equal(await page.locator(".training-workshop-title svg").count(), 0);
    const before = await chameleon.locator(".workshop-chameleon-skin").evaluate(node => getComputedStyle(node).filter);
    await page.getByRole("button", { name: "Pause dashboard animations" }).click();
    const animations = await page.locator(".workshop-animation").evaluateAll(nodes => nodes.flatMap(node => node.getAnimations({ subtree: true }).map(animation => animation.playState)));
    assert.ok(animations.length >= 10 && animations.every(state => state === "paused"));
    await page.getByRole("button", { name: "Resume dashboard animations" }).click();
    const seek = async (time: number) => chameleon.evaluate((node,time) => node.getAnimations({ subtree: true }).forEach(animation => { animation.pause(); animation.currentTime=time; }),time);
    await seek(9000);
    assert.notEqual(await chameleon.locator(".workshop-chameleon-gaze").evaluate(node => getComputedStyle(node).transform), "matrix(1, 0, 0, 1, 0, 0)");
    await seek(3500);
    await expect(chameleon.locator("[data-chameleon-eye]")).toHaveCount(1);
    assert.ok(await page.locator(".workshop-animation svg").evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).fill==="none")), "all dashboard illustrations use line art");
    for (const part of ["head", "turret-near", "breathe", "tail", "brow"]) {
      assert.notEqual(await chameleon.locator(`.workshop-chameleon-${part}`).evaluate(node => getComputedStyle(node).transform), "matrix(1, 0, 0, 1, 0, 0)", `${part} has a subtle micro-movement`);
    }
    await seek(2600);
    assert.notEqual(await chameleon.locator(".workshop-chameleon-lid-near").evaluate(node => getComputedStyle(node).transform), "matrix(1, 0, 0, 1, 0, 0)", "the single eye winks");
    await seek(9700);
    assert.equal(await chameleon.locator(".workshop-chameleon-tongue").evaluate(node => getComputedStyle(node).transform), "matrix(1, 0, 0, 1, 0, 0)");
    assert.equal(await chameleon.locator(".workshop-chameleon-bug").evaluate(node => getComputedStyle(node).opacity), "1");
    await mkdir("output", { recursive: true });
    await page.screenshot({ path: "output/workshop-icons-catch-desktop.png", fullPage: true });
    await seek(15000);
    assert.notEqual(await chameleon.locator(".workshop-chameleon-skin").evaluate(node => getComputedStyle(node).filter),before);
    assert.equal(await chameleon.locator(".workshop-chameleon-bug").evaluate(node => getComputedStyle(node).opacity), "0");
    const firstControl = page.getByRole("group", { name: "Registration for Microbix tour + Lunch & Learn", exact: true });
    await firstControl.getByRole("button", { name: "Open", exact: true }).click();
    assert.equal(await page.evaluate(()=>(window as any).saves.length),0,"opening the confirmation cannot change registration");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Edit capacity", exact: true }).click();
    await expect(page.getByRole("spinbutton")).toHaveCount(6);
    await page.getByRole("button", { name: "Done editing capacity", exact: true }).click();
    for (const width of [1440,1000,768,390,320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.locator("body").evaluate(node=>node.scrollWidth>window.innerWidth),false,`no overflow at ${width}px`);
      const boxes = await page.locator(".training-seat-well").evaluateAll(nodes=>nodes.map(node=>({width:node.clientWidth,scrollWidth:node.scrollWidth})));
      assert.ok(boxes.every(box=>box.scrollWidth<=box.width),`statistics fit at ${width}px`);
      const sizing = await chameleon.evaluate(node => {
        const panel = node.closest(".training-seat-well")!, row = node.closest(".training-capacity-row")!;
        const eye = node.querySelector(".workshop-chameleon-turret-near")!;
        const compact = { panel: panel.getBoundingClientRect().height, row: row.getBoundingClientRect().height, eye: eye.getBoundingClientRect().width };
        const style = document.createElement("style");
        style.textContent = '.training-seat-well:has([data-workshop-icon="communication-chameleon"]) {grid-template-columns:minmax(72px,30%) minmax(0,1fr)} .workshop-animation[data-workshop-icon="communication-chameleon"] {width:100%!important}';
        document.head.append(style);
        const baseline = { panel: panel.getBoundingClientRect().height, row: row.getBoundingClientRect().height, eye: eye.getBoundingClientRect().width };
        style.remove();
        return { compact, baseline };
      });
      assert.ok(sizing.compact.panel <= sizing.baseline.panel + 1, `black panel is no taller at ${width}px`);
      assert.ok(sizing.compact.row <= sizing.baseline.row + 1, `workshop row is no taller at ${width}px`);
      if (width === 1440) assert.ok(sizing.compact.eye < sizing.baseline.eye * .85, "the line-art chameleon is smaller than the previous enlarged version");
    }
    await page.screenshot({ path: "output/workshop-icons-mobile.png", fullPage: true });
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await chameleon.locator(".workshop-chameleon-tongue").evaluate(node=>getComputedStyle(node).display),"none");
    assert.equal(await chameleon.locator(".workshop-chameleon-bug").evaluate(node=>getComputedStyle(node).display),"none");
    assert.ok((await page.locator(".workshop-animation").evaluateAll(nodes=>nodes.flatMap(node=>node.getAnimations({subtree:true})))).length===0);
    await page.emulateMedia({ forcedColors: "active" });
    assert.ok(await page.locator(".workshop-animation").evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).maskImage==="none")), "high-contrast mode keeps full readable shapes");
    assert.ok(await page.locator(".training-seat-well :is(dt,dd)").evaluateAll(nodes=>nodes.every(node=>!getComputedStyle(node).fontFamily.includes("BHN Dot Matrix"))), "high-contrast mode uses a plain readable typeface");
    console.log("PASS: six large animated icons, eye movement, tongue catch, camouflage, pause/resume, reduced motion, preserved controls and responsive layout");
  } finally { await browser.close(); }
}

void main();
