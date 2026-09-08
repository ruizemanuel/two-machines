/** Bump this whenever a shader changes: it enters the serial, so every coin
 *  identifies the code that struck it. A stale value would let two different
 *  renders share a serial, which is exactly what the piece claims cannot happen. */
export const SHADER_VERSION = "1";
