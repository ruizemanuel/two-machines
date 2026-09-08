// shaders/lib/sdf.wgsl
export fn sd_circle(p: vec2f, r: f32) -> f32 { return length(p) - r; }

export fn sd_segment(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

/** Signed distance to a triangle. Negative inside. */
export fn sd_triangle(p: vec2f, a: vec2f, b: vec2f, c: vec2f) -> f32 {
  let e0 = b - a; let e1 = c - b; let e2 = a - c;
  let v0 = p - a; let v1 = p - b; let v2 = p - c;
  let p0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  let p1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  let p2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  let s = sign(e0.x * e2.y - e0.y * e2.x);
  let d = min(min(vec2f(dot(p0, p0), s * (v0.x * e0.y - v0.y * e0.x)),
                  vec2f(dot(p1, p1), s * (v1.x * e1.y - v1.y * e1.x))),
                  vec2f(dot(p2, p2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
