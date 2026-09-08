import { defineConfig } from "vitest/config";
import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite";

export default defineConfig({
  plugins: [wgslVitePlugin()],
  // .tsx included: the page and fallback tests are .test.tsx and a .ts-only
  // glob would never run them.
  //
  // globals: true — required by @testing-library/react's automatic
  // per-test cleanup(): it only registers itself when a bare `afterEach`
  // exists in global scope (see its dist/index.js), and Vitest does not put
  // one there unless this flag is set. Without it, every `render()` inside a
  // single .test.tsx file keeps appending to document.body — verified by
  // hand: a second render() in the same file sees the first render's nodes
  // still mounted — so a file with more than one `it()` block that renders
  // the same component fails with "multiple elements found" on any text
  // that appears in every render, not because the component is wrong.
  // Purely additive: no existing test file declares a local `test`,
  // `expect`, `it`, `describe`, `afterEach`, etc. that this would shadow.
  test: { environment: "node", include: ["test/**/*.test.{ts,tsx}"], globals: true },
  // Next's tsconfig uses jsx: "preserve", so the bundler has to transform the JSX
  // in the .test.tsx files. Vitest 5 runs on Vite 8 and transforms with oxc,
  // not esbuild: an `esbuild: { jsx }` key here does
  // nothing and prints a warning on every run. oxc already defaults to the
  // automatic runtime; it is declared explicitly so the config does not depend
  // on that default.
  oxc: { jsx: { runtime: "automatic" } },
});
