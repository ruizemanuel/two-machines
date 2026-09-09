/** Bump this whenever a shader changes: it enters the serial, so every coin
 *  identifies the code that struck it. A stale value would let two different
 *  renders share a serial, which is exactly what the piece claims cannot happen. */
export const SHADER_VERSION = "2";

/** sha256 over every .wgsl under shaders/, sorted by path, each file's name
 *  followed by its contents — recorded here so test/shaders.test.ts can notice
 *  a shader that changed while SHADER_VERSION stayed put. The version above is the
 *  promise; this is the only thing that checks it was kept. Update it in the
 *  same commit as the shader, with the value the failing test prints. */
export const SHADER_DIGEST = "a3b02f6d5f52a81ce934f3bb83e79d070fdcf6d8954ed8cf02c0ed82409638d7";
