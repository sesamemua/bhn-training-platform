import type { LinkedinTestimonial } from "./linkedin";
import { LINKEDIN_FEEDBACK_URL } from "./linkedin-feedback-copy";

const inlineAssets = new Map<string, Promise<string>>();
function inlineAsset(url: string) {
  if (!inlineAssets.has(url)) inlineAssets.set(url, (async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("An image or font could not be loaded. Reload and try again.");
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob);
    });
  })().catch(error => { inlineAssets.delete(url); throw error; }));
  return inlineAssets.get(url)!;
}

export async function captureFeedbackCard(quote: LinkedinTestimonial) {
  const card = Array.from(document.querySelectorAll<HTMLElement>("[data-feedback-source]")).find(el => el.dataset.feedbackSource === quote.sourceUrl);
  if (!card) throw new Error("This card is unavailable. Reload the page and try again.");
  await document.fonts.ready;
  await Promise.all(card.getAnimations({ subtree: true }).filter(animation => Number.isFinite(animation.effect?.getTiming().iterations)).map(animation => animation.finished.catch(() => undefined)));
  for (const img of card.querySelectorAll<HTMLImageElement>("img")) {
    img.loading = "eager";
    try { await img.decode(); } catch { throw new Error(`The photo for ${quote.author} has not loaded. Reload and try again.`); }
  }
  if (quote.profile?.photoUrl && !card.querySelector('img[alt$="profile image"]')) throw new Error(`The photo for ${quote.author} is unavailable. Reload and try again.`);
  // Let the browser shape text with its original fonts; canvas word-by-word painting changes spacing.
  const clone = card.cloneNode(true) as HTMLElement;
  const originals = [card, ...card.querySelectorAll<HTMLElement | SVGElement>("*")];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement | SVGElement>("*")];
  const families = new Set<string>();
  for (let i = 0; i < originals.length; i++) {
    const style = getComputedStyle(originals[i]);
    for (const property of style) copies[i].style.setProperty(property, style.getPropertyValue(property));
    copies[i].style.transition = "none"; copies[i].style.animation = "none";
    families.add(style.fontFamily);
    if (originals[i].tagName === "IMG") {
      const image = originals[i] as HTMLImageElement, copy = copies[i] as HTMLImageElement;
      copy.removeAttribute("srcset"); copy.src = await inlineAsset(image.currentSrc || image.src); copy.loading = "eager";
    }
  }
  clone.querySelectorAll("[data-html2canvas-ignore]").forEach(el => el.remove());
  const fonts: string[] = [];
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of rules) {
      if (!(rule instanceof CSSFontFaceRule) || ![...families].some(family => family.includes(rule.style.fontFamily.replace(/["']/g, "")))) continue;
      let css = rule.cssText;
      for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) css = css.replace(match[0], `url("${await inlineAsset(new URL(match[1], sheet.href || location.href).href)}")`);
      fonts.push(css);
    }
  }
  const fontStyle = document.createElement("style"); fontStyle.textContent = fonts.join("\n"); clone.prepend(fontStyle);
  const { width, height } = card.getBoundingClientRect();
  Object.assign(clone.style, { width: `${width}px`, height: `${height}px`, margin: "0", transform: "none" });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width * 2)}" height="${Math.ceil(height * 2)}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(clone)}</foreignObject></svg>`;
  const image = new Image(); image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; await image.decode();
  const canvas = document.createElement("canvas"); canvas.width = Math.ceil(width * 2); canvas.height = Math.ceil(height * 2);
  canvas.getContext("2d")!.drawImage(image, 0, 0);
  const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Card image could not be created.")), "image/png"));
  return { png, width: canvas.width / 2, height: canvas.height / 2, dataUrl: canvas.toDataURL("image/png") };
}

export async function feedbackCardHtml(quote: LinkedinTestimonial, capture: ReturnType<typeof captureFeedbackCard>) {
  const card = await capture;
  const source = quote.sourceUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const scale = Math.min(1, 624 / card.width, 790 / card.height);
  return new Blob([`<p><img src="${card.dataUrl}" width="${Math.round(card.width * scale)}" height="${Math.round(card.height * scale)}" alt="BioHubNet community reflection"></p><p><a href="${source}">Original LinkedIn ${quote.kind === "comment" ? "comment" : "post"}</a> · <a href="${LINKEDIN_FEEDBACK_URL}">BioHubNet community reflections</a></p>`], { type: "text/html" });
}

export async function feedbackCardsHtml(quotes: LinkedinTestimonial[]) {
  const cards: string[] = [];
  for (const quote of quotes) cards.push(await (await feedbackCardHtml(quote, captureFeedbackCard(quote))).text());
  return new Blob([cards.join("\n")], { type: "text/html" });
}

export async function downloadFeedbackWord(quotes: LinkedinTestimonial[]) {
  const { Document, Packer, Paragraph, ImageRun, ExternalHyperlink, TextRun } = await import("docx");
  const children = [new Paragraph({ text: "BioHubNet community reflections", heading: "Heading1" }), new Paragraph({ children: [new ExternalHyperlink({ link: LINKEDIN_FEEDBACK_URL, children: [new TextRun({ text: LINKEDIN_FEEDBACK_URL, style: "Hyperlink" })] })], spacing: { after: 240 } })];
  for (const quote of quotes) {
    const card = await captureFeedbackCard(quote);
    const scale = Math.min(1, 624 / card.width, 790 / card.height);
    children.push(new Paragraph({ keepNext: true, children: [new ImageRun({ type: "png", data: new Uint8Array(await card.png.arrayBuffer()), transformation: { width: Math.round(card.width * scale), height: Math.round(card.height * scale) }, altText: { title: quote.author, description: quote.quote, name: quote.author } })] }));
    children.push(new Paragraph({ children: [new ExternalHyperlink({ link: quote.sourceUrl, children: [new TextRun({ text: `${quote.author} - original LinkedIn ${quote.kind === "comment" ? "comment" : "post"}`, style: "Hyperlink" })] })], spacing: { after: 240 } }));
  }
  const blob = await Packer.toBlob(new Document({ creator: "BioHubNet", title: "2026 Symposium & Training Week - Community Reflections", sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } }, children }] }));
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = "BioHubNet-2026-community-reflections.docx"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
