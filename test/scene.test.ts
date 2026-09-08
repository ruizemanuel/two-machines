import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import { target } from "vgpu";
import { disposeGpu, sharedGpu } from "../lib/gpu-server";
import { createScene } from "../lib/coin/scene";
import { INITIAL } from "../lib/coin/state";
import { expectGolden } from "./helpers/golden";
import { SOFTWARE } from "./helpers/software";

// Deliberately outside the skipIf block: this one is a text search over a source
// file, it needs no GPU, and it is the guard on the constraint that makes the
// whole project possible. It has to run on every machine, every time.
describe("scene boundary", () => {
  // Word boundaries, not substrings. The substring form was wrong in both
  // directions: it tripped on an innocent "documentation" in a comment, and it
  // let `performance.now()` through — a real clock, in Node and in the browser
  // alike. Every entry below names something that either reaches the page or
  // starts a clock of its own, and either one breaks the server render.
  const FORBIDDEN = [
    /\bwindow\b/, /\bdocument\b/, /\bnavigator\b/, /\blocalStorage\b/,
    /\brequestAnimationFrame\b/, /\bsetTimeout\b/, /\bsetInterval\b/,
    /\bDate\s*\.\s*now\b/, /\bnew\s+Date\b/, /\bperformance\s*\.\s*now\b/,
  ];

  it("never reaches the page or starts a clock of its own", () => {
    const src = fs.readFileSync("lib/coin/scene.ts", "utf8");
    // Collect rather than assert one by one, so a failure names the offender.
    expect(FORBIDDEN.filter((pattern) => pattern.test(src)).map(String)).toEqual([]);
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
