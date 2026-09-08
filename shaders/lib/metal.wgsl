// shaders/lib/metal.wgsl
// Almost entirely black. The shape of the metal is drawn by the EDGES of a few
// hard sources, not by the amount of light: with an even fill it reads as
// porcelain.
export fn studio(d: vec3f) -> vec3f {
  var c = vec3f(0.007, 0.009, 0.013);
  c = mix(c, vec3f(0.028, 0.033, 0.044), smoothstep(-0.02, 0.05, d.y));
  c = mix(c, vec3f(0.070, 0.082, 0.115), smoothstep(0.25, 0.95, d.y));

  let k = dot(d, normalize(vec3f(-0.38, 0.66, 0.65)));
  c += vec3f(1.00, 0.97, 0.92) * smoothstep(0.850, 0.882, k) * 1.45;
  c += vec3f(0.55, 0.56, 0.58) * smoothstep(0.55, 0.86, k) * 0.16;

  let tb = smoothstep(0.075, 0.052, abs(d.y - 0.27)) * smoothstep(-0.98, -0.34, d.x);
  c += vec3f(0.52, 0.66, 0.96) * tb * 0.72;

  let rk = dot(d, normalize(vec3f(0.88, 0.02, -0.47)));
  c += vec3f(0.24, 0.40, 0.78) * smoothstep(0.895, 0.942, rk) * 1.15;

  c += vec3f(0.026, 0.030, 0.040) * smoothstep(0.15, 1.0, d.z);
  c += vec3f(0.15, 0.11, 0.07) * pow(max(-d.y, 0.0), 2.2) * 0.55;
  return c;
}

export fn ggx(n: vec3f, v: vec3f, l: vec3f, rough: f32) -> f32 {
  let h = normalize(v + l);
  let a = rough * rough;
  let nh = max(dot(n, h), 0.0);
  let nv = max(dot(n, v), 0.0);
  let nl = max(dot(n, l), 0.0);
  let dd = a * a / (3.14159 * pow(nh * nh * (a * a - 1.0) + 1.0, 2.0) + 1e-5);
  let kk = a * 0.5;
  let g = (nl / (nl * (1.0 - kk) + kk)) * (nv / (nv * (1.0 - kk) + kk));
  return dd * g * nl;
}

/** Approximate black body, from deep red to pale yellow. */
export fn heat(t: f32) -> vec3f {
  let x = clamp(t, 0.0, 1.0);
  let a = vec3f(0.42, 0.020, 0.004);
  let b = vec3f(1.00, 0.300, 0.040);
  let c = vec3f(1.00, 0.780, 0.380);
  if (x < 0.55) { return mix(a, b, x / 0.55); }
  return mix(b, c, (x - 0.55) / 0.45);
}
