// Two functions render, not one: /api/mint and the OG card, which imports the
// same route and also spawns the child. Tracing only the first one deploys the
// second without .vgpu-cache and without the child, and returns 500 exactly on
// the route that is the whole point of the piece.
const RENDER_FILES = [
  ".vgpu-cache/**",
  "dist/render-child.mjs",
  "node_modules/webgpu/**",
  "node_modules/vgpu/**",
  "node_modules/@vgpu/**",
];

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
  outputFileTracingIncludes: {
    "/api/mint": RENDER_FILES,
    "/opengraph-image": RENDER_FILES,
  },
};
export default config;
