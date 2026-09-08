// shaders/relief.wgsl
// Pass 0: the coin face, generated entirely on the GPU.
// On the server there is no canvas 2D, and any alternative rasterizer would give
// different pixels than the browser. Generating it here is what keeps the render
// bit-identical on the pinned CPU renderer and, by the way, the promise of zero
// assets.
import { glyph_mask } from "./lib/font5x7.wgsl";
import { sd_triangle, sd_segment } from "./lib/sdf.wgsl";

const PI: f32 = 3.14159265;
const TAU: f32 = 6.28318531;

// The serial number is 16 hex digits, that is 64 bits exactly: fits in two u32
// and no array is needed. An array<u32,16> in a uniform would have a 16-byte
// stride due to WGSL alignment and would need to be packed manually into vec4u;
// this way the problem does not exist.
@group(0) @binding(0) var<uniform> serial_hi: u32;   // digits 0-7
@group(0) @binding(1) var<uniform> serial_lo: u32;   // digits 8-15
@group(0) @binding(2) var<uniform> serial_on: u32;   // 0 while molten: nothing struck yet

fn serial_code(i: u32) -> u32 {
  let word = select(serial_lo, serial_hi, i < 8u);
  let shift = (7u - (i % 8u)) * 4u;
  return (word >> shift) & 0xFu;
}

fn band(d: f32, w: f32) -> f32 { return 1.0 - smoothstep(0.0, w, abs(d)); }

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // vgpu hands uv with a top-left origin; flip Y so the whole face is authored
  // in the same Y-up space that coin.wgsl samples.
  let p = vec2f(uv.x - 0.5, 0.5 - uv.y);
  let r = length(p);
  let ang = atan2(p.x, p.y);        // 0 up, clockwise

  var h = 0.0;

  // field of the disk
  h = max(h, 0.18 * (1.0 - smoothstep(0.483, 0.487, r)));

  // outer rim
  h = max(h, 0.91 * band(r - 0.466, 0.015));

  // denticles: thick and few on purpose. Finer ones alias into sparkles.
  let spokes = 84.0;
  let a = fract(ang / TAU * spokes + 0.5) - 0.5;
  let across = abs(a) / spokes * TAU * r;
  let along = 1.0 - smoothstep(0.437, 0.449, r) - (1.0 - smoothstep(0.430, 0.437, r));
  h = max(h, 0.66 * (1.0 - smoothstep(0.0028, 0.0045, across)) * clamp(along, 0.0, 1.0));

  // Two separator stars, left and right. With vec2f(sin, cos) they would land
  // top and bottom, and the bottom one would land at the exact center of the
  // legend: same 0.385 radius, same angular position.
  for (var i = 0u; i < 2u; i = i + 1u) {
    let sa = f32(i) * PI;
    let c = vec2f(cos(sa), sin(sa)) * 0.385;
    let q = p - c;
    let star = max(band(sd_segment(q, vec2f(-0.012, 0.0), vec2f(0.012, 0.0)), 0.004),
                   band(sd_segment(q, vec2f(0.0, -0.012), vec2f(0.0, 0.012)), 0.004));
    h = max(h, 0.82 * star);
  }

  // curved legend VGPU.SH at the bottom
  {
    let codes = array<u32, 7>(31u, 16u, 25u, 30u, 36u, 28u, 17u);
    let radius = 0.385;
    let cell_w = 0.030;
    let cell_h = 0.042;
    let sweep = cell_w * 7.0 / radius;
    let rel = (ang - PI) ;
    let wrapped = rel - TAU * round(rel / TAU);
    let t = wrapped / sweep + 0.5;               // 0..1 along the legend
    if (t >= 0.0 && t < 1.0) {
      let idx = u32(t * 7.0);
      let cell = vec2f(fract(t * 7.0), (r - (radius - cell_h * 0.5)) / cell_h);
      h = max(h, 0.89 * glyph_mask(codes[6u - idx], vec2f(1.0 - cell.x, cell.y)));
    }
  }

  // serial number, straight, at the top
  {
    let cw = 0.0225;
    let ch = 0.032;
    let origin = vec2f(-cw * 8.0, 0.238 - ch * 0.5);
    let local = (p - origin) / vec2f(cw, ch);
    if (serial_on == 1u && local.x >= 0.0 && local.x < 16.0 && local.y >= 0.0 && local.y < 1.0) {
      let idx = u32(local.x);
      // local is Y-up here; the glyph cell wants Y-down
      let cell = vec2f(fract(local.x), 1.0 - local.y);
      h = max(h, 0.78 * glyph_mask(serial_code(idx), cell));
    }
  }

  // Vercel triangle, bulged. viewBox 0 0 115 100 -> base/height = 1.15
  {
    let tw = 0.150;
    let th = tw * 2.0 * (100.0 / 115.0);
    let d = sd_triangle(p, vec2f(0.0, th * 0.5), vec2f(tw, -th * 0.5), vec2f(-tw, -th * 0.5));
    if (d < 0.0) {
      let depth = clamp(-d / (tw * 0.55), 0.0, 1.0);
      h = max(h, 0.40 + 0.60 * sin(depth * PI * 0.5));
    }
  }

  return vec4f(h, 0.0, 0.0, 1.0);
}
