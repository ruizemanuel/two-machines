import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const root = process.cwd();
const cache = path.join(root, ".vgpu-cache");
const loaderDir = path.join(cache, "loader");
fs.mkdirSync(loaderDir, { recursive: true });

const sh = (cmd, o = {}) => execSync(cmd, { encoding: "utf8", timeout: 300000, ...o });
const env = { ...process.env, VGPU_CACHE_DIR: cache };
const bin = path.join(root, "node_modules", ".bin", "vgpu");

// These already ship in the function's image; copying over them only breaks things.
const ALREADY_PRESENT = new Set([
  "libc.so.6", "libm.so.6", "libpthread.so.0", "libdl.so.2", "librt.so.1",
  "ld-linux-x86-64.so.2", "libgcc_s.so.1", "libstdc++.so.6", "libresolv.so.2",
]);

if (process.platform !== "linux") {
  console.log("prepare-vulkan: only applies on Linux; skipping on " + process.platform);
  process.exit(0);
}

console.log(sh(`"${bin}" install-software-renderer`, { env }).trim());
// Pinned version: the one Spike 0 validated. If Vercel changes the base image
// and it disappears, we want to find out here and not through differing pixels.
console.log(sh("dnf install -y vulkan-loader-1.3.296.0-72.amzn2023.0.1 libdrm zlib libzstd systemd-libs 2>&1 | tail -6").trim());

const copy = (src, name) => {
  const real = sh(`readlink -f ${src}`).trim();
  fs.copyFileSync(real, path.join(loaderDir, name ?? path.basename(src)));
  return real;
};

const loader = sh("find /usr/lib64 /usr/lib -name libvulkan.so.1* 2>/dev/null | head -1").trim();
if (!loader) throw new Error("could not obtain libvulkan.so.1 after installing vulkan-loader");
console.log("loader:", copy(loader, "libvulkan.so.1"));

const driver = sh(`find ${cache} -name libvulkan_lvp.so | head -1`).trim();
for (const line of sh(`ldd ${driver} 2>&1`).split("\n")) {
  const m = line.match(/^\s*(\S+)\s+=>\s+(\/\S+)\s+\(/);
  if (m && !ALREADY_PRESENT.has(m[1])) { copy(m[2], m[1]); console.log("dep:", m[1]); }
}

// the installer's tar.gz only takes up space in the bundle
const tgz = sh(`find ${cache} -name *.tar.gz | head -1`).trim();
if (tgz) fs.unlinkSync(tgz);

// verification: if this fails, the deployment is useless and we need to know here
const runEnv = { ...env, LD_LIBRARY_PATH: loaderDir };
const doctor = JSON.parse(sh(`"${bin}" doctor`, { env: runEnv }));
if (doctor.verdict !== "healthy") {
  console.error(JSON.stringify(doctor, null, 2));
  throw new Error("vgpu doctor: " + doctor.verdict + " — server-side render will not work");
}
// Golden images are only valid on this exact Mesa build.
if (!doctor.adapter.name.includes("Mesa 25.0.7")) {
  throw new Error("unexpected renderer: " + doctor.adapter.name + " — golden images must be revalidated");
}
console.log("doctor: healthy —", doctor.adapter.name);
