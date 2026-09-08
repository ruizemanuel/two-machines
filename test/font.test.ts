import { afterAll, describe, expect, it } from "vitest";
import { effect } from "vgpu";
import { disposeGpu, renderHeadless, sharedGpu } from "../lib/gpu-server";
import { expectGolden } from "./helpers/golden";
import { SOFTWARE } from "./helpers/software";
import probe from "../shaders/text-probe.wgsl";
import tProbe from "../shaders/t-probe.wgsl";

describe.skipIf(!SOFTWARE)("bitmap font", () => {
  afterAll(async () => { await disposeGpu(); });

  // Orientation is pinned by arithmetic, not by looking at a picture. The top
  // row of "T" is its full bar; the bottom row is a single centre pixel.
  it("puts the bar of T at the top, not the bottom", async () => {
    const px = await renderHeadless((gpu, t) => { effect(gpu, tProbe).draw(t); }, 70, 98);
    const lit = (x: number, y: number) => px[(y * 70 + x) * 4] > 127;
    expect(lit(7, 7)).toBe(true);     // left end of the top bar
    expect(lit(62, 7)).toBe(true);    // right end of the top bar
    expect(lit(7, 91)).toBe(false);   // bottom row is empty at the edges
    expect(lit(35, 91)).toBe(true);   // but lit in the middle: the stem
  }, 60_000);

  it("renders VGPU.SH 0123456789 legibly", async () => {
    const gpu = await sharedGpu();
    const px = await renderHeadless((g, t) => { effect(g, probe).draw(t); }, 256, 64);
    await expectGolden("font-probe", px, 256, 64, gpu.adapter);
  }, 60_000);
});
