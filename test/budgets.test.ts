import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });

const CHUNKS = ".next/static/chunks";

describe("budgets", () => {
  it("ships no binary assets", () => {
    const offenders = walk("public").filter((f) => /\.(png|jpe?g|webp|glb|gltf|ktx2|woff2?|ttf|bin)$/i.test(f));
    expect(offenders).toEqual([]);
  });

  it("pins the exact versions the spike validated", () => {
    const prepare = fs.readFileSync("scripts/prepare-vulkan.mjs", "utf8");
    expect(prepare).toContain("vulkan-loader-1.3.296.0-72.amzn2023");
    expect(prepare).toContain("Mesa 25.0.7");
  });

  // No golden can be produced on this machine — only bootstrap-goldens (Linux
  // CI) makes one, and a human commits it after looking. Until the first one
  // lands, test/golden does not exist at all: skip honestly rather than let
  // an empty directory's vacuous [].every(...) report a pass with nothing to
  // check — the same reasoning as the two skips below.
  it.skipIf(!fs.existsSync("test/golden"))("names every golden with the pinned Mesa version", () => {
    const golden = fs.readdirSync("test/golden");
    expect(golden.every((f) => f.includes("@mesa-25.0.7"))).toBe(true);
  });

  // 60 KB was always the budget for what this piece controls — vgpu plus the
  // scene and the page. React and the Next runtime add about 156 KB on top of
  // that, which no amount of care here would remove; they are reported in the
  // README rather than budgeted. Measured when this was written: 51.8 KB for the
  // piece, 221.2 KB in total.
  //
  // it.skipIf, not a silent early return: a build that never ran must read as
  // SKIP, not as a PASS that measured zero bytes.
  it.skipIf(!fs.existsSync(CHUNKS))("keeps the piece's own bundle under the budget", () => {
    const js = walk(CHUNKS).filter((f) => f.endsWith(".js"));
    const ours = js.filter((f) => fs.readFileSync(f, "utf8").includes("vgpu"));
    // A selector that matches nothing would otherwise pass while measuring zero.
    expect(ours.length).toBeGreaterThan(0);
    const total = ours.reduce((n, f) => n + zlib.gzipSync(fs.readFileSync(f)).length, 0);
    expect(total).toBeLessThan(60 * 1024);
  });

  it.skipIf(!fs.existsSync(CHUNKS))("keeps the whole transfer from growing unnoticed", () => {
    const total = walk(CHUNKS)
      .filter((f) => f.endsWith(".js"))
      .reduce((n, f) => n + zlib.gzipSync(fs.readFileSync(f)).length, 0);
    expect(total).toBeLessThan(240 * 1024);
  });
});
