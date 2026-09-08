/** Bump this whenever a shader changes: it enters the serial, so every coin
 *  identifies the code that struck it. A stale value would let two different
 *  renders share a serial, which is exactly what the piece claims cannot happen. */
export const SHADER_VERSION = "1";

/** sha256 over every .wgsl under shaders/, sorted by path, each file's name
 *  followed by its contents — recorded here so test/shaders.test.ts can notice
 *  a shader that changed while SHADER_VERSION stayed put. The version above is the
 *  promise; this is the only thing that checks it was kept. Update it in the
 *  same commit as the shader, with the value the failing test prints. */
export const SHADER_DIGEST = "18e2b636f4b872430bb7c5214e7d404c57682948d3c263e5993c1a630ce6bcae";
