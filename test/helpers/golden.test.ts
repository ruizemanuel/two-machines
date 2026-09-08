import { describe, expect, it } from "vitest";
import { goldenPath, compare } from "./golden";

describe("golden helper", () => {
  it("puts the Mesa version in the filename", () => {
    expect(goldenPath("coin-frozen")).toMatch(/coin-frozen@mesa-25\.0\.7\.png$/);
  });

  it("reports zero differing pixels for identical buffers", () => {
    const a = new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]);
    expect(compare(a, a.slice())).toBe(0);
  });

  it("counts differing pixels, not bytes", () => {
    const a = new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]);
    const b = new Uint8Array([9, 9, 9, 255, 4, 5, 6, 255]);
    expect(compare(a, b)).toBe(1);
  });

  it("reports Infinity when the buffers are different sizes", () => {
    // expectGolden leans on this: Infinity !== 0, so a size mismatch throws instead
    // of quietly comparing whatever the two buffers happen to have in common.
    expect(compare(new Uint8Array(8), new Uint8Array(4))).toBe(Infinity);
  });
});
