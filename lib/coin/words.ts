/** The 16 hex digits are exactly 64 bits: two u32 words, no array, no padding.
 *
 *  This lives apart from serial.ts on purpose. serial.ts imports node:crypto for
 *  the hash, and scene.ts — which runs in the browser — needs only this function.
 *  Importing it from serial.ts dragged a full crypto and Buffer polyfill into the
 *  client bundle: 127.7 KB gzip for four lines of parseInt.
 */
export function serialToWords(serial: string): [number, number] {
  return [
    parseInt(serial.slice(0, 8), 16) >>> 0,
    parseInt(serial.slice(8, 16), 16) >>> 0,
  ];
}
