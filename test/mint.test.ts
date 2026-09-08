import { describe, expect, it } from "vitest";
import { GET } from "../app/api/mint/route.js";
import { numParam } from "../lib/coin/query.js";
import { SOFTWARE } from "./helpers/software.js";

const call = (qs: string) => GET(new Request("http://localhost/api/mint?" + qs));

// The child calls init({ adapter: "software" }), so this suite needs Linux just
// as much as the golden ones do — it just fails as a 500 instead of a throw.
describe.skipIf(!SOFTWARE)("mint endpoint", () => {
  it("returns a PNG with the serial in a header", async () => {
    const res = await call("spin=0&melt=0&w=240&h=140");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-serial")).toMatch(/^[0-9a-f]{16}$/);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  }, 90_000);

  it("gives the same serial AND the same bytes for the same state", async () => {
    const a = await call("spin=0&melt=0&w=240&h=140");
    const b = await call("spin=0&melt=0&w=240&h=140");
    expect(a.headers.get("x-serial")).toBe(b.headers.get("x-serial"));
    // This is the determinism claim, so assert the pixels and not just a header.
    const bytesA = new Uint8Array(await a.arrayBuffer());
    const bytesB = new Uint8Array(await b.arrayBuffer());
    expect([...bytesA]).toEqual([...bytesB]);
  }, 120_000);

  it("gives a different serial for a different state", async () => {
    const a = await call("spin=0&melt=0&w=240&h=140");
    const b = await call("spin=1.2&melt=0&w=240&h=140");
    expect(a.headers.get("x-serial")).not.toBe(b.headers.get("x-serial"));
  }, 120_000);

  it("clamps absurd sizes instead of trying to render them", async () => {
    const res = await call("spin=0&melt=0&w=99999&h=99999");
    expect(res.status).toBe(200);
  }, 90_000);
});

// Outside the skipIf on purpose: this needs no GPU, and it guards the one case
// none of the render tests below reach, since they all pass w and h explicitly.
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
});
