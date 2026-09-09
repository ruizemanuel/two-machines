// Two functions render, not one: /api/mint and the OG card, which imports the
// same route and also spawns the child. Tracing only the first one deploys the
// second without .vgpu-cache and without the child, and returns 500 exactly on
// the route that is the whole point of the piece.

// node_modules/webgpu/** would carry all four Dawn prebuilds plus a Windows
// DLL: 47 MB of binaries that can never be loaded on Vercel, against a function
// budget of 100 MB the spike already measured at 82 MB with less in it.
//
// These three files are the whole runtime surface of the package. index.js
// resolves the binding by platform —
//   join(__dirname, 'dist', `${process.platform}-${arch}.dawn.node`)
// — so on Vercel's linux-x64 only that one is ever opened, and nothing else in
// the package names the others (read it: it is fourteen lines). package.json is
// what makes `webgpu` resolvable at all; build/ is the postinstall downloader
// and types.d.ts is types, neither of which runs.
//
// It has to be a narrower include and not an exclude: measured, an
// outputFileTracingExcludes entry does nothing against files a glob in
// outputFileTracingIncludes pulled in — with node_modules/webgpu/** above, all
// four prebuilds still travelled. It does apply to what the tracer finds by
// itself, which is what DEAD_PREBUILDS below is for.
//
// Every number here comes from .next/server/app/api/mint/route.js.nft.json,
// which lists every file the function ships: 87,0 MB traced before this,
// 36,9 MB after.
const WEBGPU_FILES = [
  "node_modules/webgpu/package.json",
  "node_modules/webgpu/index.js",
  "node_modules/webgpu/dist/linux-x64.dawn.node",
];

// The tracer resolves that platform-dependent require against the machine doing
// the build, so a build on Windows or macOS adds its own prebuild on top of the
// include. Vercel builds on linux-x64, where that lands on the binary already
// listed; excluding the three that can never run there keeps a local build
// honest about what would deploy.
// lib/gpu-server.ts walks the cache directory with readdirSync, and a dynamic
// filesystem read makes the tracer keep the whole project to be safe. The first
// deployed function listed the docs, the tests, the reference mockup and fifteen
// loose screenshots among its own files. None of that can be reached at runtime,
// and the room it wastes is the room the renderer archive needs.
const NOT_AT_RUNTIME = [
  "docs/**",
  "test/**",
  "reference/**",
  "scripts/**",
  "*.png",
  "*.tsbuildinfo",
];

const DEAD_PREBUILDS = [
  "node_modules/webgpu/dist/darwin-universal.dawn.node",
  "node_modules/webgpu/dist/linux-arm64.dawn.node",
  "node_modules/webgpu/dist/win32-x64.dawn.node",
];

const RENDER_FILES = [
  ".vgpu-cache/**",
  "dist/render-child.mjs",
  ...WEBGPU_FILES,
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
  outputFileTracingExcludes: {
    "/api/mint": [...DEAD_PREBUILDS, ...NOT_AT_RUNTIME],
    "/opengraph-image": [...DEAD_PREBUILDS, ...NOT_AT_RUNTIME],
  },
  outputFileTracingIncludes: {
    "/api/mint": RENDER_FILES,
    "/opengraph-image": RENDER_FILES,
  },
};
export default config;
