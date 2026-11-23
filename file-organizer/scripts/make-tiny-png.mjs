#!/usr/bin/env node
/** Generate a tiny valid 1x1 PNG (no external deps). Writes to fixtures/tiny.png */
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dir, "..", "fixtures");
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeB = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.concat([typeB, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcBuf));
  return Buffer.concat([len, typeB, data, crc]);
}

const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(1, 0); // width
ihdr.writeUInt32BE(1, 4); // height
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // RGB
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

// filter byte 0 + R G B
const raw = Buffer.from([0x00, 0xff, 0x00, 0xff]);
const idat = deflateSync(raw);

const png = Buffer.concat([
  signature,
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = join(outDir, "tiny.png");
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
