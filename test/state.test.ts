import { describe, expect, it } from "vitest";
import { INITIAL, advance, alignedSpin, canonicalize, encodeState } from "../lib/coin/state.js";

describe("coin state", () => {
  it("spins only while molten", () => {
    const molten = advance(INITIAL, "molten", 1, 0);
    expect(molten.spin).toBeGreaterThan(INITIAL.spin);
    const frozen = advance(molten, "frozen", 1, 0);
    expect(frozen.spin).toBe(molten.spin);
  });

  it("melts back to 1 when molten and to 0 when the strike completes", () => {
    expect(advance({ ...INITIAL, melt: 0 }, "molten", 1, 0).melt).toBeGreaterThan(0);
    expect(advance(INITIAL, "striking", 0.016, 1).melt).toBe(0);
  });

  it("aligns the spin to a whole turn so the logo ends upright", () => {
    expect(alignedSpin(0.1)).toBeCloseTo(Math.PI * 2, 6);
    expect(alignedSpin(7.0)).toBeCloseTo(Math.PI * 4, 6);
  });

  it("encodes the same state to the same cache key", () => {
    expect(encodeState(INITIAL)).toBe(encodeState({ ...INITIAL }));
    expect(encodeState({ ...INITIAL, spin: 1 })).not.toBe(encodeState(INITIAL));
  });

  // The post pass seeds its grain from time. If time kept running once the coin
  // is frozen, the card would carry a different grain than the frame on screen,
  // and time cannot travel to the server: encodeState leaves it out on purpose.
  it("freezes time at 0, so the server render is the same frame", () => {
    expect(advance({ ...INITIAL, time: 12.5 }, "frozen", 0.016, 1).time).toBe(0);
  });

  it("canonicalises onto the same grid encodeState rounds to", () => {
    const raw = { ...INITIAL, spin: 1.2345678 };
    expect(canonicalize(raw).spin).toBe(1.23457);
    expect(encodeState(canonicalize(raw))).toBe(encodeState(raw));
  });

  // 0.123455 is precisely where the old Math.round(n * 1e5) / 1e5 disagreed with
  // toFixed(5): it rounded up to 0.12346 while encodeState formats the same raw
  // input down to "0.12345", so the canonical state and the raw state named two
  // different coins. Picking a value the two roundings agree on hides that.
  it("canonicalises values where the two roundings used to disagree", () => {
    const raw = { ...INITIAL, spin: 0.123455 };
    expect(encodeState(canonicalize(raw))).toBe(encodeState(raw));
  });

  it("collapses negative zero, so it cannot become a second cache key", () => {
    const raw = { ...INITIAL, mouse: [-0.000001, 0] as [number, number] };
    expect(Object.is(canonicalize(raw).mouse[0], 0)).toBe(true);
    expect(encodeState(canonicalize(raw))).toBe(encodeState(INITIAL));
  });

  it("advances a whole turn even when the spin already sits on one", () => {
    expect(alignedSpin(0)).toBeCloseTo(Math.PI * 2, 6);
    expect(alignedSpin(Math.PI * 2)).toBeCloseTo(Math.PI * 4, 6);
  });
});
