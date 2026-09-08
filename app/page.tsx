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
import { CoinCanvas, type CoinCanvasHandle, type MintResult } from "../components/CoinCanvas";
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

  const handleClick = useCallback(() => {
    if (phase === "molten") coinRef.current?.strike();
    else if (phase === "frozen") coinRef.current?.remelt();
  }, [phase]);

  const serverText =
    server.kind === "idle" ? "servidor · esperando"
    : server.kind === "pending" ? "servidor · renderizando…"
    : server.kind === "failed" ? "servidor · sin respuesta"
    : `servidor · sin gpu · ${Math.round(server.renderMs)} ms`;

  return (
    <div id="stage">
      <CoinCanvas
        ref={coinRef}
        onPhaseChange={handlePhaseChange}
        onMinted={handleMinted}
        onMintFailed={handleMintFailed}
      />

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
