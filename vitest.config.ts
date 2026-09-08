import { defineConfig } from "vitest/config";
import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite";

export default defineConfig({
  plugins: [wgslVitePlugin()],
  // .tsx included: the page tests (Tasks 12 and 13) are .test.tsx and a
  // .ts-only glob would never run them.
  test: { environment: "node", include: ["test/**/*.test.{ts,tsx}"] },
  // Next's tsconfig uses jsx: "preserve", so the bundler has to transform the JSX
  // in the .test.tsx files that arrive with later tasks. Vitest 5 runs on Vite 8
  // and transforms with oxc, not esbuild: an `esbuild: { jsx }` key here does
  // nothing and prints a warning on every run. oxc already defaults to the
  // automatic runtime; it is declared explicitly so the config does not depend
  // on that default.
  oxc: { jsx: { runtime: "automatic" } },
});
