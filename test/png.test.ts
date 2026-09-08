import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { encodePng } from "../lib/png.js";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("encodePng", () => {
  it("writes the PNG signature", () => {
    const png = encodePng(new Uint8Array(2 * 2 * 4), 2, 2);
    expect([...png.subarray(0, 8)]).toEqual(SIGNATURE);
  });

  it("declares the given dimensions in IHDR", () => {
    const png = encodePng(new Uint8Array(3 * 5 * 4), 3, 5);
    const view = new DataView(png.buffer, png.byteOffset);
    expect(view.getUint32(16)).toBe(3);
    expect(view.getUint32(20)).toBe(5);
  });

  it("round-trips pixel data through IDAT", () => {
    const rgba = new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 0, 255,
    ]);
    const png = encodePng(rgba, 2, 2);
    // IDAT starts after signature (8) + IHDR (25); we skip length+type (8) and CRC (4)
    const start = 8 + 25 + 8;
    const length = new DataView(png.buffer, png.byteOffset).getUint32(8 + 25);
    const raw = inflateSync(png.subarray(start, start + length));
    // each row has a filter byte at the beginning (0 = no filter)
    expect([...raw]).toEqual([0, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 255, 255, 255, 255, 0, 255]);
  });

  it("is byte-identical for identical input", () => {
    const rgba = new Uint8Array(4 * 4 * 4).fill(120);
    expect([...encodePng(rgba, 4, 4)]).toEqual([...encodePng(rgba, 4, 4)]);
  });
});
