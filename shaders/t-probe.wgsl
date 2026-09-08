// A single glyph filling the target, so a test can assert which rows are lit.
import { glyph_mask } from "./lib/font5x7.wgsl";

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return vec4f(vec3f(glyph_mask(29u, uv)), 1.0);   // 29 = T
}
