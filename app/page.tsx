"use client";

// The page is the payoff: the browser rendering the coin live, next to a card
// showing the same coin rendered by a machine with no graphics card. The
// headline, the two indicators and the button live here rather than inside
// CoinCanvas — in jsdom there is no navigator.gpu, so CoinCanvas renders its
// fallback, and the argument this page makes should not depend on the GPU
// starting anyway. The whole page is one client component because the button,
// the two indicators and the canvas share a single state: pressing Acuñar
// triggers the strike inside CoinCanvas, and the server indicator changes
// when /api/mint answers — that cannot be split across a server/client
// boundary.
import { useCallback, useRef, useState } from "react";
import { CoinCanvas, type CoinCanvasHandle, type MintResult } from "../components/CoinCanvas.js";
import { PreviewCard } from "../components/PreviewCard.js";
import type { Phase } from "../lib/coin/state.js";

type ServerStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "done"; readonly renderMs: number };

type Card = { readonly imageUrl: string; readonly serial: string };

const BUTTON_LABEL: Record<Phase, string> = {
  molten: "Acuñar",
  striking: "Acuñando",
  frozen: "Volver a fundir",
};

export default function Page() {
  const coinRef = useRef<CoinCanvasHandle>(null);
  const [phase, setPhase] = useState<Phase>("molten");
  const [server, setServer] = useState<ServerStatus>({ kind: "idle" });
  const [card, setCard] = useState<Card | null>(null);

  const handlePhaseChange = useCallback((next: Phase) => {
    setPhase(next);
    if (next === "molten") {
      setServer({ kind: "idle" });
      // Went back into the melt: drop the previous card and free its blob URL.
      setCard((prev) => {
        if (prev) URL.revokeObjectURL(prev.imageUrl);
        return null;
      });
    }
  }, []);

  const handleMinted = useCallback((result: MintResult) => {
    setServer({ kind: "done", renderMs: result.renderMs });
    // The serial is struck into the metal in uppercase — the 5x7 bitmap font
    // only has uppercase glyphs — while serialFromState returns lowercase hex.
    // Uppercasing here keeps the screen reading the same text as the coin.
    setCard({ imageUrl: result.imageUrl, serial: result.serial.toUpperCase() });
  }, []);

  const handleClick = useCallback(() => {
    if (phase === "molten") coinRef.current?.strike();
    else if (phase === "frozen") coinRef.current?.remelt();
  }, [phase]);

  const serverText =
    server.kind === "idle" ? "servidor · esperando" : `servidor · sin gpu · ${Math.round(server.renderMs)} ms`;

  return (
    <div id="stage">
      <CoinCanvas ref={coinRef} onPhaseChange={handlePhaseChange} onMinted={handleMinted} />

      <div id="head">
        <h1>La miniatura de esta página la dibuja un ordenador sin tarjeta gráfica.</h1>
        <p>No hay ningún PNG aquí. La moneda es una fórmula, y esa misma fórmula corre en dos sitios.</p>
      </div>

      <div id="where">
        <div className="spot warm" data-on="1">
          <i className="pip" />
          <span>
            aquí <em>· tu navegador, en vivo</em>
          </span>
        </div>
        <div className="spot" data-on={server.kind === "done" ? "1" : "0"}>
          <i className="pip" />
          <span>{serverText}</span>
        </div>
      </div>

      <PreviewCard imageUrl={card?.imageUrl ?? null} serial={card?.serial ?? null} visible={card !== null} />

      <div id="foot">
        <button id="act" type="button" disabled={phase === "striking"} onClick={handleClick}>
          {BUTTON_LABEL[phase]}
        </button>
      </div>
    </div>
  );
}
