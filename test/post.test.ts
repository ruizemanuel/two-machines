import { afterAll, describe, expect, it } from "vitest";
import { effect, target, sampler } from "vgpu";
import { disposeGpu, sharedGpu } from "../lib/gpu-server";
import { SOFTWARE } from "./helpers/software";
import bright from "../shaders/bright.wgsl";
import blur from "../shaders/blur.wgsl";
import post from "../shaders/post.wgsl";

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

  // The two threshold tests above use a spatially uniform source, so they cannot
  // tell a real box of four offset taps from one point sampled four times. This
  // one can: srcTexel is a whole texel here, chosen so all four taps land exactly
  // on a texel centre rather than on a boundary where linear filtering would be
  // ambiguous. Only one of the four reaches the single bright texel, so the sum
  // must come back quartered.
  it("averages four offset taps, not one point four times", async () => {
    const gpu = await sharedGpu();
    const linear = sampler(gpu, { magFilter: "linear", minFilter: "linear" });
    const src = target(gpu, { size: [16, 16], format: "rgba16float" });
    // Exactly texel (8,8): its centre is 0.53125, and its neighbours at 0.46875
    // and 0.59375 both fall outside the band.
    effect(gpu, `@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
      let hit = step(0.5, uv.x) * step(uv.x, 0.5625) * step(0.5, uv.y) * step(uv.y, 0.5625);
      return vec4f(vec3f(hit * 4.0), 1.0);
    }`).draw(src);

    const out = target(gpu, { size: [16, 16], format: "rgba8unorm" });
    effect(gpu, bright, { set: { source: src.color, samp: linear, srcTexel: [2 / 16, 2 / 16], threshold: 0.85 } }).draw(out);
    const px = await out.read();
    const at = (x: number, y: number) => px[(y * 16 + x) * 4];

    // Taps (6,6) (8,6) (6,8) (8,8): one of four is bright, so 4.0/4 - 0.85 = 0.15,
    // which is 38 of 255. Sampling the centre alone would read texel 7 and give 0;
    // forgetting the quarter would give 3.15 and saturate at 255.
    expect(at(7, 7)).toBeGreaterThan(25);
    expect(at(7, 7)).toBeLessThan(55);
    // Taps (5,5) (7,5) (5,7) (7,7): the bright texel is out of reach.
    expect(at(6, 6)).toBe(0);
  }, 60_000);

  // post.wgsl is otherwise pinned only by Task 10's golden, which does not exist
  // yet and cannot say which stage broke when it moves. This holds the tonemap and
  // the vignette on their own.
  it("compresses the exposure curve and darkens the corners", async () => {
    const gpu = await sharedGpu();
    const linear = sampler(gpu, { magFilter: "linear", minFilter: "linear" });
    const scene = target(gpu, { size: [8, 8], format: "rgba16float" });
    const bloom = target(gpu, { size: [8, 8], format: "rgba16float" });
    effect(gpu, `@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
      return vec4f(1.0, 1.0, 1.0, 1.0);
    }`).draw(scene);
    effect(gpu, `@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
      return vec4f(0.0, 0.0, 0.0, 1.0);
    }`).draw(bloom);

    const out = target(gpu, { size: [8, 8], format: "rgba8unorm" });
    effect(gpu, post, {
      set: {
        scene: scene.color, bloom: bloom.color, samp: linear,
        res: [8, 8], grain: 0, exposure: 0.55, bloomIntensity: 0.85,
      },
    }).draw(out);
    const px = await out.read();
    const at = (x: number, y: number) => px[(y * 8 + x) * 4];

    // pow(1 - exp(-1.0 * 0.55), 0.94) = 0.4455, so 114 of 255, give or take the
    // grain's 3. Without the tonemap a linear 1.0 would come back as 255.
    expect(at(4, 4)).toBeGreaterThan(100);
    expect(at(4, 4)).toBeLessThan(128);
    // The vignette reaches 0.785 at the corner: 89 against the centre's 114.
    expect(at(0, 0)).toBeLessThan(at(4, 4) - 15);
  }, 60_000);
});
