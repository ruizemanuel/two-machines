// 9-tap gaussian on one axis. Applied twice, horizontal and vertical:
// that is what makes it separable, and thus linear instead of quadratic.
//
// 'direction' not 'step': step() is a predeclared WGSL function and a
// var<uniform> with that name would shadow it across the whole module.
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> direction: vec2f;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var c = textureSampleLevel(source, samp, uv, 0.0).rgb * 0.227027;
  c += (textureSampleLevel(source, samp, uv + direction * 1.0, 0.0).rgb
      + textureSampleLevel(source, samp, uv - direction * 1.0, 0.0).rgb) * 0.1945946;
  c += (textureSampleLevel(source, samp, uv + direction * 2.0, 0.0).rgb
      + textureSampleLevel(source, samp, uv - direction * 2.0, 0.0).rgb) * 0.1216216;
  c += (textureSampleLevel(source, samp, uv + direction * 3.0, 0.0).rgb
      + textureSampleLevel(source, samp, uv - direction * 3.0, 0.0).rgb) * 0.0540540;
  c += (textureSampleLevel(source, samp, uv + direction * 4.0, 0.0).rgb
      + textureSampleLevel(source, samp, uv - direction * 4.0, 0.0).rgb) * 0.0162162;
  return vec4f(c, 1.0);
}
