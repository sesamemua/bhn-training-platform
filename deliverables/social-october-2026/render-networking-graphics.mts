import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { NETWORKING_GROUPS } from "../../src/lib/social/symposium-networking-posts";

const feed = await (await fetch("https://bhn-training-platform.vercel.app/api/public/events/2026-annual-symposium/people")).json();
const eligible = feed.people.filter((p: { placements: { sessionId: string }[] }) => p.placements.some((s) => s.sessionId === "networking"));
assert.deepEqual(
  NETWORKING_GROUPS.flatMap((g) => g.people.map((p) => p.name)).sort(),
  eligible.map((p: { fullName: string }) => p.fullName).sort(),
  "Networking drafts must cover the current published roster exactly once",
);
const output = "public/social/symposium-2026";
await mkdir(output, { recursive: true });
await mkdir("deliverables/social-october-2026/networking-originals", { recursive: true });
const logo = await loadImage(await readFile("public/biohubnet-logo.png"));
const glass = await loadImage(await readFile("deliverables/social-october-2026/graphics/ai-calm-v1.jpg"));
for (const group of NETWORKING_GROUPS) {
  const canvas = createCanvas(1200, 1500), ctx = canvas.getContext("2d");
  const bounds: [number, number, number, number, string][] = [];
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1200, 1500);
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.drawImage(glass, 980, 0, 274, 1050, 1040, 0, 160, 1400);
  ctx.restore();
  ctx.drawImage(logo, 72, 56, 380, 380 * logo.height / logo.width);
  function text(value: string, size: number, weight: number, x: number, y: number, width: number, color = "#142a31", center = false) {
    ctx.font = `${weight} ${size}px Arial`;
    ctx.fillStyle = color; ctx.textAlign = center ? "center" : "left";
    const m = ctx.measureText(value);
    assert.ok(m.width <= width, `${value} exceeds column`);
    bounds.push([center ? x - m.width / 2 : x, y - m.actualBoundingBoxAscent, m.width, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, value]);
    ctx.fillText(value, x, y);
  }
  function wrap(value: string, width: number, size: number) {
    ctx.font = `700 ${size}px Arial`;
    const lines: string[] = [];
    for (const word of value.split(/\s+/)) {
      const last = lines.length - 1;
      if (last >= 0 && ctx.measureText(`${lines[last]} ${word}`).width <= width) lines[last] += ` ${word}`;
      else lines.push(word);
    }
    return lines;
  }
  text("2026 Annual Symposium", 68, 700, 72, 239, 1056);
  text("Structured Networking", 72, 700, 72, 353, 1056, "#005e6b");
  text("with Industry", 72, 700, 72, 433, 1056, "#005e6b");
  text("Professionals", 72, 700, 72, 513, 1056, "#005e6b");
  text(`MEET THE PROFESSIONALS  ${group.number}/4`, 32, 700, 72, 587, 1056, "#455b65");
  const gap = 24, width = (1056 - gap * (group.people.length - 1)) / group.people.length;
  const size = group.people.length === 4 ? 220 : 264;
  for (const [i, person] of group.people.entries()) {
    const row = eligible.find((p: { fullName: string }) => p.fullName === person.name);
    assert.ok(row?.photoUrl, `${person.name} must be currently published with a headshot`);
    const response = await fetch(row.photoUrl);
    assert.ok(response.ok);
    const original = Buffer.from(await response.arrayBuffer());
    await writeFile(`deliverables/social-october-2026/networking-originals/${person.name.toLowerCase().replace(/[^a-z]+/g, "-")}.png`, original, { flag: "wx" })
      .catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
    const image = await loadImage(original);
    const x = 72 + i * (width + gap), center = x + width / 2, y = 660;
    const side = Math.min(image.width, image.height);
    const scaled = createCanvas(size, size), plain = scaled.getContext("2d");
    plain.drawImage(image, (image.width - side) / 2, 0, side, side, 0, 0, size, size);
    ctx.save(); ctx.beginPath(); ctx.arc(center, y + size / 2, size / 2, 0, Math.PI * 2); ctx.clip();
    ctx.filter = "none"; ctx.globalAlpha = 1; ctx.drawImage(scaled, center - size / 2, y); ctx.restore();
    const offset = Math.floor(size / 2) - 16;
    assert.deepEqual(ctx.getImageData(center - size / 2 + offset, y + offset, 32, 32).data, plain.getImageData(offset, offset, 32, 32).data, "Original face pixels must not change");
    bounds.push([center - size / 2, y, size, size, person.name + " portrait"]);
    const names = wrap(person.name, width, 44);
    assert.ok(names.length <= 2);
    names.forEach((line, n) => text(line, 44, 700, center, 991 + n * 52, width, "#142a31", true));
    const companies = wrap(person.graphicCompany, width, 32);
    assert.ok(companies.length <= 4);
    companies.forEach((line, n) => text(line, 32, 700, center, 1100 + n * 39, width, "#005e6b", true));
  }
  text("October 29 | Chelsea Hotel, Toronto", 40, 700, 72, 1300, 1056);
  text("3:30-4:45 p.m. ET", 36, 400, 72, 1354, 1056, "#455b65");
  ctx.fillStyle = "#005e6b"; ctx.fillRect(0, 1412, 1200, 88);
  text("Register by October 23", 42, 700, 72, 1470, 1056, "#ffffff");
  for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) {
    const [x, y, w, h, label] = bounds[i], [xx, yy, ww, hh, other] = bounds[j];
    assert.ok(!(x < xx + ww && x + w > xx && y < yy + hh && y + h > yy), `${label} overlaps ${other}`);
  }
  const png = await canvas.encode("png");
  assert.ok(png.length < 3_000_000);
  await writeFile(`${output}/networking-${group.number}.png`, png);
  const preview = createCanvas(360, 450);
  preview.getContext("2d").drawImage(canvas, 0, 0, 360, 450);
  await writeFile(`deliverables/social-october-2026/graphics/networking-${group.number}-preview.png`, await preview.encode("png"));
  console.log(`Networking ${group.number}: ${group.people.length} original headshots; no overlaps; ${png.length} bytes`);
}
