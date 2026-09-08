// shaders/coin.wgsl
// Pass 1: the coin itself. A raymarch of a rounded cylinder whose +Y face is
// displaced by the height map Pass 0 rendered, shaded as metal that can also be
// molten. Ported from the FS_SCENE shader of the WebGL2 mockup, which is the
// source of truth for the look.
import { studio, ggx, heat } from "./lib/metal.wgsl";

@group(0) @binding(0) var<uniform> res: vec2f;
@group(0) @binding(1) var<uniform> mouse: vec2f;
@group(0) @binding(2) var<uniform> time: f32;
@group(0) @binding(3) var<uniform> melt: f32;
@group(0) @binding(4) var<uniform> flash: f32;
@group(0) @binding(5) var<uniform> spin: f32;
@group(0) @binding(6) var<uniform> press: f32;
// The height map from Pass 0. vgpu has no implicit sampler, so the filtering one
// is a binding of its own and the test supplies it.
@group(0) @binding(7) var relief: texture_2d<f32>;
@group(0) @binding(8) var samp: sampler;

const R: f32 = 1.00;
const H: f32 = 0.085;
const BEV: f32 = 0.035;
const RELIEF: f32 = 0.020;

// mat3x3 is column-major, exactly like GLSL's mat3. Written "the way it reads",
// as rows, these rotate the wrong way and you end up looking at the blank
// reverse of the coin. The columns are spelled out so that cannot happen.
fn rot_x(a: f32) -> mat3x3<f32> {
  let c = cos(a);
  let s = sin(a);
  return mat3x3<f32>(vec3f(1.0, 0.0, 0.0), vec3f(0.0, c, -s), vec3f(0.0, s, c));
}
fn rot_y(a: f32) -> mat3x3<f32> {
  let c = cos(a);
  let s = sin(a);
  return mat3x3<f32>(vec3f(c, 0.0, s), vec3f(0.0, 1.0, 0.0), vec3f(-s, 0.0, c));
}

fn hash1(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash1(i), hash1(i + vec2f(1.0, 0.0)), u.x),
             mix(hash1(i + vec2f(0.0, 1.0)), hash1(i + vec2f(1.0, 1.0)), u.x), u.y);
}

fn fbm(p: vec2f) -> f32 {
  var q = p;                 // WGSL parameters are immutable; GLSL scaled p in place
  var v = 0.0;
  var a = 0.5;
  for (var i = 0u; i < 4u; i = i + 1u) {
    v += a * vnoise(q);
    q *= 2.03;
    a *= 0.5;
  }
  return v;
}

/** Height of the face at a point of the coin's local XZ plane.
 *  Named relief_at and not relief because the texture already owns that name. */
fn relief_at(xz: vec2f) -> f32 {
  // No Z negation here. The mockup uploaded its relief through WebGL with
  // UNPACK_FLIP_Y_WEBGL = true and negated the Z to compensate for that flip;
  // vgpu's target is not flipped, so the compensation has to go. Keeping it
  // renders the face mirrored, subtly enough to survive a casual look.
  var uv = vec2f(xz.x, xz.y) / (2.0 * R) + 0.5;
  var flow = 0.0;
  if (melt > 0.001) {
    let w = vec2f(fbm(uv * 3.1 + vec2f(time * 0.11, 0.0)),
                  fbm(uv * 3.1 + vec2f(0.0, time * 0.13) + 7.3)) - 0.5;
    uv += w * 0.20 * melt;
    flow = fbm(uv * 5.5 - vec2f(0.0, time * 0.22)) * 0.55;
  }
  // Explicit level 0: inside a raymarch loop the derivatives are meaningless and
  // implicit sampling falls to the lowest mip, leaving the face smooth.
  let h = textureSampleLevel(relief, samp, clamp(uv, vec2f(0.002), vec2f(0.998)), 0.0).r;
  return mix(h, flow * 0.75 + h * 0.30, melt);
}

/** Cylinder of radius R and half-height H with a rounded edge of radius BEV. */
fn sd_disc(p: vec3f) -> f32 {
  let d = vec2f(length(p.xz) - (R - BEV), abs(p.y) - (H - BEV));
  return min(max(d.x, d.y), 0.0) + length(max(d, vec2f(0.0))) - BEV;
}

fn map(world: vec3f) -> f32 {
  var p = rot_y(spin) * (rot_x(1.06) * world);
  p.y -= press * 0.06;
  var d = sd_disc(p);
  let rr = length(p.xz) / R;
  // Only near the face: displacing across the whole half-space deforms the field
  // far from the surface and produces ghost silhouettes.
  if (rr < 1.02 && p.y > 0.0 && d < 0.07) {
    let h = relief_at(p.xz) * smoothstep(1.005, 0.95, rr);
    d -= h * RELIEF * smoothstep(0.07, 0.015, d);
  }
  return d;
}

fn normal_at(p: vec3f, d: f32) -> vec3f {
  let e = vec2f(d, 0.0);
  return normalize(vec3f(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

@fragment fn fs_main(@location(0) v_uv: vec2f) -> @location(0) vec4f {
  // vgpu hands uv with a top-left origin; the mockup's vUv had a bottom-left
  // one, so the Y is flipped once here and everything downstream is flip-free.
  var uv = vec2f(v_uv.x * 2.0 - 1.0, 1.0 - v_uv.y * 2.0);
  uv.x *= res.x / res.y;
  // The mockup also added uShift here, to open a gap on the right for the card,
  // but it pinned that uniform to 0.0 ("moneda centrada") and never moved it.
  // It is layout, not material, and this pass's contract has no shift uniform,
  // so dropping it reproduces the mockup exactly.

  let ro = vec3f(mouse.x * 0.18, 0.32 + mouse.y * 0.12, 3.05);
  let ta = vec3f(0.0, 0.02, 0.0);
  let ww = normalize(ta - ro);
  let uu = normalize(cross(ww, vec3f(0.0, 1.0, 0.0)));
  let vv = cross(uu, ww);
  let rd = normalize(uv.x * uu + uv.y * vv + 1.62 * ww);

  var t = 0.0;
  var hit = false;
  for (var i = 0u; i < 170u; i = i + 1u) {
    let p = ro + rd * t;
    let d = map(p);
    if (d < 0.0010 * t) { hit = true; break; }
    t += d * 0.22;
    if (t > 7.0) { break; }
  }

  // the background is a darkened room: the studio exists only as a reflection
  var col = mix(vec3f(0.005, 0.006, 0.010), vec3f(0.022, 0.026, 0.035),
                smoothstep(-0.75, 0.95, rd.y));
  col += vec3f(0.030, 0.036, 0.048) * exp(-length(uv - vec2f(-0.55, 0.45)) * 1.4);

  if (hit) {
    let p = ro + rd * t;
    // Normal filtering (Toksvig's idea): the denticles are finer than a pixel,
    // so their reflection cannot be resolved — it comes out as loose sparks.
    // Measure how much the normal varies under the pixel by comparing two
    // scales, and turn that variance into roughness: the highlight widens
    // instead of flickering.
    let n_fine = normal_at(p, 0.0022);     // fine detail
    let n_coarse = normal_at(p, 0.0110);   // same surface, coarse scale
    let var_n = 1.0 - clamp(dot(n_fine, n_coarse), 0.0, 1.0);
    let n = normalize(mix(n_fine, n_coarse, 0.35));
    let v = -rd;
    let r = reflect(rd, n);

    let rough = mix(0.155, 0.36, melt) + var_n * 2.2;
    let tint = mix(vec3f(0.82, 0.845, 0.87), vec3f(0.62, 0.44, 0.30), melt);

    // the environment reflection sparkles too as it crosses the hard edges of
    // the sources: where there is a lot of detail it blends toward a more
    // stable direction
    var spec = mix(studio(r), studio(normalize(mix(r, n, 0.5))),
                   clamp(var_n * 3.0, 0.0, 0.65)) * tint;
    let fres = pow(1.0 - max(dot(n, v), 0.0), 4.5);
    spec += vec3f(0.85, 0.92, 1.0) * fres * 0.30;

    let l1 = normalize(vec3f(-0.38, 0.66, 0.65));
    let l2 = normalize(vec3f(0.88, 0.02, -0.47));
    spec += vec3f(1.00, 0.96, 0.90) * ggx(n, v, l1, rough) * 1.05 * tint;
    spec += vec3f(0.36, 0.52, 0.86) * ggx(n, v, l2, rough) * 0.58 * tint;

    var ao = 0.5 * clamp(map(p + n * 0.030) / 0.030, 0.0, 1.0)
           + 0.5 * clamp(map(p + n * 0.090) / 0.090, 0.0, 1.0);
    ao = clamp(ao, 0.22, 1.0);
    spec *= mix(0.50, 1.0, ao);

    let pl = rot_y(spin) * (rot_x(1.06) * p);
    var hh = 0.35;
    if (length(pl.xz) < R && pl.y > 0.0) { hh = relief_at(pl.xz); }

    var emis = heat(mix(0.25, 1.0, hh) * (0.72 + 0.28 * sin(time * 0.9 + hh * 7.0)))
             * melt * (0.55 + 1.45 * hh);
    emis *= mix(0.55, 1.0, ao);

    col = spec + emis;
    col += vec3f(1.0, 0.92, 0.80) * flash * (0.5 + fres * 2.0);
  }

  let halo = exp(-length(uv - vec2f(0.0, -0.02)) * 2.2);
  col += vec3f(1.0, 0.42, 0.12) * halo * melt * 0.15;
  col += vec3f(1.0, 0.88, 0.72) * halo * flash * 0.8;

  // clamp before the post pass: the raymarch's fireflies at grazing angles turn
  // into white speckle once bloom amplifies them
  return vec4f(min(col, vec3f(5.0)), 1.0);
}
