@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var bloom: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var<uniform> res: vec2f;
@group(0) @binding(4) var<uniform> grain: f32;
@group(0) @binding(5) var<uniform> exposure: f32;
@group(0) @binding(6) var<uniform> bloomIntensity: f32;

fn hash1(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let c = uv - 0.5;
  let r2 = dot(c, c);

  var col = vec3f(
    textureSampleLevel(scene, samp, uv + c * r2 * 0.009, 0.0).r,
    textureSampleLevel(scene, samp, uv, 0.0).g,
    textureSampleLevel(scene, samp, uv - c * r2 * 0.009, 0.0).b,
  );

  col += textureSampleLevel(bloom, samp, uv, 0.0).rgb * bloomIntensity;

  col = vec3f(1.0) - exp(-col * exposure);
  col = pow(col, vec3f(0.94));
  col *= 1.0 - 0.60 * smoothstep(0.10, 0.80, r2);
  col += (hash1(uv * res + grain) - 0.5) * 0.024;

  return vec4f(max(col, vec3f(0.0)), 1.0);
}
