import path from "node:path";
import fs from "node:fs";
import { init, type NodeGpu } from "vgpu/node";
import { target } from "vgpu";
import type { Gpu, Target } from "vgpu";

/** Where the deployed bundle lives. This is the one string that decides whether
 *  the render child and the Vulkan cache can be found in production, so it is
 *  computed once and imported, never re-derived at a second call site. */
export const ROOT = process.env.VERCEL ? "/var/task" : process.cwd();
const CACHE = path.join(ROOT, ".vgpu-cache");

/** The ICD manifest that vgpu downloads carries a relative path; at runtime it
 *  has to be rewritten absolute, and /tmp is the only writable location. */
export function prepareIcd(): string | null {
  const find = (dir: string, name: string): string | null => {
    let hits: string[] = [];
    const walk = (d: string, depth: number) => {
      if (depth > 5 || hits.length) return;
      let entries: fs.Dirent[] = [];
      try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p, depth + 1);
        else if (e.name === name) hits.push(p);
      }
    };
    walk(dir, 0);
    return hits[0] ?? null;
  };

  const manifest = find(CACHE, "lvp_icd.json");
  const driver = find(CACHE, "libvulkan_lvp.so");
  if (!manifest || !driver) return null;

  const json = JSON.parse(fs.readFileSync(manifest, "utf8"));
  if (json.ICD) json.ICD.library_path = driver;
  const out = "/tmp/lvp_icd.json";
  fs.writeFileSync(out, JSON.stringify(json));
  return out;
}

export function childEnv(): NodeJS.ProcessEnv {
  const loader = path.join(CACHE, "loader");
  const icd = prepareIcd();
  return {
    ...process.env,
    VGPU_CACHE_DIR: CACHE,
    LD_LIBRARY_PATH: [loader, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":"),
    ...(icd ? { VK_ICD_FILENAMES: icd, VK_DRIVER_FILES: icd } : {}),
  };
}

let cached: NodeGpu | null = null;

/** One Dawn device per process. Every init() creates a new device and Dawn keeps
 *  polling until it is disposed, which otherwise leaves vitest workers hanging.
 *
 *  NodeGpu and not Gpu: `adapter` exists only on the node entrypoint's handle,
 *  and expectGolden needs it to refuse pixels from the wrong renderer. */
export async function sharedGpu(): Promise<NodeGpu> {
  // "software" is not a fallback here, it is the contract: golden images are
  // only stable on the pinned CPU renderer.
  cached ??= await init({ adapter: "software" });
  return cached;
}

export async function disposeGpu(): Promise<void> {
  cached?.dispose();   // sync: Gpu.dispose() returns void, not a promise
  cached = null;
}

export async function renderHeadless(
  draw: (gpu: Gpu, target: Target) => void,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const gpu = await sharedGpu();
  const t = target(gpu, { size: [width, height], format: "rgba8unorm" });
  draw(gpu, t);
  return await t.read();
}
