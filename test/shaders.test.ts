// test/shaders.test.ts
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { SHADER_DIGEST, SHADER_VERSION } from "../lib/coin/version";

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

// SHADER_VERSION states its own stake in lib/coin/version.ts: a stale value lets
// two different renders share a serial, which is the one thing the piece claims
// cannot happen. Nothing enforced the bump — a shader could change and every
// coin would keep identifying code that no longer exists. This is that guard,
// and it needs no adapter, so it runs on every machine.
describe("shader version", () => {
  const digest = (): string => {
    // Sorted by path so the order cannot depend on the filesystem, and posix
    // separators plus LF so a Windows checkout hashes the same bytes CI does.
    const files = shaders("shaders").sort();
    if (files.length === 0) {
      throw new Error("no shaders found under shaders/: a digest over nothing would always match");
    }
    const hash = createHash("sha256");
    for (const file of files) {
      hash.update(file.split(path.sep).join("/"));
      hash.update("\n");
      hash.update(fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n"));
      hash.update("\n");
    }
    return hash.digest("hex");
  };

  it("still describes the shaders on disk", () => {
    const current = digest();
    expect(current, [
      "The shaders changed since SHADER_DIGEST was recorded.",
      "",
      `If the change moves a single pixel, bump SHADER_VERSION (now "${SHADER_VERSION}") in`,
      "lib/coin/version.ts first: it enters every serial, and leaving it stale lets two",
      "different renders be struck with the same number.",
      "",
      `Then set SHADER_DIGEST in that same file to: ${current}`,
    ].join("\n")).toBe(SHADER_DIGEST);
  });
});
