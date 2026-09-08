// test/shaders.test.ts
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Runs on every platform, GPU or not: `vgpu check` resolves the module graph and
// validates the WGSL without ever requesting an adapter. Every test that actually
// renders is Linux-only, so on a developer machine this is the only thing standing
// between a typo in a shader and a red CI run twenty minutes later.
const CLI = path.join("node_modules", "vgpu", "bin", "vgpu.js");

const shaders = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? shaders(p) : p.endsWith(".wgsl") ? [p] : [];
  });

describe("wgsl validation", () => {
  const files = shaders("shaders");

  it("finds shaders to validate", () => {
    // Without this, a broken glob would turn the whole suite into zero tests
    // that pass, which is the failure mode this file exists to prevent.
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} validates`, () => {
      // Non-zero exit throws, and the compiler diagnostics ride along on stderr.
      execFileSync(process.execPath, [CLI, "check", file, "--require-validation"], {
        stdio: "pipe",
      });
    }, 30_000);
  }
});
