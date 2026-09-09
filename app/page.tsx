"use client";

// The page is the payoff: the browser rendering the coin live, next to a card
// showing the same coin rendered by a machine with no graphics card. The
// headline, the two indicators and the button live here rather than inside
// CoinCanvas — in jsdom there is no navigator.gpu, so CoinCanvas renders its
// fallback, and the argument this page makes should not depend on the GPU
// starting anyway. The whole page is one client component because the button,
// the two indicators and the canvas share a single state: pressing Mint
// triggers the strike inside CoinCanvas, and the server indicator changes
// when /api/mint answers — that cannot be split across a server/client
// boundary.
import { useCallback, useRef, useState } from "react";
import { CoinCanvas, type CoinCanvasHandle, type MintResult, type Unavailable } from "../components/CoinCanvas";
import { PreviewCard } from "../components/PreviewCard";
import type { Phase } from "../lib/coin/state";

type ServerStatus =
  | { readonly kind: "idle" }
  // Set the instant a strike freezes and the /api/mint request goes out —
  // covers a cold serverless function's ~2.4 s start without looking hung.
  | { readonly kind: "pending" }
  | { readonly kind: "done"; readonly renderMs: number }
  // The request came back non-OK, or failed outright (network error, etc).
  // The coin itself is unaffected — it already froze locally — this only
  // changes what the server indicator says.
  | { readonly kind: "failed" };

type Card = { readonly imageUrl: string; readonly serial: string };

const BUTTON_LABEL: Record<Phase, string> = {
  molten: "Mint",
  striking: "Minting",
  frozen: "Melt it down",
};

export default function Page() {
  const coinRef = useRef<CoinCanvasHandle>(null);
  const [phase, setPhase] = useState<Phase>("molten");
  const [server, setServer] = useState<ServerStatus>({ kind: "idle" });
  const [card, setCard] = useState<Card | null>(null);
  // Set once CoinCanvas has given up on the live render and shown the server's
  // PNG instead. Nothing on this page can strike a coin after that, so the
  // controls that pretend otherwise come off — the headline and the argument
  // stay, which is the whole point of degrading rather than erroring.
  const [live, setLive] = useState(true);

  const handlePhaseChange = useCallback((next: Phase) => {
    setPhase(next);
    if (next === "molten") {
      setServer({ kind: "idle" });
      // Went back into the melt: drop the previous card and free its blob URL.
      setCard((prev) => {
        if (prev) URL.revokeObjectURL(prev.imageUrl);
        return null;
      });
    } else if (next === "frozen") {
      // The strike just finished, which is also when CoinCanvas fires off the
      // /api/mint request — mark the server as working before it answers.
      setServer({ kind: "pending" });
    }
  }, []);

  const handleMinted = useCallback((result: MintResult) => {
    setServer({ kind: "done", renderMs: result.renderMs });
    setCard((prev) => {
      if (prev) URL.revokeObjectURL(prev.imageUrl);
      // The serial is struck into the metal in uppercase — the 5x7 bitmap font
      // only has uppercase glyphs — while serialFromState returns lowercase hex.
      // Uppercasing here keeps the screen reading the same text as the coin.
      return { imageUrl: result.imageUrl, serial: result.serial.toUpperCase() };
    });
  }, []);

  const handleMintFailed = useCallback(() => {
    // The coin stays exactly as it is — frozen, locally rendered — this only
    // tells the server indicator the round trip did not come back.
    setServer({ kind: "failed" });
  }, []);

  const handleUnavailable = useCallback((_reason: Unavailable) => {
    setLive(false);
  }, []);

  const handleClick = useCallback(() => {
    if (phase === "molten") coinRef.current?.strike();
    else if (phase === "frozen") coinRef.current?.remelt();
  }, [phase]);

  const serverText =
    server.kind === "idle" ? "server · waiting"
    : server.kind === "pending" ? "server · rendering…"
    : server.kind === "failed" ? "server · no answer"
    : `server · no gpu · ${Math.round(server.renderMs)} ms`;

  return (
    <div id="stage">
      <CoinCanvas
        ref={coinRef}
        onPhaseChange={handlePhaseChange}
        onMinted={handleMinted}
        onMintFailed={handleMintFailed}
        onUnavailable={handleUnavailable}
      />

      <div id="head">
        <h1>The thumbnail of this page is drawn by a computer with no graphics card.</h1>
        <p>There is no PNG here. The coin is a formula, and that same formula runs in two places.</p>
      </div>

      {/* Both indicators go with the live render, not just the server one: with
       *  the canvas replaced by the server's PNG, "your browser, live" would
       *  be describing something that is not happening either. */}
      {live && (
        <div id="where">
          <div className="spot warm" data-on="1">
            <i className="pip" />
            <span>
              here <em>· your browser, live</em>
            </span>
          </div>
          <div className="spot" data-on={server.kind === "done" ? "1" : "0"}>
            <i className="pip" />
            <span>{serverText}</span>
          </div>
        </div>
      )}

      <PreviewCard imageUrl={card?.imageUrl ?? null} serial={card?.serial ?? null} visible={card !== null} />

      {live && (
        <div id="foot">
          <button id="act" type="button" disabled={phase === "striking"} onClick={handleClick}>
            {BUTTON_LABEL[phase]}
          </button>
        </div>
      )}
    </div>
  );
}
