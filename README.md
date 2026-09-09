# Two machines

The thumbnail of this page is drawn by a computer with no graphics card.

There is no PNG in this repo. The coin you see is a formula — three WGSL passes on `vgpu` — and that same formula runs in two places: in your browser, on your GPU, when you press "Mint"; and on the server, with no GPU, when that mint calls `/api/mint` to generate the link preview whoever receives the link will see. The point of the piece is that the two correspond — with the caveat in the next section.

## The one sentence allowed about the renderer

This piece never says "deterministic" flatly, because between different GPUs it is not. The permitted phrasing is:

> **"bit-identical on the pinned CPU renderer"**

Measured in Spike 0: four consecutive calls to the server return the same sha256 — **0 differing pixels**. The same shader, run locally on a real D3D12 GPU and compared against the server's `llvmpipe`, gives **6,667 differing pixels out of 756,000 (0.88%)**. That difference is real and expected: every GPU rounds differently. Which is why the server does not use "your graphics card, whichever it is" — it always uses the same pinned software renderer (Mesa 25.0.7), and the tests' golden images are only ever compared against that renderer, never against a real GPU.

## Running it locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The canvas uses your real GPU through WebGPU; if the browser does not support it, the page degrades to the server's PNG full-bleed with the headline over it — never to an `Error:` on screen.

`npm run dev` first triggers the `predev` script, which builds `dist/render-child.mjs` with esbuild. That child is what renders on the server, and `dist/` is not in the repo, so without that step `/api/mint` would answer 500 on a fresh clone. To build it on its own — to run just the route, say — use `npm run build:child`.

`/api/mint` renders without a GPU locally too — it takes the same child-process path production does — but it needs the software renderer installed first:

```bash
npx vgpu install-software-renderer
npx vgpu doctor
```

This **does not work on Windows or macOS**: vgpu's software renderer only exists on Linux (`VGPU-NODE-SOFTWARE-RENDERER-UNSUPPORTED`). On a Windows checkout, `npm run dev` serves the page and the browser canvas works normally, but `/api/mint` has no adapter and the preview card never appears. Testing that path takes Linux, WSL or Docker.

### Tests

```bash
npm test
```

Runs the whole suite with Vitest. The pure tests — state, serial number, PNG encoder, the bitmap font — run anywhere. The suites that need a GPU (`describe.skipIf(!SOFTWARE)`) skip off Linux: on Windows the full suite is **PASS with tests skipped and zero `failed`**. A single `failed` is a real regression; a `skipped` on Windows is not.

The budget tests (`test/budgets.test.ts`) that measure the client bundle skip when `.next` is absent — build first:

```bash
npx next build
npm test
```

`test/contract.test.ts` is the only end-to-end test against a real deployment; it does not run unless given a URL (see "Deploying", below).

## Why `scripts/prepare-vulkan.mjs` exists

Vercel's runtime (Amazon Linux 2023) ships neither the Vulkan *loader* nor the libraries `lavapipe` needs — the software renderer the server uses. Without this script a fresh deployment starts, takes a request on `/api/mint`, and fails: there is no GPU adapter in the runtime image, real or software.

`scripts/prepare-vulkan.mjs` runs as a build step (`npm run vercel-build`) and:

1. Installs `vgpu install-software-renderer` into `.vgpu-cache`.
2. Installs, with `dnf`, the exact loader Spike 0 validated — `vulkan-loader-1.3.296.0-72.amzn2023.0.1` — along with `libdrm`, `zlib`, `libzstd` and `systemd-libs`.
3. Copies `libvulkan.so.1` and the `lavapipe` dependencies the runtime image does not already carry into the bundle.
4. Runs `vgpu doctor` against that bundle and **fails the build** if the verdict is not `healthy`, or if the adapter does not contain `Mesa 25.0.7` — the exact version every golden image validates against. A green build on the wrong Mesa would be worse than a red one: it would leave a server deployed whose pixels no longer match what the tests say it produces.

It also keeps the renderer's `.tar.gz` in the cache, which looks like free bundle space and is not: vgpu verifies that archive's pinned sha256 before loading the renderer, and that check is how it knows the driver was not tampered with. Deleting it makes every `init({ adapter: "software" })` answer `VGPU-NODE-SOFTWARE-RENDERER-MISSING`.

Without this step, cloning the repo and deploying with no manual work — this project's acceptance criterion — is not possible: `/api/mint` would answer 500 on every call.

## How the golden images are made

No golden image can be generated on the development machine: vgpu's software renderer does not exist on Windows or macOS, and `init()` in `auto` mode picks the real GPU — a golden "generated" there would carry D3D12 pixels under a Mesa filename, exactly the mistake the guard in `test/helpers/golden.ts` exists to prevent.

The only path is the manual `bootstrap-goldens` job in `.github/workflows/ci.yml`:

1. Run the workflow by hand (`workflow_dispatch`) from GitHub Actions.
2. The job runs the full suite with `UPDATE_GOLDEN=1` on Linux, on the pinned renderer, and uploads the resulting PNGs as an artifact — it does not commit them.
3. Download the artifact and **look at every image**.
4. Commit the PNGs by hand into `test/golden/`, under the name that already carries the Mesa version (`coin-frozen@mesa-25.0.7.png`). If vgpu changes Mesa, or Vercel changes its base image, the golden test fails on a missing file rather than on a pixel difference — a far easier failure to diagnose.

One thing to know before judging that first artifact: `relief`, `coin-frozen` and `coin-molten` are raw linear buffers with no tone mapping, so the coin reads much darker and flatter there than it does on the page. `scene-frozen` is the one that has been through the post chain. Do not reject a correct render for looking wrong.

From then on, CI's `test` job compares against them with zero tolerance on every push.

## Budgets

The §12 target is 60 KB gzip of JavaScript, vgpu included. Measured after `npx next build`, over the chunks under `.next/static/chunks`:

| | gzip |
|---|---|
| **The piece** (vgpu + `lib/coin/scene.ts` + the page) | **51.8 KB** |
| React + the Next runtime | ~156 KB |
| **Total JavaScript the visitor downloads** | **221.2 KB** |

The 60 KB budget was always about what this piece controls — vgpu, the scene and the page — and there it holds with room to spare. The framework is not in that number because no care taken here would shrink it: it is reported, not capped. Both figures are published so neither is hidden.

That 51.8 KB was not free. `lib/coin/scene.ts`, which runs in the browser, imported `serialToWords` from `lib/coin/serial.ts` — and `serial.ts` imports `node:crypto` for the serial number's hash. Because `components/CoinCanvas.tsx` is a client component that reaches `scene.ts`, Turbopack bundled all of Node's `crypto` and `Buffer` for the browser — sha256, md5, ripemd, base64 — for four lines of `parseInt`. Splitting that function into `lib/coin/words.ts`, which depends on nothing from Node, took the total from 348.9 KB to 221.2 KB: **127.7 KB** for splitting one file in two.

Those figures are **221.2 KB of JavaScript**: they include neither the CSS chunk Next serves nor the two web fonts in the section below.

### How long minting takes

| | measured in production |
|---|---|
| Minting a state nobody asked for before | **7.7 s** warm, 10.5 s cold |
| Asking again for a state already minted | **0.32 s**, `X-Vercel-Cache: HIT` |

The spec asked for 1.5 s, measured in Spike 0 on a trivial scene. This is not one, and the number was renegotiated to where the measurement is. It is worth knowing why it does not come down: **it does not depend on size** — 7.7 s at 1200×630 against 8.6 s at 1600×900 — so it is not the pixels, it is the fixed cost of each request: spawning the child process, starting Dawn, and compiling the shaders. Rendering smaller does not fix it. Making the raymarch cheaper would, at the price of changing how the coin looks and having to regenerate the golden images.

Those seconds are paid by whoever mints something new, with the `server · rendering…` indicator there for exactly that. Whoever receives the link does not pay them: that state already exists and the CDN serves it.

### Assets

There is no PNG, WOFF or GLB of our own in the repo: `public/` is empty and `test/budgets.test.ts` verifies it by walking the directory. The coin — the disc, the denticles, the `VGPU.SH` legend and the serial number — comes entirely out of the `.wgsl` files, with the 5×7 bitmap font embedded as `u32` constants in `shaders/lib/font5x7.wgsl`.

With one exception, worth stating rather than rounding to zero: **`app/layout.tsx` loads Geist and Geist Mono from Google Fonts**, so the visitor does download two web fonts. They are the interface's — the headline, the indicators, the button — and they are the only exception to zero assets. **Neither enters the render:** neither the canvas nor the server's PNG touches them, which is why a server with no GPU and no fonts installed can draw the same coin.

## Deploying

This repo does not ship a deployment — it is run by whoever holds the project's Vercel account:

```bash
npx vercel deploy --prod
```

`vercel-build` runs `prepare-vulkan.mjs` and `build-child.mjs` before `next build`, so the step above already leaves the server with the software renderer installed and the render child bundled.

After deploying, check by hand that both functions answer — the link preview is the one most easily deployed broken, because it needs its own entry in `outputFileTracingIncludes`:

```bash
curl -I "https://<your-domain>/api/mint?spin=0&melt=0&w=1200&h=630"
curl -I "https://<your-domain>/opengraph-image"
```

Both must answer `200` and carry the `x-serial` header. And to check acceptance criterion 3 (the mint budget) against the real deployment:

```bash
MINT_URL="https://<your-domain>" npx vitest run test/contract.test.ts
```

That test is off by default (`describe.skipIf(!MINT_URL)`) precisely so the whole suite can run without a deployment on hand.
