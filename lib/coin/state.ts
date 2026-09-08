export type Phase = "molten" | "striking" | "frozen";

export type CoinState = {
  readonly spin: number;
  readonly melt: number;
  readonly flash: number;
  readonly press: number;
  readonly mouse: readonly [number, number];
  readonly time: number;
};

export const INITIAL: CoinState = {
  spin: 0, melt: 1, flash: 0, press: 0, mouse: [0, 0], time: 0,
};

const TAU = Math.PI * 2;
const SPIN_RATE = 0.16;

/** Nearest whole turn forward: the die aligns the piece and the coin stops
 *  with the right triangle. */
export function alignedSpin(spin: number): number {
  return Math.ceil(spin / TAU + 1e-9) * TAU;
}

const easeInOutCubic = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

export function advance(state: CoinState, phase: Phase, dt: number, strikeProgress: number): CoinState {
  if (phase === "molten") {
    return {
      ...state,
      spin: state.spin + dt * SPIN_RATE,
      melt: state.melt + (1 - state.melt) * Math.min(1, dt * 3.6),
      flash: state.flash * Math.pow(0.86, dt * 60),
      press: 0,
      time: state.time + dt,
    };
  }
  if (phase === "striking") {
    const k = Math.min(Math.max(strikeProgress, 0), 1);
    return {
      ...state,
      melt: 1 - easeInOutCubic(k),
      press: Math.sin(Math.min(k / 0.45, 1) * Math.PI),
      flash: Math.exp(-Math.pow((k - 0.16) / 0.075, 2)) * 1.15,
      time: state.time + dt,
    };
  }
  // time goes back to 0 here and does not keep running. The post pass seeds its
  // grain from time and the server renders with time = 0; if this kept counting,
  // the card would never be the frame the visitor is looking at.
  return { ...state, melt: 0, press: 0, flash: 0, time: 0 };
}

/** Quantises onto exactly the grid `encodeState` formats to, and normalises the
 *  sign of zero so that -0 and 0 cannot become two different keys.
 *
 *  It rounds with the same `toFixed(5)` that `encodeState` uses, not with
 *  `Math.round(n * 1e5) / 1e5`: those two disagree for about 4.5% of values
 *  (0.123455 rounds up to 0.12346 but formats down to "0.12345"), which would
 *  leave `encodeState(canonicalize(s))` and `encodeState(s)` naming two coins.
 *
 *  The mint route applies this BEFORE hashing and before rendering. Rounding only
 *  at hash time would leave a hole in the promise the piece makes: two states that
 *  collapse onto one serial would render different pixels. */
export function canonicalize(state: CoinState): CoinState {
  const q = (n: number) => {
    const r = Number(n.toFixed(5));
    return r === 0 ? 0 : r;   // Number("-0.00000") is -0; collapse it onto +0
  };
  return { ...state, spin: q(state.spin), melt: q(state.melt), mouse: [q(state.mouse[0]), q(state.mouse[1])] };
}

/** Canonical key. Two equal states must give the same PNG and the same URL.
 *
 *  `time` is deliberately absent: the mint render freezes it at 0, so it never
 *  reaches the rendered frame. If it were included, the card would not be the
 *  frame the visitor is looking at — the film grain would differ. */
export function encodeState(state: CoinState): string {
  const round = (n: number) => n.toFixed(5);
  return [round(state.spin), round(state.melt), round(state.mouse[0]), round(state.mouse[1])].join(",");
}
