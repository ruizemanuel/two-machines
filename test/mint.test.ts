import { describe, expect, it } from "vitest";
import { GET } from "../app/api/mint/route";
import { mintRequest, numParam } from "../lib/coin/query";
import { SOFTWARE } from "./helpers/software";

const call = (qs: string) => GET(new Request("http://localhost/api/mint?" + qs));

// Same header layout lib/png.ts writes: IHDR is the first chunk, so the width
// and the height sit at a fixed offset.
const dimensions = (png: Uint8Array): [number, number] => {
  const view = new DataView(png.buffer, png.byteOffset);
  return [view.getUint32(16), view.getUint32(20)];
};

// The child calls init({ adapter: "software" }), so this suite needs Linux just
// as much as the golden ones do — it just fails as a 500 instead of a throw.
describe.skipIf(!SOFTWARE)("mint endpoint", () => {
  it("returns a PNG with the serial in a header", async () => {
    const res = await call("spin=0&melt=0");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-serial")).toMatch(/^[0-9a-f]{16}$/);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  }, 90_000);

  it("gives the same serial AND the same bytes for the same state", async () => {
    const a = await call("spin=0&melt=0");
    const b = await call("spin=0&melt=0");
    expect(a.headers.get("x-serial")).toBe(b.headers.get("x-serial"));
    // This is the determinism claim, so assert the pixels and not just a header.
    const bytesA = new Uint8Array(await a.arrayBuffer());
    const bytesB = new Uint8Array(await b.arrayBuffer());
    expect([...bytesA]).toEqual([...bytesB]);
  }, 180_000);

  it("gives a different serial for a different state", async () => {
    const a = await call("spin=0&melt=0");
    const b = await call("spin=1.2&melt=0");
    expect(a.headers.get("x-serial")).not.toBe(b.headers.get("x-serial"));
  }, 180_000);

  it("renders the card size when asked for one it does not serve", async () => {
    const res = await call("spin=0&melt=0&w=99999&h=99999");
    expect(res.status).toBe(200);
    expect(dimensions(new Uint8Array(await res.arrayBuffer()))).toEqual([1200, 630]);
  }, 90_000);
});

// Outside the skipIf on purpose: this needs no GPU, and it guards the one case
// none of the render tests above reach, since they all pass explicit values.
describe("query parameters", () => {
  it("falls back when a parameter is absent or blank", () => {
    expect(numParam(null, 1200)).toBe(1200);
    expect(numParam("", 630)).toBe(630);
    expect(numParam("   ", 630)).toBe(630);
    expect(numParam("nonsense", 1200)).toBe(1200);
  });

  it("takes the value when there is one, including zero", () => {
    expect(numParam("240", 1200)).toBe(240);
    expect(numParam("0", 1200)).toBe(0);
    expect(numParam("-1.5", 0)).toBe(-1.5);
  });

  const req = (qs: string) => mintRequest(new URLSearchParams(qs));

  it("serves the card size and the fallback size, and nothing else", () => {
    expect([req("w=1200&h=630").width, req("w=1200&h=630").height]).toEqual([1200, 630]);
    expect([req("w=1600&h=900").width, req("w=1600&h=900").height]).toEqual([1600, 900]);
    // A size nobody asks for is a fresh CPU-bound render the CDN has never seen.
    expect([req("w=99999&h=99999").width, req("w=99999&h=99999").height]).toEqual([1200, 630]);
    expect([req("w=240&h=140").width, req("w=240&h=140").height]).toEqual([1200, 630]);
    // Not a grid: the two sizes are pairs, so half of one and half of the other
    // is not a third size.
    expect([req("w=1600&h=630").width, req("w=1600&h=630").height]).toEqual([1200, 630]);
    expect([req("").width, req("").height]).toEqual([1200, 630]);
  });

  it("clamps melt and the mouse to the ranges the shader was built for", () => {
    expect(req("melt=7").state.melt).toBe(1);
    expect(req("melt=-7").state.melt).toBe(0);
    expect(req("melt=0.4").state.melt).toBe(0.4);
    expect(req("mx=9&my=-9").state.mouse).toEqual([1, -1]);
    expect(req("mx=-0.25&my=0.5").state.mouse).toEqual([-0.25, 0.5]);
  });

  // The visitor's own coin: asking for spin=412.7 again has to give back the
  // same bytes, so this is the one parameter that stays open.
  it("leaves spin free", () => {
    expect(req("spin=412.7").state.spin).toBe(412.7);
    expect(req("spin=-999.5").state.spin).toBe(-999.5);
  });
});
