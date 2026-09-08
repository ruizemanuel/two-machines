@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> srcTexel: vec2f;
@group(0) @binding(3) var<uniform> threshold: f32;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // box of 4 on downsample: a single sample aliases just the sparks we want to smooth
  var s = textureSampleLevel(source, samp, uv + srcTexel * vec2f(-0.5, -0.5), 0.0).rgb;
  s += textureSampleLevel(source, samp, uv + srcTexel * vec2f( 0.5, -0.5), 0.0).rgb;
  s += textureSampleLevel(source, samp, uv + srcTexel * vec2f(-0.5,  0.5), 0.0).rgb;
  s += textureSampleLevel(source, samp, uv + srcTexel * vec2f( 0.5,  0.5), 0.0).rgb;
  return vec4f(max(s * 0.25 - vec3f(threshold), vec3f(0.0)), 1.0);
}
