// Opt-in: only runs when given a deployed URL. It is the only test that
// actually checks acceptance criterion 3 (< 1.5 s warm) and §8 of the spec.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

const MINT = process.env.MINT_URL;
const sha = (b: ArrayBuffer) => createHash("sha256").update(Buffer.from(b)).digest("hex");

describe.skipIf(!MINT)("deployed contract", () => {
  it("returns byte-identical PNGs for the same state, warm, under 1.5 s", async () => {
    const url = `${MINT}/api/mint?spin=0&melt=0&w=1200&h=630`;
    await fetch(url);                       // warm the function
    const a = await fetch(url);
    const b = await fetch(url);
    expect(sha(await a.arrayBuffer())).toBe(sha(await b.arrayBuffer()));
    expect(a.headers.get("x-serial")).toBe(b.headers.get("x-serial"));
    expect(Number(b.headers.get("x-render-ms"))).toBeLessThan(1500);
  }, 120_000);
});
