// Exists only to pin the font with a golden image.
import { glyph_mask } from "./lib/font5x7.wgsl";

const TEXT: array<u32, 16> = array<u32, 16>(
  31u, 16u, 25u, 30u, 36u, 28u, 17u, 37u,   // V G P U . S H  space
  0u, 1u, 2u, 3u, 4u, 5u, 6u, 7u,           // 0 1 2 3 4 5 6 7
);

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let cols = 16.0;
  let x = uv.x * cols;
  let index = u32(x);
  if (index >= 16u) { return vec4f(0.0, 0.0, 0.0, 1.0); }
  // uv already comes Y-down from vgpu, and the glyph cell wants Y-down too:
  // inverting here is what used to render the whole font upside down.
  let cell = vec2f(fract(x), uv.y);
  let m = glyph_mask(TEXT[index], cell);
  return vec4f(vec3f(m), 1.0);
}
