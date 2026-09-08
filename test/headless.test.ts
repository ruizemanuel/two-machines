import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { effect, type Gpu, type Target } from "vgpu";
import { disposeGpu, renderHeadless } from "../lib/gpu-server";
import { SOFTWARE } from "./helpers/software";
import gradient from "../shaders/gradient.wgsl";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
// Named and typed on purpose: an inline arrow gets no contextual type where it is
// stored in a const first, and lands as an implicit any under strict.
const drawGradient = (gpu: Gpu, t: Target) => { effect(gpu, gradient).draw(t); };

describe.skipIf(!SOFTWARE)("headless render", () => {
  // Dawn keeps polling the device until it is disposed, and a vitest worker that
  // owns a live device never exits. Every GPU suite in this plan closes with this.
  afterAll(async () => { await disposeGpu(); });

  it("renders a gradient offscreen and reads back pixels", async () => {
    const px = await renderHeadless(drawGradient, 64, 64);
    expect(px.length).toBe(64 * 64 * 4);
    // the gradient's bottom-left corner is not black
    expect(px[0] + px[1] + px[2]).toBeGreaterThan(0);
  }, 60_000);

  it("is bit-identical across runs on the same renderer", async () => {
    const a = await renderHeadless(drawGradient, 32, 32);
    const b = await renderHeadless(drawGradient, 32, 32);
    expect(sha(a)).toBe(sha(b));
  }, 60_000);
});
