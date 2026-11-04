import type { LinkedinTestimonial } from "./linkedin";
import { LINKEDIN_FEEDBACK_URL } from "./linkedin-feedback-copy";

export async function captureFeedbackCard(quote: LinkedinTestimonial) {
  const card = Array.from(document.querySelectorAll<HTMLElement>("[data-feedback-source]")).find(el => el.dataset.feedbackSource === quote.sourceUrl);
  if (!card) throw new Error("This card is unavailable. Reload the page and try again.");
  await document.fonts.ready;
  for (const img of card.querySelectorAll<HTMLImageElement>("img")) {
    img.loading = "eager";
    try { await img.decode(); } catch { throw new Error(`The photo for ${quote.author} has not loaded. Reload and try again.`); }
  }
  if (quote.profile?.photoUrl && !card.querySelector("img")) throw new Error(`The photo for ${quote.author} is unavailable. Reload and try again.`);
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(card, {
    scale: 2, useCORS: true, allowTaint: false, logging: false, backgroundColor: null,
    onclone: (_doc, clone) => {
      // html2canvas predates CSS4 colors and object-fit; resolve those without changing the live card.
      const pixel = document.createElement("canvas"); pixel.width = pixel.height = 1;
      const ctx = pixel.getContext("2d", { willReadFrequently: true })!;
      const colors = new Map<string, string>();
      for (const el of [clone, ...clone.querySelectorAll<HTMLElement | SVGElement>("*")]) {
        const style = getComputedStyle(el);
        for (const property of ["color", "background-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "text-decoration-color", "fill", "stroke"]) {
          const color = style.getPropertyValue(property);
          if (!color || color === "none") continue;
          if (!colors.has(color)) {
            ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
            colors.set(color, `rgba(${r},${g},${b},${a / 255})`);
          }
          el.style.setProperty(property, colors.get(color)!);
        }
        if (el.tagName === "IMG" && style.objectFit === "contain") {
          const img = el as HTMLImageElement;
          const scale = Math.min(img.width / img.naturalWidth, img.height / img.naturalHeight);
          img.style.width = `${img.naturalWidth * scale}px`; img.style.height = `${img.naturalHeight * scale}px`;
        }
      }
    },
  });
  const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Card image could not be created.")), "image/png"));
  return { png, width: canvas.width / 2, height: canvas.height / 2, dataUrl: canvas.toDataURL("image/png") };
}

export async function feedbackCardHtml(quote: LinkedinTestimonial, capture: ReturnType<typeof captureFeedbackCard>) {
  const card = await capture;
  const source = quote.sourceUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return new Blob([`<p><img src="${card.dataUrl}" width="${Math.round(card.width)}" height="${Math.round(card.height)}" alt="BioHubNet community reflection"></p><p><a href="${source}">Original LinkedIn ${quote.kind === "comment" ? "comment" : "post"}</a> · <a href="${LINKEDIN_FEEDBACK_URL}">BioHubNet community reflections</a></p>`], { type: "text/html" });
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
