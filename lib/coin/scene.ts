// lib/coin/scene.ts
// The boundary of the project: it receives a Gpu, a Target and a flat state.
// No DOM, no canvas, no clock of its own — time arrives inside the state.
// Breaking this rule kills the server render, which is the whole concept.
//
// Targets are not destroyed here: Target does not expose destroy() in its type
// (only the OffscreenTarget class does), and gpu.dispose() releases everything.
import { effect, target, sampler, type Effect, type Gpu, type Target } from "vgpu";
import reliefSource from "../../shaders/relief.wgsl";
import coinSource from "../../shaders/coin.wgsl";
import brightSource from "../../shaders/bright.wgsl";
import blurSource from "../../shaders/blur.wgsl";
import postSource from "../../shaders/post.wgsl";
import type { CoinState } from "./state";
import { serialToWords } from "./words";

// Exported because the tests assert against these exact numbers. Copied as
// literals into a test file they would keep passing against a value the scene
// no longer uses, which is the one thing a pinned constant must not do.
export const RELIEF_SIZE = 512;
export const BLOOM_THRESHOLD = 0.85;
export const BLOOM_INTENSITY = 0.85;
export const EXPOSURE = 0.55;

const BLOOM_DIVISOR = 4;
const BLUR_PASSES = [1.0, 2.4];

export type Scene = {
  /** null while the coin is molten: nothing has been struck yet. */
  setSerial(serial: string | null): void;
  resize(width: number, height: number): void;
  render(destination: Target, state: CoinState): void;
};

export function createScene(gpu: Gpu, width: number, height: number): Scene {
  let w = width, h = height;
  let bw = Math.max(1, Math.floor(w / BLOOM_DIVISOR));
  let bh = Math.max(1, Math.floor(h / BLOOM_DIVISOR));

  const reliefTarget = target(gpu, { size: [RELIEF_SIZE, RELIEF_SIZE], format: "r16float" });
  let sceneTarget = target(gpu, { size: [w, h], format: "rgba16float" });
  let bloomA = target(gpu, { size: [bw, bh], format: "rgba16float" });
  let bloomB = target(gpu, { size: [bw, bh], format: "rgba16float" });

  // vgpu has no implicit sampler; every effect that samples a texture must be
  // handed one explicitly. sampler() is cached, so this is a stable identity.
  const linear = sampler(gpu, {
    magFilter: "linear", minFilter: "linear",
    addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge",
  });

  const reliefPass: Effect = effect(gpu, reliefSource, { label: "relief" });
  const coinPass: Effect = effect(gpu, coinSource, { label: "coin" });
  const brightPass: Effect = effect(gpu, brightSource, { label: "bright" });
  const blurPass: Effect = effect(gpu, blurSource, { label: "blur" });
  const postPass: Effect = effect(gpu, postSource, { label: "post" });

  let reliefDrawn = false;

  return {
    setSerial(serial) {
      const [hi, lo] = serial ? serialToWords(serial) : [0, 0];
      reliefPass.set({ serial_hi: hi, serial_lo: lo, serial_on: serial ? 1 : 0 }).draw(reliefTarget);
      reliefDrawn = true;
    },

    resize(nextW, nextH) {
      w = nextW; h = nextH;
      bw = Math.max(1, Math.floor(w / BLOOM_DIVISOR));
      bh = Math.max(1, Math.floor(h / BLOOM_DIVISOR));
      sceneTarget.resize([w, h]);
      bloomA.resize([bw, bh]);
      bloomB.resize([bw, bh]);
    },

    render(destination, state) {
      if (!reliefDrawn) {
        reliefPass.set({ serial_hi: 0, serial_lo: 0, serial_on: 0 }).draw(reliefTarget);
        reliefDrawn = true;
      }

      coinPass.set({
        res: [w, h],
        mouse: state.mouse,
        time: state.time,
        melt: state.melt,
        flash: state.flash,
        spin: state.spin,
        press: state.press,
        relief: reliefTarget.color, samp: linear,
      }).draw(sceneTarget);

      brightPass.set({
        source: sceneTarget.color, samp: linear,
        srcTexel: [1 / w, 1 / h],
        threshold: BLOOM_THRESHOLD,
      }).draw(bloomA);

      for (const separation of BLUR_PASSES) {
        blurPass.set({ source: bloomA.color, samp: linear, direction: [separation / bw, 0] }).draw(bloomB);
        blurPass.set({ source: bloomB.color, samp: linear, direction: [0, separation / bh] }).draw(bloomA);
      }

      postPass.set({
        scene: sceneTarget.color,
        bloom: bloomA.color,
        samp: linear,
        res: [w, h],
        // advance() sends time back to 0 the moment the coin freezes, and the
        // mint render passes 0 too. That is what makes the card the same frame
        // the visitor is looking at, grain included.
        grain: state.time % 17,
        exposure: EXPOSURE,
        bloomIntensity: BLOOM_INTENSITY,
      }).draw(destination);
    },
  };
}
