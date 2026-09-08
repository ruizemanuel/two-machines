import { describe, expect, it } from "vitest";
import { crc32, inflateSync } from "node:zlib";
import { encodePng } from "../lib/png";

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

  it("rejects a buffer that is not width * height * 4", () => {
    // The mistake this catches: Target.read() returns bytes in the target's own
    // format, and this project has rgba16float and r16float targets next to the
    // rgba8unorm ones. Encoding an 8-bytes-per-pixel read as RGBA8 would write a
    // plausible-looking, wrong PNG instead of failing.
    expect(() => encodePng(new Uint8Array(2 * 2 * 8), 2, 2)).toThrow(RangeError);
  });

  it("writes CRCs that an independent implementation agrees with", () => {
    // Every other test in this file reads around the CRC fields, so a wrong byte
    // range or a dropped final XOR in crc32() would pass all of them. zlib.crc32
    // is Node's own implementation: an oracle this module does not share code with.
    const png = encodePng(new Uint8Array(2 * 2 * 4), 2, 2);
    const view = new DataView(png.buffer, png.byteOffset);
    // IHDR: length 8..11, type+data 12..28, CRC at 29
    expect(view.getUint32(29)).toBe(crc32(png.subarray(12, 29)));
    // and IEND, an empty chunk, has the well-known constant for its CRC
    expect(view.getUint32(png.length - 4)).toBe(0xae426082);
  });
});
