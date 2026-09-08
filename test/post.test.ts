import { afterAll, describe, expect, it } from "vitest";
import { effect, target, sampler } from "vgpu";
import { disposeGpu, sharedGpu } from "../lib/gpu-server.js";
import { SOFTWARE } from "./helpers/software.js";
import bright from "../shaders/bright.wgsl";
import blur from "../shaders/blur.wgsl";

describe.skipIf(!SOFTWARE)("bloom chain", () => {
  afterAll(async () => { await disposeGpu(); });

  it("keeps only what is above the threshold", async () => {
    const gpu = await sharedGpu();
    const linear = sampler(gpu, { magFilter: "linear", minFilter: "linear" });
    const src = target(gpu, { size: [16, 16], format: "rgba16float" });
    // uniform source at 0.5: below threshold 0.85, nothing should remain
    effect(gpu, `@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
      return vec4f(0.5, 0.5, 0.5, 1.0);
    }`).draw(src);

    const out = target(gpu, { size: [4, 4], format: "rgba8unorm" });
    effect(gpu, bright, { set: { source: src.color, samp: linear, srcTexel: [1 / 16, 1 / 16], threshold: 0.85 } }).draw(out);
    const px = await out.read();
    expect(Math.max(...px.filter((_, i) => i % 4 !== 3))).toBe(0);
  }, 60_000);

  // Without this one, a shader that always returns black passes the test above.
  it("keeps what is above the threshold", async () => {
    const gpu = await sharedGpu();
    const linear = sampler(gpu, { magFilter: "linear", minFilter: "linear" });
    const src = target(gpu, { size: [16, 16], format: "rgba16float" });
    effect(gpu, `@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
      return vec4f(2.0, 2.0, 2.0, 1.0);
    }`).draw(src);

    const out = target(gpu, { size: [4, 4], format: "rgba8unorm" });
    effect(gpu, bright, { set: { source: src.color, samp: linear, srcTexel: [1 / 16, 1 / 16], threshold: 0.85 } }).draw(out);
    const px = await out.read();
    expect(px[0]).toBeGreaterThan(200);
  }, 60_000);

  it("spreads a single bright pixel along the blur axis only", async () => {
    const gpu = await sharedGpu();
    const linear = sampler(gpu, { magFilter: "linear", minFilter: "linear" });
    const src = target(gpu, { size: [32, 32], format: "rgba16float" });
    effect(gpu, `@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
      let hit = step(0.46, uv.x) * step(uv.x, 0.54) * step(0.46, uv.y) * step(uv.y, 0.54);
      return vec4f(vec3f(hit * 4.0), 1.0);
    }`).draw(src);

    const out = target(gpu, { size: [32, 32], format: "rgba8unorm" });
    effect(gpu, blur, { set: { source: src.color, samp: linear, direction: [2 / 32, 0] } }).draw(out);
    const px = await out.read();
    const at = (x: number, y: number) => px[(y * 32 + x) * 4];
    expect(at(22, 16)).toBeGreaterThan(0);   // spread horizontally
    expect(at(16, 22)).toBe(0);              // not vertically
  }, 60_000);
});
