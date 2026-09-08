import fs from "node:fs";
import path from "node:path";
import { expect } from "vitest";
import { encodePng } from "../../lib/png.js";

// Intentionally pinned: if vgpu changes Mesa versions, the golden image ceases to exist
// and the test fails with file not found instead of pixel diff.
export const MESA = "25.0.7";
const DIR = path.join(process.cwd(), "test", "golden");

export function goldenPath(name: string): string {
  return path.join(DIR, `${name}@mesa-${MESA}.png`);
}

export function compare(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return Infinity;
  let differing = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) differing++;
  }
  return differing;
}

// Saves the render next to the golden when there is a difference, so you can view them.
export async function expectGolden(
  name: string,
  rgba: Uint8Array,
  width: number,
  height: number,
  adapter: { name: string; type: string },
) {
  // Refuse to write or compare against pixels from the wrong renderer. Without
  // this guard a developer machine happily produces a file called @mesa-25.0.7
  // full of D3D12 pixels, and CI goes red for a reason nobody can read.
  if (adapter.type !== "cpu" || !adapter.name.includes(`Mesa ${MESA}`)) {
    throw new Error(
      `Golden images require the pinned CPU renderer (Mesa ${MESA}); got "${adapter.name}" (${adapter.type}).\n` +
      `Generate them on Linux via CI or WSL, never on a machine with a real GPU.\n` +
      `If you ARE on Linux and still landed on a GPU: check VGPU_ADAPTER. vgpu's init()` +
      ` resolves the adapter as (env override ?? argument ?? "auto"), so that variable beats` +
      ` the explicit adapter: "software" this project passes everywhere.`,
    );
  }

  const file = goldenPath(name);
  fs.mkdirSync(DIR, { recursive: true });

  if (!fs.existsSync(file)) {
    if (process.env.UPDATE_GOLDEN !== "1") {
      throw new Error(
        `Missing golden image ${path.basename(file)}.\n` +
        `If this is the first time, generate it with UPDATE_GOLDEN=1 and review it visually before committing.\n` +
        `If it existed for another Mesa version, the renderer has changed: you must revalidate.`,
      );
    }
    fs.writeFileSync(file, encodePng(rgba, width, height));
    return;
  }

  const { readGolden } = await import("./read-png.js");
  const expected = readGolden(file);
  const differing = compare(rgba, expected);
  if (differing !== 0) {
    const actual = file.replace(/\.png$/, ".actual.png");
    fs.writeFileSync(actual, encodePng(rgba, width, height));
    throw new Error(`${differing} differing pixels. Render saved to ${path.basename(actual)}`);
  }
  expect(differing).toBe(0);
}
