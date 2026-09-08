const config = {
  turbopack: {
    rules: { "*.wgsl": { loaders: ["@vgpu/wgsl/loader-webpack"], as: "*.js" } },
  },
  // Turbopack is the default bundler, but any path that falls back to webpack
  // (a flag, a future version) would be left without a .wgsl loader and the
  // failure would be "Module parse failed", which looks nothing like the cause.
  // It costs three lines.
  webpack(cfg) {
    cfg.module.rules.push({ test: /\.wgsl$/, use: "@vgpu/wgsl/loader-webpack" });
    return cfg;
  },
};
export default config;
