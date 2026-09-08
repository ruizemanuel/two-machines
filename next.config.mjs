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
  // next build/dev otherwise writes AGENTS.md and a one-line CLAUDE.md into the
  // repo root on every run. This repo is a public argument; it carries only what
  // its author put there.
  agentRules: false,
  // The native Dawn binding is loaded with a runtime-computed require() inside
  // node_modules/webgpu, which no bundler can resolve statically. These three are
  // already listed in outputFileTracingIncludes, so they travel as files and are
  // resolved from node_modules at runtime — this just stops Next trying to bundle
  // them first.
  serverExternalPackages: ["vgpu", "@vgpu/adapter-node", "webgpu"],
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
