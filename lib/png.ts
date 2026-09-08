import { deflateSync } from "node:zlib";

const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

/** 8-bit RGBA, no filter. Deterministic output: same bytes for same input. */
export function encodePng(rgba: Uint8Array, width: number, height: number): Uint8Array {
  // Target.read() returns bytes in the target's own format, and rgba8unorm,
  // rgba16float and r16float targets all coexist here. Without this guard,
  // passing the wrong target's read does not fail: it truncates, zeroes the
  // rest, and writes a PNG that looks fine. That is how a golden image gets
  // poisoned silently.
  const expected = width * height * 4;
  if (rgba.length !== expected) {
    throw new RangeError(
      `encodePng: expected ${expected} bytes for ${width}x${height} RGBA, got ${rgba.length}`,
    );
  }

  const ihdr = new Uint8Array(13);
  const head = new DataView(ihdr.buffer);
  head.setUint32(0, width);
  head.setUint32(4, height);
  ihdr[8] = 8;    // bits per channel
  ihdr[9] = 6;    // RGBA color
  // 10..12 remain 0: deflate, standard filter, no interlacing

  const stride = width * 4;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;   // filter byte per row
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const idat = new Uint8Array(deflateSync(raw, { level: 9 }));
  const parts = [SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { png.set(p, at); at += p.length; }
  return png;
}
