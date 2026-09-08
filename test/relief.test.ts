// test/relief.test.ts
import { afterAll, describe, expect, it } from "vitest";
import { effect } from "vgpu";
import { disposeGpu, renderHeadless, sharedGpu } from "../lib/gpu-server.js";
import { expectGolden } from "./helpers/golden.js";
import { SOFTWARE } from "./helpers/software.js";
import relief from "../shaders/relief.wgsl";

// 5de3f2be b643864b, as two words. Literals on purpose: this task must not
// depend on lib/coin/serial.ts, which arrives in Task 7.
const STRUCK = { serial_hi: 0x5de3f2be, serial_lo: 0xb643864b, serial_on: 1 };

describe.skipIf(!SOFTWARE)("relief pass", () => {
  afterAll(async () => { await disposeGpu(); });

  it("matches the golden coin face", async () => {
    const gpu = await sharedGpu();
    const px = await renderHeadless(
      (g, t) => { effect(g, relief, { set: STRUCK }).draw(t); },
      512, 512,
    );
    await expectGolden("relief", px, 512, 512, gpu.adapter);
  }, 60_000);

  it("leaves the serial off the face while molten", async () => {
    const withSerial = await renderHeadless(
      (g, t) => { effect(g, relief, { set: STRUCK }).draw(t); }, 512, 512);
    const without = await renderHeadless(
      (g, t) => { effect(g, relief, { set: { ...STRUCK, serial_on: 0 } }).draw(t); }, 512, 512);
    const sum = (px: Uint8Array) => px.reduce((n, v, i) => (i % 4 === 0 ? n + v : n), 0);
    expect(sum(withSerial)).toBeGreaterThan(sum(without));
  }, 90_000);

  // Pins the placement that the mockup had right and a rewrite gets wrong: with
  // vec2f(sin, cos) the stars land top and bottom, and the bottom one sits on the
  // exact centre of the VGPU.SH legend, at the same 0.385 radius.
  it("puts the separator stars left and right, clear of the legend", async () => {
    const px = await renderHeadless(
      (g, t) => { effect(g, relief, { set: STRUCK }).draw(t); }, 512, 512);
    const at = (x: number, y: number) => px[(y * 512 + x) * 4];
    expect(at(453, 256)).toBeGreaterThan(160);   // star on the +x axis
    expect(at(59, 256)).toBeGreaterThan(160);    // star on the -x axis
  }, 60_000);

  it("puts the triangle apex higher than the field", async () => {
    const px = await renderHeadless(
      (g, t) => { effect(g, relief, { set: STRUCK }).draw(t); },
      512, 512,
    );
    const at = (x: number, y: number) => px[(y * 512 + x) * 4];
    const apex = at(256, 230);        // within the triangle
    const field = at(256, 430);       // flat field
    const outside = at(8, 8);         // outside the disk
    expect(apex).toBeGreaterThan(field);
    expect(field).toBeGreaterThan(outside);
  }, 60_000);
});
