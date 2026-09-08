import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import { target } from "vgpu";
import { disposeGpu, sharedGpu } from "../lib/gpu-server.js";
import { createScene } from "../lib/coin/scene.js";
import { INITIAL } from "../lib/coin/state.js";
import { expectGolden } from "./helpers/golden.js";
import { SOFTWARE } from "./helpers/software.js";

// Deliberately outside the skipIf block: this one is a text search over a source
// file, it needs no GPU, and it is the guard on the constraint that makes the
// whole project possible. It has to run on every machine, every time.
describe("scene boundary", () => {
  it("never references the DOM", () => {
    const src = fs.readFileSync("lib/coin/scene.ts", "utf8");
    for (const forbidden of ["window", "document", "navigator", "Date.now", "requestAnimationFrame"]) {
      expect(src).not.toContain(forbidden);
    }
  });
});

describe.skipIf(!SOFTWARE)("scene render", () => {
  afterAll(async () => { await disposeGpu(); });

  it("renders a full frame offscreen", async () => {
    const gpu = await sharedGpu();
    const out = target(gpu, { size: [480, 360], format: "rgba8unorm" });
    const scene = createScene(gpu, 480, 360);
    scene.setSerial("5de3f2beb643864b");
    scene.render(out, { ...INITIAL, melt: 0, spin: 0, time: 0 });
    await expectGolden("scene-frozen", await out.read(), 480, 360, gpu.adapter);
  }, 90_000);
});
