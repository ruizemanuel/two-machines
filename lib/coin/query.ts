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
