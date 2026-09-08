import fs from "node:fs";
import { inflateSync } from "node:zlib";

// Reads the PNGs that lib/png.ts writes: 8-bit RGBA, no filter, a single IDAT chunk.
export function readGolden(file: string): Uint8Array {
  const png = fs.readFileSync(file);
  const view = new DataView(png.buffer, png.byteOffset);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const idatLength = view.getUint32(8 + 25);
  const raw = inflateSync(png.subarray(8 + 25 + 8, 8 + 25 + 8 + idatLength));
  const stride = width * 4;
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    out.set(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), y * stride);
  }
  return out;
}
