import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const root = new URL("./", import.meta.url);
const logo = await loadImage(await readFile(new URL("../../public/biohubnet-logo.png", root)));
const glass = await loadImage(await readFile(new URL("graphics/ai-calm-v1.jpg", root)));
const ink = "#182426", teal = "#005e6b", secondary = "#425563";
const panels = [
  {
    number: 1,
    title: ["AI in the Workplace:", "Emerging Skills and", "Workforce Transformation"],
    moderator: { file: "molly-shoichet.jpg", name: "Molly Shoichet", role: "University Professor; BioHubNet Scientific Director", company: "University of Toronto" },
    people: [
      { file: "morgan-cramm.png", name: ["Morgan", "Cramm"], role: "Senior Director Operations", company: "OmniaBio" },
      { file: "dimitrije-jankovic.png", name: ["Dimitrije", "Jankovic"], role: "Global Head of Digital Strategy and Operations", company: "Sanofi", crop: [140, 144, 280, 280] },
      { file: "mona-abu-nameh.png", name: ["Mona Abu", "Nameh"], role: "CMC Regulatory Affairs Manager; Generative AI & Agents Change Management Lead", company: "AstraZeneca", crop: [80, 0, 470, 470] },
      { file: "alice-feng.png", name: ["Alice", "Feng"], role: "Computational Scientist; HQP Representative", company: "BoutIQ Solutions", crop: [100, 60, 420, 420] },
    ],
  },
  {
    number: 2,
    title: ["Expanding Career Horizons:", "Discovering Hidden", "Career Opportunities"],
    moderator: { file: "darius-rackus.jpg", name: "Darius Rackus", role: "Associate Professor; BioHubNet Scientific Co-Director", company: "Toronto Metropolitan University" },
    people: [
      { file: "angela-davoud.png", name: ["Angela", "Davoud"], role: "Co-founder & Chief Growth Officer", company: "PeakR&D" },
      { file: "jasmine-hamilton.png", name: ["Jasmine", "Hamilton"], role: "Senior Advisor", company: "Health Emergency Readiness Canada (ISED)" },
      { file: "sven-ansorge.png", name: ["Sven", "Ansorge"], role: "Director, Technical Training and Innovation", company: "CASTL" },
    ],
  },
  {
    number: 3,
    title: ["Building Biomanufacturing", "Capacity in Canada"],
    moderator: { file: "gilbert-walker.png", name: "Gilbert Walker", role: "Professor; BioHubNet Scientific Co-Director", company: "University of Toronto" },
    people: [
      { file: "geoff-evans.png", name: ["Geoff", "Evans"], role: "President", company: "Eurofins CDMO Alphora Inc." },
      { file: "christopher-panel.jpg", name: ["Christopher", "Procyshyn"], role: "Technology executive and life sciences leader; Former CEO", company: "Vanrx Pharmasystems" },
      // shortcut: no submitted headshot as of October 16; replace the initials when one arrives.
      { initials: "YD", name: ["Yannick", "Dupe"], role: "Head of Site Operational Excellence & Smart Factory", company: "Sanofi" },
    ],
  },
];

for (const panel of panels) {
  const canvas = createCanvas(1200, 1500), ctx = canvas.getContext("2d"), bounds = [];
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 1200, 1500);
  const texture = createCanvas(1200, 1500), tx = texture.getContext("2d");
  // Reuse only the person-free glass edge, never generated portraits or lettering.
  tx.drawImage(glass, 980, 0, 274, 1050, 940, 0, 260, 1372);
  tx.globalCompositeOperation = "destination-in";
  const fade = tx.createLinearGradient(940, 0, 1200, 0);
  fade.addColorStop(0, "rgba(0,0,0,0)"); fade.addColorStop(1, "rgba(0,0,0,0.3)");
  tx.fillStyle = fade; tx.fillRect(940, 0, 260, 1372); ctx.drawImage(texture, 0, 0);
  ctx.drawImage(logo, 72, 56, 390, 390 * logo.height / logo.width);
  bounds.push([72, 56, 390, 390 * logo.height / logo.width, "BioHubNet logo"]);

  function text(value, size, weight, x, baseline, width, color = ink, centered = false) {
    assert.ok(size >= 32, "Do not shrink information to fit");
    ctx.font = `${weight} ${size}px Arial`; ctx.fillStyle = color;
    ctx.textAlign = centered ? "center" : "left";
    const m = ctx.measureText(value);
    assert.ok(m.width <= width, `${value}: ${m.width} > ${width}`);
    bounds.push([centered ? x - m.width / 2 : x, baseline - m.actualBoundingBoxAscent, m.width, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, value]);
    ctx.fillText(value, x, baseline);
  }

  function wrap(value, width, size = 32, weight = 400) {
    ctx.font = `${weight} ${size}px Arial`;
    const lines = [];
    for (const word of value.split(/\s+/)) {
      assert.ok(ctx.measureText(word).width <= width, `${word} exceeds its column`);
      const last = lines.length - 1;
      if (last >= 0 && ctx.measureText(`${lines[last]} ${word}`).width <= width) lines[last] += ` ${word}`;
      else lines.push(word);
    }
    return lines;
  }

  async function portrait(person, x, y, size) {
    const image = await loadImage(await readFile(new URL(`source-assets/${person.file}`, root)));
    const side = Math.min(image.width, image.height);
    const crop = person.crop ?? [(image.width - side) / 2, 0, side, side];
    assert.ok(crop[0] >= 0 && crop[1] >= 0 && crop[0] + crop[2] <= image.width && crop[1] + crop[3] <= image.height);
    const original = createCanvas(size, size), plain = original.getContext("2d");
    plain.drawImage(image, ...crop, 0, 0, size, size);
    ctx.save(); ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.clip();
    ctx.filter = "none"; ctx.globalAlpha = 1; ctx.drawImage(original, x, y); ctx.restore();
    const center = size / 2 - 20;
    assert.deepEqual(ctx.getImageData(x + center, y + center, 40, 40).data, plain.getImageData(center, center, 40, 40).data, `${person.file}: preserve original face pixels`);
    bounds.push([x, y, size, size, person.file]);
  }

  text("2026 Annual Symposium", 70, 700, 72, 240, 1056);
  text(`PANEL ${panel.number}`, 32, 700, 72, 298, 1056, teal);
  panel.title.forEach((line, i) => text(line, 58, 700, 72, 370 + i * 66, 1056, teal));
  await portrait(panel.moderator, 72, 550, 120);
  text("MODERATOR", 32, 700, 224, 575, 904, secondary);
  text(panel.moderator.name, 44, 700, 224, 626, 904);
  text(panel.moderator.role, 32, 400, 224, 670, 904, secondary);
  text(panel.moderator.company, 32, 400, 224, 714, 904, secondary);
  ctx.strokeStyle = "#d5e2e2"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(72, 753); ctx.lineTo(1128, 753); ctx.stroke();

  const gap = 24, width = (1056 - gap * (panel.people.length - 1)) / panel.people.length;
  const photoSize = panel.people.length === 4 ? 152 : 176, photoY = 800, row = [];
  for (const [i, person] of panel.people.entries()) {
    const center = 72 + width / 2 + i * (width + gap);
    row.push(photoY);
    if (person.file) await portrait(person, center - photoSize / 2, photoY, photoSize);
    else {
      ctx.fillStyle = "#edf4f4"; ctx.beginPath(); ctx.arc(center, photoY + photoSize / 2, photoSize / 2, 0, Math.PI * 2); ctx.fill();
      text(person.initials, 54, 700, center, photoY + photoSize / 2 + 18, photoSize, teal, true);
    }
    person.name.forEach((line, j) => text(line, 42, 700, center, 1030 + j * 48, width, ink, true));
    const role = wrap(person.role, width);
    assert.ok(role.length <= 6, `${person.name.join(" ")}: title needs more space`);
    role.forEach((line, j) => text(line, 32, 400, center, 1130 + j * 38, width, secondary, true));
    const company = wrap(person.company, width, 32, 700);
    assert.ok(company.length <= 3, "Organization must fit above the footer");
    const companyY = Math.max(1240, 1130 + (role.length - 1) * 38 + 54);
    company.forEach((line, j) => text(line, 32, 700, center, companyY + j * 38, width, teal, true));
  }
  assert.equal(new Set(row).size, 1, "Every panelist must occupy the same horizontal row");

  ctx.fillStyle = teal; ctx.fillRect(0, 1412, 1200, 88);
  text("October 29 | Toronto", 38, 700, 72, 1469, 570, "#fff");
  text("Register now", 40, 700, 830, 1469, 298, "#fff");
  for (const [x, y, w, h, label] of bounds) assert.ok(x >= 48 && x + w <= 1152 && y >= 32 && y + h <= (y < 1412 ? 1390 : 1485), `${label}: outside safe area`);
  for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) {
    const [x, y, w, h, a] = bounds[i], [xx, yy, ww, hh, b] = bounds[j];
    assert.ok(!(x < xx + ww && x + w > xx && y < yy + hh && y + h > yy), `${a} overlaps ${b}`);
  }
  const output = await canvas.encode("png");
  assert.ok(output.length < 3_000_000, "Fit the platform upload limit");
  const filename = `panel-${panel.number}-photos-titles-row-v1.png`;
  await writeFile(new URL(`graphics/${filename}`, root), output);
  const mobile = createCanvas(360, 450); mobile.getContext("2d").drawImage(canvas, 0, 0, 360, 450);
  await writeFile(new URL(`graphics/${filename.replace(".png", "-360-preview.png")}`, root), await mobile.encode("png"));
  console.log(`${filename}: original face pixels, single row, text fit and no overlap verified (${output.length} bytes)`);
}
