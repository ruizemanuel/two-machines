import { describe, expect, it } from "vitest";
import { serialFromState } from "../lib/coin/serial";
import { serialToWords } from "../lib/coin/words";
import { INITIAL } from "../lib/coin/state";

describe("serial", () => {
  it("is 16 hex characters", () => {
    expect(serialFromState(INITIAL, "v1")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is stable for the same state and changes for a different one", () => {
    expect(serialFromState(INITIAL, "v1")).toBe(serialFromState({ ...INITIAL }, "v1"));
    expect(serialFromState(INITIAL, "v1")).not.toBe(serialFromState({ ...INITIAL, spin: 1 }, "v1"));
  });

  it("changes when the shader version changes, so a coin identifies its code", () => {
    expect(serialFromState(INITIAL, "v1")).not.toBe(serialFromState(INITIAL, "v2"));
  });

  it("ignores time, which does not reach the rendered frame", () => {
    expect(serialFromState(INITIAL, "v1")).toBe(serialFromState({ ...INITIAL, time: 99 }, "v1"));
  });

  it("splits the 16 hex digits into two u32 words", () => {
    expect(serialToWords("5de3f2beb643864b")).toEqual([0x5de3f2be, 0xb643864b]);
    expect(serialToWords("ffffffffffffffff")).toEqual([0xffffffff, 0xffffffff]);
  });
});
