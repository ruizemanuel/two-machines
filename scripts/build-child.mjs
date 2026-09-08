// Node cannot import .ts or .wgsl. Bundle the child into one plain .mjs, with
// the vgpu packages left external so the native Dawn binding still resolves
// from node_modules at runtime.
import { build } from "esbuild";
import { transformWgsl } from "@vgpu/wgsl/loader-vite";
import fs from "node:fs/promises";

const wgsl = {
  name: "wgsl",
  setup(b) {
    b.onLoad({ filter: /\.wgsl$/ }, async (args) => {
      // transformWgsl is async and returns { code, map }, not a string. Without
      // the await and the .code, esbuild gets a Promise as `contents` and throws.
      const { code } = await transformWgsl(await fs.readFile(args.path, "utf8"), args.path);
      return { contents: code, loader: "js" };
    });
  },
};

await build({
  entryPoints: ["lib/render-child.ts"],
  outfile: "dist/render-child.mjs",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  external: ["vgpu", "vgpu/node", "@vgpu/*", "webgpu"],
  plugins: [wgsl],
});
console.log("dist/render-child.mjs listo");
