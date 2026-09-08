"use client";

// The live half of the argument: a WebGPU canvas that renders the same coin
// the server renders in lib/coin/scene.ts. No DOM, no navigator and no clock
// live in that module — this component is where those things are allowed.
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { init, surface, frameLoop, type FrameLoopHandle, type Gpu, type Surface } from "vgpu";
import { createScene, type Scene } from "../lib/coin/scene";
import { INITIAL, advance, alignedSpin, canonicalize, type CoinState, type Phase } from "../lib/coin/state";

const STRIKE_MS = 900;

// Duplicated from lib/coin/state.ts on purpose: that module does not export its
// easing curve, and the spin interpolation below needs the exact same shape
// advance() uses for melt so the coin does not visibly kink at the die strike.
const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export type MintResult = {
  readonly serial: string;
  readonly renderMs: number;
  readonly imageUrl: string;
};

export type CoinCanvasHandle = {
  /** Starts the strike animation. No-op unless the coin is currently molten. */
  strike(): void;
  /** Sends the coin back into the melt. No-op unless it is currently frozen. */
  remelt(): void;
};

export type CoinCanvasProps = {
  /** Fired whenever the coin's phase changes, so the page can drive the button
   *  label and the two indicators without owning the animation itself. */
  onPhaseChange(phase: Phase): void;
  /** Fired once the server round trip for a strike succeeds. A failed request
   *  is left alone here — Task 13 is where that gets a real fallback. */
  onMinted(result: MintResult): void;
};

type Anim = {
  state: CoinState;
  phase: Phase;
  spinFrom: number;
  spinTo: number;
  strikeStart: number;
};

async function requestMint(state: CoinState): Promise<MintResult | null> {
  const q = new URLSearchParams({
    spin: String(state.spin),
    melt: String(state.melt),
    mx: String(state.mouse[0]),
    my: String(state.mouse[1]),
  });
  try {
    const res = await fetch(`/api/mint?${q}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return {
      serial: res.headers.get("x-serial") ?? "",
      renderMs: Number(res.headers.get("x-render-ms") ?? "0"),
      imageUrl: URL.createObjectURL(blob),
    };
  } catch {
    // Network failure, aborted request, etc. Task 13 turns this into the
    // "servidor · sin respuesta" indicator; here it just leaves the coin frozen.
    return null;
  }
}

export const CoinCanvas = forwardRef<CoinCanvasHandle, CoinCanvasProps>(function CoinCanvas(
  { onPhaseChange, onMinted },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const readyRef = useRef(false);
  // Mutable animation state, updated once per frame outside React: a setState
  // per tick would fight the 60 fps loop for no benefit, since nothing outside
  // the canvas needs to see the in-between frames — only the phase changes do.
  const animRef = useRef<Anim>({
    state: INITIAL,
    phase: "molten",
    spinFrom: 0,
    spinTo: 0,
    strikeStart: 0,
  });

  useImperativeHandle(ref, () => ({
    strike() {
      const a = animRef.current;
      if (!readyRef.current || a.phase !== "molten") return;
      a.phase = "striking";
      a.spinFrom = a.state.spin;
      a.spinTo = alignedSpin(a.state.spin);
      a.strikeStart = performance.now();
      onPhaseChange("striking");
    },
    remelt() {
      const a = animRef.current;
      if (!readyRef.current || a.phase !== "frozen") return;
      a.phase = "molten";
      onPhaseChange("molten");
    },
  }), [onPhaseChange]);

  useEffect(() => {
    // navigator only exists client-side; this effect never runs during the
    // server render, but the guard keeps the intent explicit. A browser with no
    // WebGPU simply never starts the loop — the fallback UI for that case is
    // Task 13's StaticFallback, not this component.
    if (typeof navigator === "undefined" || !("gpu" in navigator)) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let gpu: Gpu | null = null;
    let loop: FrameLoopHandle | null = null;

    void (async () => {
      const initialized = await init();
      if (cancelled) { initialized.dispose(); return; }
      gpu = initialized;

      // Drawing onto a Surface only ever happens inside frame()/frameLoop() —
      // VGPU-SURFACE-NOT-IN-FRAME otherwise — so every render() call below has
      // to live inside the frameLoop callback, never called eagerly out here.
      const target: Surface = surface(gpu, canvas);
      const scene: Scene = createScene(gpu, target.size[0], target.size[1]);
      target.onResize(({ width, height }) => scene.resize(width, height));

      let last = performance.now();
      readyRef.current = true;

      loop = frameLoop(gpu, () => {
        const now = performance.now();
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;

        const a = animRef.current;
        if (a.phase === "striking") {
          const k = Math.min((now - a.strikeStart) / STRIKE_MS, 1);
          const eased = advance(a.state, "striking", dt, k);
          a.state = { ...eased, spin: a.spinFrom + (a.spinTo - a.spinFrom) * easeInOutCubic(k) };
          if (k >= 1) {
            a.phase = "frozen";
            // time back to 0 here too: the mint render freezes it at 0, and the
            // live coin has to be showing the same frame it is asking for.
            const frozen = canonicalize({ ...a.state, spin: a.spinTo, melt: 0, press: 0, flash: 0, time: 0 });
            a.state = frozen;
            onPhaseChange("frozen");
            void requestMint(frozen).then((result) => { if (result) onMinted(result); });
          }
        } else {
          a.state = advance(a.state, a.phase, dt, 0);
        }
        scene.render(target, a.state);
      }, { fps: 60 });
    })();

    return () => {
      cancelled = true;
      readyRef.current = false;
      loop?.stop();
      gpu?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onPhaseChange/onMinted are stable useCallback identities from the page.
  }, []);

  return <canvas ref={canvasRef} aria-hidden />;
});
