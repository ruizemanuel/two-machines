import { defineConfig } from "vitest/config";
import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite";

export default defineConfig({
  plugins: [wgslVitePlugin()],
  // .tsx included: the page tests (Tasks 12 and 13) are .test.tsx and a
  // .ts-only glob would never run them.
  test: { environment: "node", include: ["test/**/*.test.{ts,tsx}"] },
  // Next's tsconfig uses jsx: "preserve"; without this esbuild won't transform JSX.
  esbuild: { jsx: "automatic" },
});
