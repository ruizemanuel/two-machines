import { describe, expect, it } from "vitest";
import gradient from "../shaders/gradient.wgsl";

describe("wgsl loader", () => {
  it("imports a .wgsl file as a resolved shader source", () => {
    // The loader does NOT return a string: it emits { version, wgsl, functionExports },
    // which is what effect() accepts as a ShaderSource.
    expect(gradient.version).toBe(1);
    expect(gradient.wgsl).toContain("@fragment");
  });
});
