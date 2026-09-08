"use client";

// The live half of the argument: a WebGPU canvas that renders the same coin
// the server renders in lib/coin/scene.ts. No DOM, no navigator and no clock
// live in that module — this component is where those things are allowed.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { init, surface, frameLoop, type FrameLoopHandle, type Gpu, type Surface } from "vgpu";
import { createScene, type Scene } from "../lib/coin/scene";
import { INITIAL, advance, alignedSpin, canonicalize, type CoinState, type Phase } from "../lib/coin/state";
import StaticFallback from "./StaticFallback";

const STRIKE_MS = 900;
// Ported from the mockup, not reinvented: the camera closes 5% of the distance
// to the pointer per frame, which reads as the coin leaning rather than
// snapping. Anything faster turns the molten disc into a mirror of the cursor.
const MOUSE_LERP = 0.05;

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
  /** Fired once the server round trip for a strike succeeds. */
  onMinted(result: MintResult): void;
  /** Fired when that round trip fails — a bad status or a network error. The
   *  coin itself is already frozen locally (striking happened before this
   *  request was ever sent), so this only drives the server indicator into
   *  "sin respuesta"; nothing about the coin on screen changes. */
  onMintFailed(): void;
  /** Fired once when the live render is off the table and StaticFallback takes
   *  the frame: no WebGPU at all, or init() failing twice. The page needs to
   *  hear it — otherwise it keeps offering an "Acuñar" button that can no
   *  longer strike anything, over an image the server already rendered. */
  onUnavailable(reason: Unavailable): void;
};

export type Unavailable = "no-webgpu" | "device-lost";

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
    // Network failure, aborted request, etc. Reported the same way as a
    // non-OK response above: both simply mean the server did not answer. The
    // caller turns a null result into the "servidor · sin respuesta"
    // indicator; the coin itself stays frozen either way.
    return null;
  }
}

export const CoinCanvas = forwardRef<CoinCanvasHandle, CoinCanvasProps>(function CoinCanvas(
  { onPhaseChange, onMinted, onMintFailed, onUnavailable },
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
  // A mint request belongs to one strike. Melting back down and striking again
  // while the first request is still in flight would otherwise let the older
  // response land on top of the newer one, or land at all after a remelt — the
  // card would show a coin that is not the one on screen, which is the exact
  // claim this page makes. Bumped on every strike and every remelt; a response
  // whose generation no longer matches is dropped and its blob released.
  const mintGenRef = useRef(0);
  // The serial the coin's face should carry, or null while it is molten. The
  // browser cannot compute it — serialFromState hashes with node:crypto and
  // stays on the server — so it arrives with the mint response and is applied
  // in the frame callback below, which is the only place the scene is known to
  // exist and not to have been disposed.
  const serialRef = useRef<string | null>(null);
  // Where the pointer is, in the same [-1, 1] box the shader's camera expects.
  // CoinState.mouse holds the smoothed value that actually reaches the scene;
  // this is only the target it is chasing.
  const pointerRef = useRef<readonly [number, number]>([0, 0]);
  // prefers-reduced-motion, read live. The mockup honoured it in two places and
  // the port dropped both: the idle spin stops, and state.time is pinned at 0 —
  // scene.ts derives the film grain from it, so the grain stops crawling too.
  const reducedRef = useRef(false);
  // Set once WebGPU is confirmed absent, or once init() has failed twice in a
  // row. Stays null through the very first render — including hydration — so
  // the server-rendered markup and the first client render match; the switch
  // to StaticFallback happens inside the client-only effect below, as an
  // ordinary post-mount state update rather than a hydration mismatch.
  const [fallback, setFallback] = useState<Unavailable | null>(null);

  // One place to enter the degraded state, so the page can never be told a
  // different story from the one on screen.
  const degrade = (reason: Unavailable) => {
    setFallback(reason);
    onUnavailable(reason);
  };

  const strike = useCallback(() => {
    const a = animRef.current;
    if (!readyRef.current || a.phase !== "molten") return;
    mintGenRef.current += 1;
    a.phase = "striking";
    a.spinFrom = a.state.spin;
    a.spinTo = alignedSpin(a.state.spin);
    a.strikeStart = performance.now();
    onPhaseChange("striking");
  }, [onPhaseChange]);

  const remelt = useCallback(() => {
    const a = animRef.current;
    if (!readyRef.current || a.phase !== "frozen") return;
    mintGenRef.current += 1;
    a.phase = "molten";
    // Molten metal carries no serial: the face has to go blank again, or the
    // coin keeps a number it no longer has.
    serialRef.current = null;
    onPhaseChange("molten");
  }, [onPhaseChange]);

  useImperativeHandle(ref, () => ({ strike, remelt }), [strike, remelt]);

  // The mockup let the canvas take the click too, and app/globals.css still
  // carries its `cursor: pointer` — the affordance without the action. This
  // restores the action rather than dropping the affordance, through the same
  // two methods the button drives; both are no-ops outside their phase, so a
  // click during the strike does nothing. The button stays the keyboard path:
  // the canvas is aria-hidden and never becomes the only way in.
  const handleCanvasClick = useCallback(() => {
    const { phase } = animRef.current;
    if (phase === "molten") strike();
    else if (phase === "frozen") remelt();
  }, [strike, remelt]);

  // The pointer and the motion preference are DOM, so they are read here and
  // reach lib/coin/scene.ts only as numbers inside CoinState. Both listeners
  // come off on the same path they went on, like the GPU below.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPointer = (event: PointerEvent) => {
      pointerRef.current = [
        (event.clientX / window.innerWidth) * 2 - 1,
        1 - (event.clientY / window.innerHeight) * 2,
      ];
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
    reducedRef.current = motion?.matches ?? false;
    const onMotion = (event: MediaQueryListEvent) => { reducedRef.current = event.matches; };
    motion?.addEventListener("change", onMotion);

    return () => {
      window.removeEventListener("pointermove", onPointer);
      motion?.removeEventListener("change", onMotion);
    };
  }, []);

  useEffect(() => {
    // navigator only exists client-side; this effect never runs during the
    // server render, but the guard keeps the intent explicit. A browser with
    // no WebGPU degrades to StaticFallback instead of ever starting the loop.
    if (typeof navigator === "undefined") return;
    if (!("gpu" in navigator)) {
      degrade("no-webgpu");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let gpu: Gpu | null = null;
    let loop: FrameLoopHandle | null = null;

    void (async () => {
      let initialized: Gpu;
      try {
        initialized = await init();
      } catch {
        // One retry: a transient failure — a lost device, a driver hiccup —
        // often succeeds on the second attempt. A second failure is treated
        // as a real device loss and degrades to the server's PNG instead of
        // retrying forever.
        try {
          initialized = await init();
        } catch {
          if (!cancelled) degrade("device-lost");
          return;
        }
      }
      if (cancelled) { initialized.dispose(); return; }
      gpu = initialized;

      // Drawing onto a Surface only ever happens inside frame()/frameLoop() —
      // VGPU-SURFACE-NOT-IN-FRAME otherwise — so every render() call below has
      // to live inside the frameLoop callback, never called eagerly out here.
      const target: Surface = surface(gpu, canvas);
      const scene: Scene = createScene(gpu, target.size[0], target.size[1]);
      target.onResize(({ width, height }) => scene.resize(width, height));

      let last = performance.now();
      // What the relief target currently carries. Local to this scene, not a
      // ref: a second mount builds a new scene whose face starts blank again.
      let engraved: string | null = null;
      readyRef.current = true;

      loop = frameLoop(gpu, () => {
        const now = performance.now();
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;

        // setSerial draws to an offscreen target rather than the Surface, so it
        // could run outside the frame callback — it runs here anyway, because
        // this is the one place that cannot execute before the scene is built
        // or after the cleanup below disposes the device.
        if (serialRef.current !== engraved) {
          engraved = serialRef.current;
          scene.setSerial(engraved);
        }

        const a = animRef.current;
        const reduced = reducedRef.current;

        // The coin leans towards the pointer while there is still metal to
        // move. Once frozen the state is exactly what was minted — letting the
        // camera drift on would leave the card showing a frame that is no
        // longer on screen, which is the one thing this page promises.
        if (a.phase !== "frozen") {
          const [tx, ty] = pointerRef.current;
          const [mx, my] = a.state.mouse;
          a.state = {
            ...a.state,
            mouse: [mx + (tx - mx) * MOUSE_LERP, my + (ty - my) * MOUSE_LERP],
          };
        }

        if (a.phase === "striking") {
          const k = Math.min((now - a.strikeStart) / STRIKE_MS, 1);
          const eased = advance(a.state, "striking", dt, k);
          a.state = {
            ...eased,
            spin: a.spinFrom + (a.spinTo - a.spinFrom) * easeInOutCubic(k),
            time: reduced ? 0 : eased.time,
          };
          if (k >= 1) {
            a.phase = "frozen";
            // time back to 0 here too: the mint render freezes it at 0, and the
            // live coin has to be showing the same frame it is asking for.
            const frozen = canonicalize({ ...a.state, spin: a.spinTo, melt: 0, press: 0, flash: 0, time: 0 });
            a.state = frozen;
            onPhaseChange("frozen");
            const gen = mintGenRef.current;
            void requestMint(frozen).then((result) => {
              if (gen !== mintGenRef.current) {
                // A later strike or remelt started while this request was in
                // flight; its outcome — success or failure — no longer
                // describes the coin on screen.
                if (result) URL.revokeObjectURL(result.imageUrl);
                return;
              }
              if (!result) { onMintFailed(); return; }
              // The card and the live coin have to be the same object: the
              // server struck those sixteen hex digits into its PNG, so they
              // get struck into the face on screen too.
              serialRef.current = result.serial;
              onMinted(result);
            });
          }
        } else {
          const advanced = advance(a.state, a.phase, dt, 0);
          // Reduced motion: no idle spin, and time stays at 0 so the grain is
          // static. The strike itself still plays — it is the answer to a
          // press, not decoration — and the pointer still moves the camera.
          a.state = reduced ? { ...advanced, spin: a.state.spin, time: 0 } : advanced;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onPhaseChange/onMinted/onMintFailed are stable useCallback identities from the page.
  }, []);

  if (fallback) return <StaticFallback reason={fallback} />;
  return <canvas ref={canvasRef} aria-hidden onClick={handleCanvasClick} />;
});
