"use client";

// The argument made visible: the frame the server just rendered, sitting next
// to the same coin the browser is drawing live. The title and the description
// come from lib/meta.ts, the same module app/layout.tsx feeds to Next's
// metadata, so what is drawn here cannot drift from what a scraper renders —
// spec §9 rests on the two being the same card. Text stays in Spanish.
import { useEffect, useState } from "react";
import { SITE_DESCRIPTION, SITE_TITLE } from "../lib/meta";

// There is no location during the server render. The dot is the same stand-in
// the serial line uses below, and it is replaced the moment the component
// mounts — long before a mint makes the card visible — so nothing flashes and
// no domain is claimed that this page was never served from.
const HOST_PLACEHOLDER = "·";

export type PreviewCardProps = {
  /** Object URL for the minted PNG, or null before the first successful mint. */
  imageUrl: string | null;
  /** Already uppercased by the caller — see app/page.tsx. */
  serial: string | null;
  visible: boolean;
};

export function PreviewCard({ imageUrl, serial, visible }: PreviewCardProps) {
  const [host, setHost] = useState(HOST_PLACEHOLDER);
  // Read after mount, not during render: the first client render has to match
  // the server's markup or React discards it as a hydration mismatch.
  useEffect(() => { setHost(window.location.host || HOST_PLACEHOLDER); }, []);

  return (
    <div id="card" className={visible ? "on" : undefined}>
      <div className="frame">
        {/* An <img> with no src re-requests the current page in some browsers,
         *  so the placeholder frame is a plain div until a PNG exists. */}
        {imageUrl ? (
          <img src={imageUrl} alt="Preview generated on minting: the coin as it froze." />
        ) : (
          <div className="img-placeholder" />
        )}
        <div className="meta">
          <div className="dom">{host}</div>
          <div className="ttl">{SITE_TITLE}</div>
          <div className="dsc">{SITE_DESCRIPTION}</div>
        </div>
      </div>
      <div className="under">serial no. <b>{serial ?? "·"}</b></div>
    </div>
  );
}
