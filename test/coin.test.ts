// test/coin.test.ts
import { afterAll, describe, expect, it } from "vitest";
import { effect, target, sampler } from "vgpu";
import { disposeGpu, sharedGpu } from "../lib/gpu-server";
import { expectGolden } from "./helpers/golden";
import { SOFTWARE } from "./helpers/software";
import relief from "../shaders/relief.wgsl";
import coin from "../shaders/coin.wgsl";
import { serialToWords } from "../lib/coin/serial";

const [hi, lo] = serialToWords("5de3f2beb643864b");
const SERIAL = { serial_hi: hi, serial_lo: lo, serial_on: 1 };

async function renderCoin(melt: number, w = 480, h = 360) {
  const gpu = await sharedGpu();
  // vgpu has no default sampler: an effect that declares one and never receives
  // it fails with VGPU-R1-BINDING-NEVER-SET. sampler() is cached, so the bind
  // group identity stays stable across frames.
  const linear = sampler(gpu, {
    magFilter: "linear", minFilter: "linear",
    addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge",
  });
  const reliefTarget = target(gpu, { size: [512, 512], format: "r16float" });
  effect(gpu, relief, { set: SERIAL }).draw(reliefTarget);
  const out = target(gpu, { size: [w, h], format: "rgba8unorm" });
  effect(gpu, coin, {
    set: {
      res: [w, h], mouse: [0, 0], time: 0,
      melt, flash: 0, spin: 0, press: 0,
      relief: reliefTarget.color, samp: linear,
    },
  }).draw(out);
  return { pixels: await out.read(), adapter: gpu.adapter };
}

describe.skipIf(!SOFTWARE)("coin pass", () => {
  afterAll(async () => { await disposeGpu(); });

  it("matches the golden struck coin", async () => {
    const { pixels, adapter } = await renderCoin(0);
    await expectGolden("coin-frozen", pixels, 480, 360, adapter);
  }, 90_000);

  it("matches the golden molten coin", async () => {
    const { pixels, adapter } = await renderCoin(1);
    await expectGolden("coin-molten", pixels, 480, 360, adapter);
  }, 90_000);

  it("is brighter overall when molten, because the metal emits", async () => {
    const sum = (px: Uint8Array) => px.reduce((n, v, i) => (i % 4 === 3 ? n : n + v), 0);
    expect(sum((await renderCoin(1)).pixels)).toBeGreaterThan(sum((await renderCoin(0)).pixels));
  }, 120_000);
});
