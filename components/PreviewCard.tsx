"use client";

// The argument made visible: the frame the server just rendered, sitting next
// to the same coin the browser is drawing live. Text here is the exact copy
// from the design spec (§9) and stays in Spanish.

export type PreviewCardProps = {
  /** Object URL for the minted PNG, or null before the first successful mint. */
  imageUrl: string | null;
  /** Already uppercased by the caller — see app/page.tsx. */
  serial: string | null;
  visible: boolean;
};

export function PreviewCard({ imageUrl, serial, visible }: PreviewCardProps) {
  return (
    <div id="card" className={visible ? "on" : undefined}>
      <div className="frame">
        {/* An <img> with no src re-requests the current page in some browsers,
         *  so the placeholder frame is a plain div until a PNG exists. */}
        {imageUrl ? (
          <img src={imageUrl} alt="Previsualización generada al acuñar: la moneda recién congelada." />
        ) : (
          <div className="img-placeholder" />
        )}
        <div className="meta">
          <div className="dom">dosmaquinas.dev</div>
          <div className="ttl">Dos máquinas, un archivo</div>
          <div className="dsc">El mismo shader dibuja esto en tu navegador y en un servidor que no tiene GPU.</div>
        </div>
      </div>
      <div className="under">nº de serie <b>{serial ?? "·"}</b></div>
    </div>
  );
}
