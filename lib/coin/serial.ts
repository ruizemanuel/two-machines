import { createHash } from "node:crypto";
import { encodeState, type CoinState } from "./state";

/** Fingerprint of the STATE, not of the pixels.
 *
 *  It cannot be the hash of the image: the image carries the serial engraved on
 *  its face, so hashing it would be circular. Hashing the canonical state keeps
 *  every promise that matters — the same state always yields the same serial and
 *  the same bytes — and anyone can verify it by asking for that state again.
 *
 *  shaderVersion enters the hash so that changing a shader changes every serial:
 *  a coin identifies the code that struck it, not just the inputs. */
export function serialFromState(state: CoinState, shaderVersion: string): string {
  return createHash("sha256")
    .update(shaderVersion + "|" + encodeState(state))
    .digest("hex")
    .slice(0, 16);
}

/** The 16 hex digits are exactly 64 bits: two u32 words, no array, no padding. */
export function serialToWords(serial: string): [number, number] {
  return [
    parseInt(serial.slice(0, 8), 16) >>> 0,
    parseInt(serial.slice(8, 16), 16) >>> 0,
  ];
}
