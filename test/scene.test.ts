import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { target } from "vgpu";
import { disposeGpu, sharedGpu } from "../lib/gpu-server";
import { createScene } from "../lib/coin/scene";
import { INITIAL } from "../lib/coin/state";
import { compare, expectGolden } from "./helpers/golden";
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

  // Everything the browser reaches through scene.ts, not scene.ts alone. It
  // imports ./words and ./state, and a Date.now() added to either kills the
  // server render exactly as surely — the single-file version of this guard
  // would have said nothing. The one real violation this branch found was
  // itself transitive: node:crypto reaching the client through serialToWords,
  // which is the whole reason lib/coin/words.ts exists.
  const ENTRY = path.join("lib", "coin", "scene.ts");

  function moduleGraph(entry: string): string[] {
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = fs.readFileSync(file, "utf8");
      // Relative specifiers only: a bare "vgpu" is a dependency, not this code.
      // They carry no extension — Turbopack cannot resolve a .js pointing at a
      // .ts — so the candidates are appended here. A .wgsl import matches none
      // of them and is skipped, which is right: WGSL has no page to reach.
      for (const [, specifier] of src.matchAll(/\bfrom\s+"(\.[^"]*)"/g)) {
        const base = path.join(path.dirname(file), specifier);
        const hit = [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]
          .find((candidate) => fs.existsSync(candidate));
        if (hit) visit(hit);
      }
    };
    visit(entry);
    return [...seen];
  }

  it("never reaches the page or starts a clock of its own", () => {
    const files = moduleGraph(ENTRY);
    // A resolver that quietly found nothing would leave this checking one file
    // again, and passing for the same reason it passed before.
    expect(files).toContain(path.join("lib", "coin", "words.ts"));
    expect(files).toContain(path.join("lib", "coin", "state.ts"));
    // Collect rather than assert one by one, so a failure names the offender.
    const offenders = files.flatMap((file) => {
      const src = fs.readFileSync(file, "utf8");
      return FORBIDDEN.filter((pattern) => pattern.test(src)).map((pattern) => `${file} ${pattern}`);
    });
    expect(offenders).toEqual([]);
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

  // setSerial(null) is the path a remelt takes: the face goes back to blank.
  // Nothing else in the suite reaches serial_on = 0 through the scene, and the
  // browser now depends on it — a coin that keeps a serial it no longer has
  // breaks the same claim an unengraved one does.
  it("takes the serial back off the face", async () => {
    const gpu = await sharedGpu();
    const out = target(gpu, { size: [480, 360], format: "rgba8unorm" });
    const scene = createScene(gpu, 480, 360);
    const frozen = { ...INITIAL, melt: 0, spin: 0, time: 0 };

    scene.setSerial("5de3f2beb643864b");
    scene.render(out, frozen);
    const struck = await out.read();

    scene.setSerial(null);
    scene.render(out, frozen);
    const blank = await out.read();

    expect(compare(struck, blank)).toBeGreaterThan(0);
  }, 180_000);
});
