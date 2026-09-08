import { INITIAL, canonicalize, type CoinState } from "./state";

/** Reads one numeric query parameter, falling back when it is absent or unusable.
 *
 *  The null and empty cases have to be handled before Number(): `Number(null)` and
 *  `Number("")` are both 0, and 0 is finite, so the obvious one-liner silently
 *  returns 0 instead of the fallback. That turned a mint request with no size into
 *  a 16x16 image rather than the 1200x630 the endpoint advertises.
 */
export function numParam(value: string | null, fallback: number): number {
  if (value === null || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Keeps a free-floating parameter inside the range it means something in. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** The only two frames the piece renders: 1200x630 for the link card and the OG
 *  image, 1600x900 for the full-bleed fallback. Anything else becomes the card.
 *
 *  A free 16..2048 range was up to 4,2 megapixels — about five times the work of
 *  the size actually used — and every distinct query string is a cache miss that
 *  starts a fresh CPU-bound child at ~1,3 s, with responses marked immutable so
 *  the CDN never shields the origin from novel URLs. The piece succeeds by being
 *  shared, which is exactly when that matters. */
const SIZES: readonly (readonly [number, number])[] = [[1200, 630], [1600, 900]];

export function resolveSize(width: number, height: number): readonly [number, number] {
  return SIZES.find(([w, h]) => w === width && h === height) ?? SIZES[0];
}

export type MintRequest = {
  readonly width: number;
  readonly height: number;
  readonly state: CoinState;
};

/** The whole conversion from a URL to something renderable, in one pure place so
 *  it can be tested without an adapter.
 *
 *  Quantised before hashing AND before rendering: the serial comes off the grid
 *  encodeState rounds to, so the child has to draw that same grid — otherwise two
 *  states that share a serial could render different pixels.
 *
 *  `spin` is deliberately left free. It is the one parameter that is the
 *  visitor's own: the whole point is that they can ask for their coin again and
 *  get the same bytes back. `melt` and the mouse have shader ranges, and outside
 *  them there is nothing to see. */
export function mintRequest(query: URLSearchParams): MintRequest {
  const [width, height] = resolveSize(
    Math.round(numParam(query.get("w"), 1200)),
    Math.round(numParam(query.get("h"), 630)),
  );
  const state = canonicalize({
    ...INITIAL,
    spin: numParam(query.get("spin"), 0),
    melt: clamp(numParam(query.get("melt"), 0), 0, 1),
    mouse: [
      clamp(numParam(query.get("mx"), 0), -1, 1),
      clamp(numParam(query.get("my"), 0), -1, 1),
    ] as const,
    time: 0,
    flash: 0,
    press: 0,
  });
  return { width, height, state };
}
