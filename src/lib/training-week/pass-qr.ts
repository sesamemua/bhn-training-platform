/**
 * The pass QR as a picture an email can carry.
 *
 * The pass page draws its QR as SVG, which no mainstream mail client
 * shows, and Gmail strips images written into the message as data. What
 * every client does show is a PNG attached "inline" and referenced from
 * the HTML by its content-id — so the letters that carry a pass link
 * also carry this, and the QR is in the inbox itself: usable on a phone
 * with no signal at the door, with the link still there beneath it.
 *
 * The PNG is written here from the QR's modules — a black-and-white
 * grid needs no image library, just zlib and a checksum.
 *
 * Server-only (node:zlib); no Prisma, no React.
 */
import { deflateSync } from "node:zlib";
import QRCode from "qrcode-svg";
import { passQrContent } from "./check-in";
import { letterHtml, type LetterButton } from "./letter-html";

/** The QR's modules, true = dark. Indexed [x][y], as qrcode-svg lays them out. */
export function qrModules(content: string): boolean[][] {
  return (new QRCode({ content, ecl: "M" }) as unknown as { qrcode: { modules: boolean[][] } }).qrcode.modules;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * A greyscale PNG of a QR: `scale` pixels per module, with the four-
 * module quiet margin scanners need around the code.
 */
export function qrPng(content: string, scale = 8, quiet = 4): Buffer {
  const m = qrModules(content);
  const n = m.length;
  const size = (n + 2 * quiet) * scale;
  // One filter byte (0 = none) then one grey byte per pixel, per row.
  const raw = Buffer.alloc((size + 1) * size, 255);
  for (let row = 0; row < size; row++) {
    raw[row * (size + 1)] = 0;
    const y = Math.floor(row / scale) - quiet;
    if (y < 0 || y >= n) continue;
    for (let col = 0; col < size; col++) {
      const x = Math.floor(col / scale) - quiet;
      if (x >= 0 && x < n && m[x][y]) raw[row * (size + 1) + 1 + col] = 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** The content-id the HTML points at. */
export const PASS_QR_CID = "training-week-pass-qr";

/**
 * A letter's HTML, made from its text, with the pass QR placed right
 * under the line that carries the pass link — and the PNG to attach.
 *
 * The text stays exactly what it was, and is sent alongside: a client
 * that shows plain text still gets the link. Null when the letter has
 * no pass link in it, so nothing is added to letters that are not
 * about getting through a door.
 */
export function withPassQr(text: string, passLink: string, token: string, buttons: LetterButton[] = []): {
  html: string;
  attachment: { filename: string; content: Buffer; contentType: string; cid: string };
} | null {
  /*
   * The pass link itself — not a longer link that starts with it. The
   * "I can't make it" link is the pass link plus a path, and matching on
   * "contains" put a second QR under that one.
   */
  const exact = new RegExp(`${passLink.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w/-])`);
  if (!exact.test(text)) return null;
  let placed = false;
  const html = letterHtml(text, buttons, (line) => {
    if (placed || !exact.test(line)) return "";
    placed = true;
    return (
      `<br><img src="cid:${PASS_QR_CID}" width="220" height="220" alt="Your Training Week pass QR code" ` +
      `style="display:block;margin:12px 0 4px;border:1px solid #e5e7eb;border-radius:8px">`
    );
  });
  return {
    html,
    attachment: { filename: "training-week-pass.png", content: qrPng(passQrContent(token)), contentType: "image/png", cid: PASS_QR_CID },
  };
}
